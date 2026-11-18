// ┌──────────────────────────────────────────────────────┐
// │  読み順ガイド                                        │
// │  この main() の4ステップを上から読めば全体が分かる。  │
// │  詳しく見たくなったら各 import 先にジャンプ。          │
// │  設定を変えたい場合は src/settings.ts を開く。        │
// └──────────────────────────────────────────────────────┘

import { loadConfig, type Config } from "./config.js";
import { settings } from "./settings.js";
import { fetchHomeTimeline } from "./sources/x-timeline.js";
import { fetchRssFeeds } from "./sources/rss-feeds.js";
import { fetchUrlContents } from "./sources/url-content.js";
import { summarizeUrls } from "./analysis/url-summarizer.js";
import { analyzeWithClaude } from "./analysis/claude-analyze.js";
import { analyzeTrends } from "./analysis/analyze.js";
import { buildFallbackAnalysis } from "./analysis/fallback.js";
import { postToLine } from "./delivery/line.js";
import { writeReaderData } from "./delivery/reader.js";
import { UserFacingError } from "./utils/errors.js";
import type { Analysis } from "./analysis/schema.js";
import type { RawTweet } from "./types.js";

async function main() {
  const config = loadConfig();

  let tweets;
  if (config.USE_RSS) {
    console.info("[1/4] RSS フィードから記事を取得中...");
    tweets = await fetchRssFeeds(settings);
  } else {
    console.info("[1/4] X のホームタイムラインを取得中...");
    tweets = await fetchHomeTimeline(config, settings);
    console.info(`→ ツイート ${tweets.length}件 を取得`);
  }

  console.info("[2/4] URL本文を Jina Reader で取得中...");
  const urlContents = await fetchUrlContents(tweets, config, settings);
  console.info(`→ 本文取得済みURL: ${urlContents.size}件`);

  // 分析は Claude だけで行い、失敗したら記事ベースの簡易版を届ける（Gemini には自動で切り替えない）。
  // Gemini は代替案。src/settings.ts の claude.enabled を false にしたときだけ使う。
  const analysis = settings.claude.enabled
    ? await analyzeWithClaudeOrSimple(tweets, urlContents, config)
    : await analyzeWithGemini(tweets, urlContents, config);

  await writeReaderData(analysis, settings);

  console.info("[4/4] LINE へ投稿中...");
  await postToLine(analysis, config, settings.reader.url);

  console.info("すべての処理が完了しました");
}

async function analyzeWithClaudeOrSimple(
  tweets: RawTweet[],
  urlContents: Map<string, string>,
  config: Config,
): Promise<Analysis> {
  try {
    if (!config.ANTHROPIC_API_KEY) {
      throw new UserFacingError(
        "ANTHROPIC_API_KEY が未設定です。GitHub Secrets に登録するか、" +
          "Gemini で分析する場合は src/settings.ts の claude.enabled を false にしてください。",
      );
    }
    return await analyzeWithClaude(
      tweets,
      urlContents,
      config.ANTHROPIC_API_KEY,
      settings,
    );
  } catch (error: unknown) {
    console.warn("[Claude] 分析に失敗したため、RSS記事ベースの簡易版を配信します。");
    console.warn("[Claude] fallback reason:", error);
    return buildFallbackAnalysis(
      tweets.map((t) => ({
        ...t,
        enrichedText: t.quotedText ? `${t.text}\n${t.quotedText}` : t.text,
      })),
      "本日は Claude の分析に失敗したため、記事の見出しだけの簡易版です。" +
        "続く場合は Anthropic のクレジット残高を確認してください。",
    );
  }
}

/** 代替案。settings.claude.enabled=false のときだけ使う */
async function analyzeWithGemini(
  tweets: RawTweet[],
  urlContents: Map<string, string>,
  config: Config,
): Promise<Analysis> {
  console.info("[3/4] settings.claude.enabled=false のため Gemini（代替案）で分析します");
  if (!config.GEMINI_API_KEY) {
    throw new UserFacingError(
      "Gemini で分析する設定（claude.enabled=false）ですが、GEMINI_API_KEY が未設定です。",
    );
  }
  const enrichedTweets = await summarizeUrls(
    tweets,
    urlContents,
    config,
    settings,
  );
  return analyzeTrends(enrichedTweets, config, settings).catch(
    (error: unknown) => {
      console.warn(
        "[Gemini] 分析に失敗したため、RSS記事ベースの簡易版を配信します。",
      );
      console.warn("[Gemini] fallback reason:", error);
      return buildFallbackAnalysis(
        enrichedTweets,
        "本日は Gemini の分析に失敗したため、記事の見出しだけの簡易版です。",
      );
    },
  );
}

main().catch((error: unknown) => {
  if (error instanceof UserFacingError) {
    console.error(`\n[USER-FACING] ${error.message}`);
    console.error("対処法の詳細は docs/troubleshooting.md を参照してください。");
    if (error.cause) {
      console.error("[DETAIL]", error.cause);
    }
  } else {
    console.error("\n[INTERNAL] Unexpected error:", error);
  }
  process.exit(1);
});
