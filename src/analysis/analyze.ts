import { GoogleGenAI } from "@google/genai";
import {
  AnalysisSchema,
  analysisResponseSchema,
  type Analysis,
} from "./schema.js";
import { TREND_ANALYSIS_PROMPT } from "./prompts.js";
import type { Config } from "../config.js";
import type { Settings, ToolAdvisorSettings } from "../settings.js";
import type { EnrichedTweet } from "../types.js";
import { UserFacingError } from "../utils/errors.js";
import { cleanText } from "../utils/post-optimizer.js";
import { detailRule } from "./claude-analyze.js";

export async function analyzeTrends(
  tweets: EnrichedTweet[],
  config: Config,
  settings: Settings,
): Promise<Analysis> {
  console.info("[3b/4] タイムライン全体を Gemini Pro で分析中...");
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

  const tweetsForPrompt = Object.entries(groupByAuthor(tweets)).map(
    ([author, items]) => ({
      author,
      posts: items.map((t) => ({
        text: cleanText(t.enrichedText),
        url: t.url,
      })),
    }),
  );

  const toolAdvisorContext = buildToolAdvisorContext(settings.toolAdvisor);
  const prompt = TREND_ANALYSIS_PROMPT
    .replace("{json_data}", JSON.stringify(tweetsForPrompt, null, 2))
    .replace("{tool_advisor_context}", toolAdvisorContext)
    .replace("{detail_rule}", detailRule(settings));

  const res = await retryOnTransient(
    () =>
      ai.models.generateContent({
        model: settings.analysis.trendAnalysisModel,
        contents: prompt,
        config: {
          temperature: settings.analysis.temperature,
          responseMimeType: "application/json",
          responseSchema: analysisResponseSchema as Record<string, unknown>,
        },
      }),
    settings.analysis.maxGeminiAttempts,
    settings.analysis.geminiRetryDelayMs,
  );

  const candidate = (res as { candidates?: Array<{ finishReason?: string }> })
    .candidates?.[0];

  if (candidate?.finishReason === "SAFETY") {
    throw new UserFacingError(
      "Geminiのセーフティフィルタで分析結果がブロックされました。ツイート内容を減らして再実行してください。",
    );
  }

  const text = res.text;
  if (!text) {
    throw new UserFacingError("Geminiから空の応答が返りました。");
  }

  try {
    return AnalysisSchema.parse(JSON.parse(text));
  } catch (cause) {
    throw new UserFacingError(
      "Geminiの応答をパースできませんでした。再実行してみてください。",
      { cause },
    );
  }
}

/** 503 / 429 など一時的エラーは最大6回まで試行する */
async function retryOnTransient<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  retryDelayMs: number,
): Promise<T> {
  const retryableStatuses = new Set([429, 503]);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (retryableStatuses.has(status ?? 0) && attempt < maxAttempts) {
        const waitMs = attempt * retryDelayMs;
        console.warn(
          `[Gemini] ${status} エラー。${waitMs / 1000}秒後にリトライ (${attempt}/${maxAttempts})...`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

export function buildToolAdvisorContext(advisor: ToolAdvisorSettings): string {
  if (!advisor.enabled) {
    return "AIツール判断は無効。tool_recommendations は空配列 [] にすること。";
  }
  return [
    `固定ウォッチ対象: ${advisor.watchedTools.join(", ")}`,
    `発見枠: ${advisor.discovery.enabled ? advisor.discovery.description : "無効"}`,
    `最大件数: ${advisor.maxRecommendations}件`,
    `ユーザー用途: ${advisor.userProfile.primaryUseCases.join(", ")}`,
    `制約: ${advisor.userProfile.constraints.join(", ")}`,
  ].join("\n");
}

function groupByAuthor(
  tweets: EnrichedTweet[],
): Record<string, EnrichedTweet[]> {
  const groups: Record<string, EnrichedTweet[]> = {};
  for (const tweet of tweets) {
    const key = tweet.authorId || "unknown";
    (groups[key] ??= []).push(tweet);
  }
  return groups;
}
