import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserFacingError } from "../utils/errors.js";
import type { Settings } from "../settings.js";
import type { RawTweet } from "../types.js";

const { mockStream } = vi.hoisted(() => ({ mockStream: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { stream: mockStream } };
  },
}));

const { analyzeWithClaude, buildResearchPrompt } = await import("./claude-analyze.js");

const settings: Settings = {
  schedule: { lookbackHours: 24, maxTweets: 100 },
  urlContent: {
    enabled: true,
    maxUrls: 36,
    timeoutMs: 5000,
    parallelism: 5,
    maxSummaryChars: 200,
    inputCharsMultiplier: 20,
  },
  claude: {
    enabled: true,
    model: "claude-opus-5-5",
    effort: "high",
    formatEffort: "medium",
    maxArticleChars: 10,
    maxWebSearches: 5,
  },
  analysis: {
    urlSummaryModel: "gemini-2.5-flash",
    trendAnalysisModel: "gemini-2.5-flash",
    temperature: 0,
    maxGeminiAttempts: 1,
    geminiRetryDelayMs: 0,
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

const tweets: RawTweet[] = [
  {
    authorId: "NHK 政治",
    text: "政府が新方針\n概要",
    createdAt: "2026-10-27T00:00:00.000Z",
    url: "https://example.com/nhk/1",
  },
];
const urlContents = new Map([["https://example.com/nhk/1", "0123456789ABCDEF"]]);

const analysisJson = {
  political_economic_news: [
    {
      title: "政府が新方針を発表",
      details: ["詳細"],
      sources: ["https://example.com/nhk/1"],
      source_names: ["NHK"],
    },
  ],
  world_news: [],
  ai_news: [],
  tool_recommendations: [],
};

/** stream().finalMessage() が返す最小限の BetaMessage */
function reply(text: string, stop_reason = "end_turn", extra: object = {}) {
  return {
    finalMessage: () =>
      Promise.resolve({
        model: "claude-opus-5-5",
        content: [{ type: "text", text }],
        stop_reason,
        stop_details: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        ...extra,
      }),
  };
}

beforeEach(() => {
  mockStream.mockReset();
});

describe("analyzeWithClaude", () => {
  it("調査メモを書いてから JSON に整形する", async () => {
    mockStream
      .mockReturnValueOnce(reply("調査メモ"))
      .mockReturnValueOnce(reply(JSON.stringify(analysisJson)));

    const result = await analyzeWithClaude(tweets, urlContents, "key", settings);

    expect(result).toEqual(analysisJson);
    const [research, format] = mockStream.mock.calls.map((c) => c[0]);
    expect(research.tools).toEqual([
      expect.objectContaining({ type: "web_search_20260209", max_uses: 5 }),
    ]);
    expect(research.output_config).toEqual({ effort: "high" });
    expect(format.tools).toBeUndefined();
    expect(format.output_config.effort).toBe("medium");
    expect(format.output_config.format.type).toBe("json_schema");
    expect(format.messages[0].content).toContain("調査メモ");
  });

  it("pause_turn のときは assistant の内容を返して再開し、メモをつなげる", async () => {
    mockStream
      .mockReturnValueOnce(reply("前半", "pause_turn"))
      .mockReturnValueOnce(reply("後半"))
      .mockReturnValueOnce(reply(JSON.stringify(analysisJson)));

    await analyzeWithClaude(tweets, urlContents, "key", settings);

    const resumed = mockStream.mock.calls[1]![0];
    expect(resumed.messages).toHaveLength(2);
    expect(resumed.messages[1].role).toBe("assistant");
    expect(mockStream.mock.calls[2]![0].messages[0].content).toContain("前半後半");
  });

  it("maxWebSearches=0 なら検索ツールを渡さない", async () => {
    mockStream
      .mockReturnValueOnce(reply("メモ"))
      .mockReturnValueOnce(reply(JSON.stringify(analysisJson)));

    await analyzeWithClaude(tweets, urlContents, "key", {
      ...settings,
      claude: { ...settings.claude, maxWebSearches: 0 },
    });

    expect(mockStream.mock.calls[0]![0].tools).toBeUndefined();
  });

  it("refusal は UserFacingError にする", async () => {
    mockStream.mockReturnValueOnce(
      reply("", "refusal", { stop_details: { type: "refusal", category: "cyber" } }),
    );

    await expect(
      analyzeWithClaude(tweets, urlContents, "key", settings),
    ).rejects.toThrow(UserFacingError);
  });

  it("件数が上限を超えたら切り詰める（Gemini に落とさない）", async () => {
    const item = analysisJson.political_economic_news[0]!;
    const tooMany = {
      ...analysisJson,
      world_news: [1, 2, 3, 4].map(() => ({ ...item, details: ["a", "b", "c"] })),
    };
    mockStream
      .mockReturnValueOnce(reply("メモ"))
      .mockReturnValueOnce(reply(JSON.stringify(tooMany)));

    const result = await analyzeWithClaude(tweets, urlContents, "key", settings);
    expect(result.world_news).toHaveLength(3);
    expect(result.world_news[0]!.details).toEqual(["a", "b"]);
  });

  it("整形結果が JSON でなければ UserFacingError にする", async () => {
    mockStream
      .mockReturnValueOnce(reply("メモ"))
      .mockReturnValueOnce(reply("not json"));

    await expect(
      analyzeWithClaude(tweets, urlContents, "key", settings),
    ).rejects.toThrow(UserFacingError);
  });
});

describe("buildResearchPrompt", () => {
  it("本文は maxArticleChars で切って記事ごとに渡す", () => {
    const prompt = buildResearchPrompt(tweets, urlContents, "ctx", settings);
    expect(prompt).toContain('<article source="NHK 政治"');
    expect(prompt).toContain("<body>\n0123456789\n</body>");
    expect(prompt).not.toContain("ABCDEF");
  });
});
