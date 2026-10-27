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

  // 本命は Claude。失敗（クレジット切れ・障害など）したら Gemini、それも失敗したら記事ベースの簡易版
  let analysis: Analysis | undefined;
  let notice: string | undefined;
  if (config.ANTHROPIC_API_KEY && settings.claude.enabled) {
    analysis = await analyzeWithClaude(
      tweets,
      urlContents,
      config.ANTHROPIC_API_KEY,
      settings,
    ).catch((error: unknown) => {
      console.warn("[Claude] 分析に失敗したため、Gemini で分析します。");
      console.warn("[Claude] fallback reason:", error);
      notice =
        "本日は Claude の分析に失敗したため、Gemini で作成しました。" +
        "続く場合は Anthropic のクレジット残高を確認してください。";
      return undefined;
    });
  } else {
    console.info(
      "[3/4] ANTHROPIC_API_KEY 未設定または claude.enabled=false のため Gemini で分析します",
    );
  }

  analysis ??= await analyzeWithGemini(tweets, urlContents, config);

  console.info("[4/4] LINE へ投稿中...");
  await postToLine(analysis, config, notice);

  console.info("すべての処理が完了しました");
}

async function analyzeWithGemini(
  tweets: RawTweet[],
  urlContents: Map<string, string>,
  config: Config,
): Promise<Analysis> {
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
      return buildFallbackAnalysis(enrichedTweets);
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
