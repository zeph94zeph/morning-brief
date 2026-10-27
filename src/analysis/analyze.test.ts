import { describe, it, expect, vi } from "vitest";
import { UserFacingError } from "../utils/errors.js";
import type { Settings } from "../settings.js";
import type { Config } from "../config.js";
import type { EnrichedTweet } from "../types.js";

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

const { analyzeTrends } = await import("./analyze.js");

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
    enabled: false,
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

const sampleTweets: EnrichedTweet[] = [
  {
    authorId: "test",
    text: "AI news",
    createdAt: "2026-04-16T10:00:00.000Z",
    url: "https://x.com/test/status/1",
    enrichedText: "AI news",
  },
];

const validResponse = {
  political_economic_news: [
    {
      title: "Test News",
      details: ["Detail"],
      sources: ["https://x.com/test/status/1"],
    },
  ],
  world_news: [],
  ai_news: [{ title: "GPT新モデル発表", details: ["性能大幅向上"], sources: [] }],
  tool_recommendations: [],
};

describe("analyzeTrends", () => {
  it("正常な JSON を返すと Analysis を返す", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(validResponse),
      candidates: [{ finishReason: "STOP" }],
    });

    const result = await analyzeTrends(sampleTweets, mockConfig, mockSettings);
    expect(result.political_economic_news).toHaveLength(1);
    expect(result.political_economic_news[0]!.title).toBe("Test News");
    expect(result.ai_news).toHaveLength(1);
    expect(result.ai_news[0]!.title).toBe("GPT新モデル発表");
  });

  it("SAFETY finishReason で UserFacingError をスローする", async () => {
    mockGenerateContent.mockResolvedValue({
      text: undefined,
      candidates: [{ finishReason: "SAFETY" }],
    });

    await expect(
      analyzeTrends(sampleTweets, mockConfig, mockSettings),
    ).rejects.toThrow(UserFacingError);
  });

  it("retries 503 according to settings", async () => {
    vi.useFakeTimers();
    const retrySettings: Settings = {
      ...mockSettings,
      analysis: {
        ...mockSettings.analysis,
        maxGeminiAttempts: 3,
        geminiRetryDelayMs: 10,
      },
    };

    mockGenerateContent
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 503 }))
      .mockResolvedValueOnce({
        text: JSON.stringify(validResponse),
        candidates: [{ finishReason: "STOP" }],
      });

    const resultPromise = analyzeTrends(sampleTweets, mockConfig, retrySettings);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);

    await expect(resultPromise).resolves.toMatchObject(validResponse);
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
