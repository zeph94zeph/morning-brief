import { describe, expect, it } from "vitest";
import { AnalysisSchema } from "./schema.js";
import { buildFallbackAnalysis } from "./fallback.js";
import type { EnrichedTweet } from "../types.js";

const tweets: EnrichedTweet[] = [
  {
    authorId: "OpenAI Blog",
    text: "AI title\nAI detail",
    enrichedText: "AI title\nAI detail",
    createdAt: "2026-06-12T00:00:00.000Z",
    url: "https://example.com/ai",
  },
  {
    authorId: "BBC Japan",
    text: "World title\nWorld detail",
    enrichedText: "World title\nWorld detail",
    createdAt: "2026-06-12T00:00:00.000Z",
    url: "https://example.com/world",
  },
  {
    authorId: "NHK",
    text: "Politics title\nPolitics detail",
    enrichedText: "Politics title\nPolitics detail",
    createdAt: "2026-06-12T00:00:00.000Z",
    url: "https://example.com/politics",
  },
];

describe("buildFallbackAnalysis", () => {
  it("builds schema-compatible fallback analysis", () => {
    const analysis = buildFallbackAnalysis(tweets);

    expect(() => AnalysisSchema.parse(analysis)).not.toThrow();
    expect(analysis.ai_news[0]?.title).toBe("AI title");
    expect(analysis.world_news[0]?.title).toBe("World title");
    expect(analysis.political_economic_news[0]?.title).toBe("Politics title");
  });

  it("adds a fallback notice to the first item", () => {
    const analysis = buildFallbackAnalysis(tweets);
    const firstDetail = analysis.political_economic_news[0]?.details[0];

    expect(firstDetail).toContain("Gemini");
    expect(firstDetail).toContain("簡易配信");
  });
});
