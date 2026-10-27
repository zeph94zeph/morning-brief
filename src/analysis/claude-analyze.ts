import Anthropic from "@anthropic-ai/sdk";
import {
  AnalysisSchema,
  claudeAnalysisJsonSchema,
  type Analysis,
} from "./schema.js";
import { CLAUDE_FORMAT_SYSTEM, CLAUDE_RESEARCH_SYSTEM } from "./prompts.js";
import { buildToolAdvisorContext } from "./analyze.js";
import type { Settings } from "../settings.js";
import type { RawTweet } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { extractUrls } from "../utils/post-optimizer.js";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;

// 安全フィルタで断られたとき、API 側で別モデルに引き継がせる
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
// 検索が長引くと API が turn を一時停止する（pause_turn）。再開する回数の上限
const MAX_PAUSE_RESUMES = 5;

/**
 * Claude で2段階の分析をする。
 *   1. 調査: 記事本文を読み、ウェブ検索で裏付けを取りながら調査メモを書く
 *   2. 整形: 調査メモを配信用の JSON（Analysis）に整える
 * ウェブ検索の結果には必ず引用が付くため、JSON の構造化出力とは分けている。
 */
export async function analyzeWithClaude(
  tweets: RawTweet[],
  urlContents: Map<string, string>,
  apiKey: string,
  settings: Settings,
): Promise<Analysis> {
  const client = new Anthropic({ apiKey, maxRetries: 4 });
  const toolAdvisorContext = buildToolAdvisorContext(settings.toolAdvisor);

  const withBody = tweets.filter((t) => findBodies(t, urlContents).length > 0).length;
  console.info(
    `[3a/4] ${settings.claude.model} が記事 ${tweets.length}件（本文あり ${withBody}件）を読み、` +
      `ウェブ検索（最大${settings.claude.maxWebSearches}回）で裏付け中...`,
  );
  const memo = await research(
    client,
    buildResearchPrompt(tweets, urlContents, toolAdvisorContext, settings),
    settings,
  );

  console.info("[3b/4] 調査メモを配信用に整形中...");
  return format(client, memo, toolAdvisorContext, settings);
}

async function research(
  client: Anthropic,
  userPrompt: string,
  settings: Settings,
): Promise<string> {
  const { claude } = settings;
  const tools: Anthropic.Beta.Messages.BetaToolUnion[] | undefined =
    claude.maxWebSearches > 0
      ? [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: claude.maxWebSearches,
            user_location: {
              type: "approximate",
              country: "JP",
              timezone: "Asia/Tokyo",
            },
          },
        ]
      : undefined;

  const messages: BetaMessageParam[] = [{ role: "user", content: userPrompt }];
  const memoParts: string[] = [];

  for (let resumes = 0; ; resumes++) {
    const msg = await client.beta.messages
      .stream({
        model: claude.model,
        max_tokens: 64000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system: CLAUDE_RESEARCH_SYSTEM,
        output_config: { effort: claude.effort },
        // 検索のたびに API 内部で記事一式を読み直すため、キャッシュしないと
        // 入力トークンが検索回数ぶん積み上がる（初回実行で約150万トークン）。
        // キャッシュがあれば2回目以降の読み直しは通常の1/20の料金になる。
        cache_control: { type: "ephemeral" },
        tools,
        messages,
      })
      .finalMessage();

    logUsage("調査", msg, settings);
    assertFinished(msg);
    memoParts.push(collectText(msg));

    if (msg.stop_reason !== "pause_turn") break;
    if (resumes >= MAX_PAUSE_RESUMES) {
      throw new UserFacingError(
        `Claude の調査が${MAX_PAUSE_RESUMES}回再開しても終わりませんでした。` +
          "src/settings.ts の claude.maxWebSearches を減らしてください。",
      );
    }
    // 一時停止した assistant の内容をそのまま返すと、API が続きから再開する
    messages.push({ role: "assistant", content: msg.content });
  }

  const memo = memoParts.join("").trim();
  if (!memo) {
    throw new UserFacingError("Claude の調査メモが空でした。");
  }
  return memo;
}

async function format(
  client: Anthropic,
  memo: string,
  toolAdvisorContext: string,
  settings: Settings,
): Promise<Analysis> {
  const { claude } = settings;
  const msg = await client.beta.messages
    .stream({
      model: claude.model,
      max_tokens: 32000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: CLAUDE_FORMAT_SYSTEM,
      output_config: {
        effort: claude.formatEffort,
        format: { type: "json_schema", schema: claudeAnalysisJsonSchema },
      },
      messages: [
        {
          role: "user",
          content:
            `【AIツール判断の設定】\n${toolAdvisorContext}\n\n` +
            `【調査メモ】\n<memo>\n${memo}\n</memo>`,
        },
      ],
    })
    .finalMessage();

  logUsage("整形", msg, settings);
  assertFinished(msg);

  try {
    return AnalysisSchema.parse(clampCounts(JSON.parse(collectText(msg))));
  } catch (cause) {
    throw new UserFacingError(
      "Claude の応答をパースできませんでした。再実行してみてください。",
      { cause },
    );
  }
}

/** 記事一覧を Claude に渡す形にする。本文が取れた記事は本文ごと渡す */
export function buildResearchPrompt(
  tweets: RawTweet[],
  urlContents: Map<string, string>,
  toolAdvisorContext: string,
  settings: Settings,
): string {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const articles = tweets.map((t) => {
    const rss = t.quotedText ? `${t.text}\n${t.quotedText}` : t.text;
    const bodies = findBodies(t, urlContents).map(
      (body) =>
        `<body>\n${body.slice(0, settings.claude.maxArticleChars)}\n</body>`,
    );
    return [
      `<article source="${t.authorId}" published="${t.createdAt}" url="${t.url}">`,
      `<rss>\n${rss}\n</rss>`,
      ...bodies,
      "</article>",
    ].join("\n");
  });

  return [
    `現在時刻（日本時間）: ${now}`,
    "",
    "【AIツール判断の設定】",
    toolAdvisorContext,
    "",
    "【記事一覧】",
    "<articles>",
    ...articles,
    "</articles>",
  ].join("\n");
}

/** fetchUrlContents と同じ集め方（本文中のURL + RawTweet.url）で本文を引く */
function findBodies(tweet: RawTweet, urlContents: Map<string, string>): string[] {
  const urls = new Set([...extractUrls(tweet.text), ...(tweet.url ? [tweet.url] : [])]);
  return [...urls]
    .map((u) => urlContents.get(u))
    .filter((body): body is string => Boolean(body));
}

/**
 * 構造化出力では件数の上限を指定できないため、多すぎた分はここで切る。
 * 1件多いだけで Gemini に落ちるのはもったいない。
 */
function clampCounts(raw: unknown): unknown {
  const data = raw as Record<string, unknown>;
  for (const key of ["political_economic_news", "world_news", "ai_news"]) {
    const items = data[key];
    if (!Array.isArray(items)) continue;
    data[key] = items.slice(0, 3).map((item: Record<string, unknown>) => ({
      ...item,
      details: Array.isArray(item.details) ? item.details.slice(0, 2) : item.details,
    }));
  }
  return data;
}

function collectText(msg: BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function assertFinished(msg: BetaMessage): void {
  if (msg.stop_reason === "refusal") {
    throw new UserFacingError(
      `Claude が安全上の理由で応答を断りました（${msg.stop_details?.category ?? "分類なし"}）。`,
    );
  }
  if (msg.stop_reason === "max_tokens") {
    throw new UserFacingError(
      "Claude の出力が上限に達して途中で切れました。src/settings.ts の claude.effort を下げてください。",
    );
  }
}

/** クレジットの減り方を追えるように、トークン数・検索回数・概算費用を毎回出す */
function logUsage(step: string, msg: BetaMessage, settings: Settings): void {
  const u = msg.usage;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  const p = settings.claude.pricing;
  const usd =
    (u.input_tokens * p.inputPerMTok +
      cacheWrite * p.cacheWritePerMTok +
      cacheRead * p.cacheReadPerMTok +
      u.output_tokens * p.outputPerMTok) /
      1_000_000 +
    searches * p.perWebSearch;
  console.info(
    `→ [Claude ${step}] model=${msg.model} 入力 ${u.input_tokens}` +
      ` / キャッシュ書込 ${cacheWrite} / キャッシュ読込 ${cacheRead}` +
      ` / 出力 ${u.output_tokens} トークン` +
      (searches > 0 ? ` / 検索 ${searches}回` : "") +
      ` / 概算 $${usd.toFixed(2)}`,
  );
}
