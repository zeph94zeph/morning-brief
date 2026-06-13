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
    timeoutMs: 5000,
    parallelism: 5,
    maxSummaryChars: 200,
    inputCharsMultiplier: 20,
  },
  analysis: {
    urlSummaryModel: "gemini-2.5-flash",
    trendAnalysisModel: "gemini-2.5-pro",
    temperature: 0,
    maxGeminiAttempts: 6,
    geminiRetryDelayMs: 30_000,
  },
  rss: { feeds: [] },
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
});
