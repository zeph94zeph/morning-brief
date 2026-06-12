import type { Analysis } from "./schema.js";
import type { EnrichedTweet } from "../types.js";

const AI_SOURCE_PATTERNS = [
  /ai/i,
  /techcrunch/i,
  /venturebeat/i,
  /mit/i,
  /openai/i,
  /google/i,
  /hugging\s*face/i,
];

const WORLD_SOURCE_PATTERNS = [/bbc/i, /cnn/i, /jiji/i];

export function buildFallbackAnalysis(tweets: EnrichedTweet[]): Analysis {
  const analysis: Analysis = {
    political_economic_news: [],
    world_news: [],
    ai_news: [],
  };

  for (const tweet of tweets) {
    const bucket = selectBucket(tweet.authorId);
    if (analysis[bucket].length >= 3) continue;

    const { title, detail } = splitTitleAndDetail(tweet.enrichedText);
    analysis[bucket].push({
      title,
      details: [detail],
      sources: [tweet.url],
    });
  }

  addFallbackNotice(analysis);
  return analysis;
}

function selectBucket(
  sourceName: string,
): keyof Pick<Analysis, "political_economic_news" | "world_news" | "ai_news"> {
  if (AI_SOURCE_PATTERNS.some((pattern) => pattern.test(sourceName))) {
    return "ai_news";
  }
  if (WORLD_SOURCE_PATTERNS.some((pattern) => pattern.test(sourceName))) {
    return "world_news";
  }
  return "political_economic_news";
}

function splitTitleAndDetail(text: string): { title: string; detail: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] ?? "RSSニュース";
  const detail = lines.slice(1).join(" ").slice(0, 180);

  return {
    title: title.slice(0, 120),
    detail:
      detail ||
      "Gemini分析が混雑などで失敗したため、RSS記事を新着順で簡易配信しています。",
  };
}

function addFallbackNotice(analysis: Analysis): void {
  const notice =
    "Gemini分析が混雑などで失敗したため、RSS記事を新着順で簡易配信しています。";
  const buckets = [
    analysis.political_economic_news,
    analysis.world_news,
    analysis.ai_news,
  ];
  const firstBucket = buckets.find((bucket) => bucket.length > 0);
  const firstItem = firstBucket?.[0];
  if (!firstItem) {
    analysis.ai_news.push({
      title: "Gemini分析混雑のため簡易版を配信できませんでした",
      details: [notice],
      sources: [],
    });
    return;
  }

  firstItem.details = [notice, ...firstItem.details].slice(0, 2);
}
