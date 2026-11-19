import { describe, it, expect, vi } from "vitest";
import type { Settings } from "../settings.js";
import type { Config } from "../config.js";
import type { RawTweet } from "../types.js";

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

const { summarizeUrls } = await import("./url-summarizer.js");

const mockConfig: Config = {
  JINA_API_KEY: "test",
  GEMINI_API_KEY: "test",
  LINE_CHANNEL_ACCESS_TOKEN: "test-token",
  LINE_USER_ID: "U123",
  USE_SAMPLE_DATA: true,
  USE_RSS: false,
};

const mockSettings: Settings = {
  schedule: { lookbackHours: 24, maxTweets: 100 },
  urlContent: {
    enabled: true,
    maxUrls: 50,
    timeoutMs: 5000,
    parallelism: 5,
    maxSummaryChars: 200,
    inputCharsMultiplier: 20,
  },
  claude: {
    enabled: false,
    model: "claude-opus-5-5",
    effort: "high",
    formatEffort: "medium",
    maxArticleChars: 8000,
    maxWebSearches: 0,
    pricing: {
      inputPerMTok: 4,
      cacheWritePerMTok: 5,
      cacheReadPerMTok: 0.2,
      outputPerMTok: 20,
      perWebSearch: 0.01,
    },
  },
  analysis: {
    urlSummaryModel: "gemini-2.5-flash",
    trendAnalysisModel: "gemini-2.5-pro",
    temperature: 0,
    maxGeminiAttempts: 6,
    geminiRetryDelayMs: 30_000,
  },
  rss: { feeds: [] },
  brief: { detailsPerItem: 1, charsPerDetail: 100 },
  reader: {
    url: "",
    outputDir: "site",
    tts: { enabled: false, model: "tts", voice: "Kore", maxCharsPerRequest: 1500 },
  },
  toolAdvisor: {
    enabled: false,
    maxRecommendations: 5,
    watchedTools: [],
    discovery: { enabled: false, description: "" },
    userProfile: { primaryUseCases: [], constraints: [] },
  },
};

const sampleTweets: RawTweet[] = [
  {
    authorId: "user1",
    text: "Check out https://example.com/article",
    createdAt: "2026-04-16T10:00:00.000Z",
    url: "https://x.com/user1/status/1",
  },
];

describe("summarizeUrls", () => {
  it("urlContents が空のとき元テキストをそのまま返す", async () => {
    const result = await summarizeUrls(
      sampleTweets,
      new Map(),
      mockConfig,
      mockSettings,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.enrichedText).toBe(
      "Check out https://example.com/article",
    );
  });

  it("urlContents があるとき [補足情報] を挿入する", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "記事の要約テキスト",
    });

    const urlContents = new Map([
      ["https://example.com/article", "Full article body text here..."],
    ]);

    const result = await summarizeUrls(
      sampleTweets,
      urlContents,
      mockConfig,
      mockSettings,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.enrichedText).toContain("[補足情報]");
    expect(result[0]!.enrichedText).toContain("記事の要約テキスト");
  });

  it("RSS記事は url フィールドをキーに要約を結び付ける", async () => {
    mockGenerateContent.mockResolvedValue({ text: "RSS記事の要約" });

    // RSS ルートでは本文にURLがなく、記事URLは url フィールドに入る
    const rssItems: RawTweet[] = [
      {
        authorId: "NHK 経済",
        text: "見出し\n本文にURLを含まない抄録",
        createdAt: "2026-04-16T10:00:00.000Z",
        url: "https://example.com/news/1",
      },
    ];
    const urlContents = new Map([
      ["https://example.com/news/1", "記事の全文..."],
    ]);

    const result = await summarizeUrls(
      rssItems,
      urlContents,
      mockConfig,
      mockSettings,
    );
    expect(result[0]!.enrichedText).toContain("[補足情報]: RSS記事の要約");
  });

  it("同じURLが本文と url の両方にあっても補足情報は1回だけ", async () => {
    mockGenerateContent.mockResolvedValue({ text: "要約" });

    const items: RawTweet[] = [
      {
        authorId: "blog",
        text: "詳細はこちら https://example.com/post",
        createdAt: "2026-04-16T10:00:00.000Z",
        url: "https://example.com/post",
      },
    ];
    const urlContents = new Map([["https://example.com/post", "本文..."]]);

    const result = await summarizeUrls(
      items,
      urlContents,
      mockConfig,
      mockSettings,
    );
    expect(result[0]!.enrichedText.match(/\[補足情報\]/g)).toHaveLength(1);
  });
});
