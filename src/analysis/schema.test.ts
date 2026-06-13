import { describe, it, expect } from "vitest";
import { AnalysisSchema, analysisResponseSchema } from "./schema.js";

const validAnalysis = {
  political_economic_news: [
    {
      title: "政府が経済対策を発表",
      details: ["総額10兆円規模の対策", "中小企業支援が柱"],
      sources: ["https://example.com/news/1"],
    },
  ],
  world_news: [
    {
      title: "米中首脳会談が開催",
      details: ["貿易問題で協議", "共同声明を発表"],
      sources: ["https://example.com/news/2"],
    },
  ],
  ai_news: [
    {
      title: "GPT新モデル発表",
      details: ["性能大幅向上"],
      sources: ["https://example.com/news/3"],
    },
  ],
};

describe("AnalysisSchema", () => {
  it("正常なデータをパースできる", () => {
    const result = AnalysisSchema.parse(validAnalysis);
    expect(result.political_economic_news).toHaveLength(1);
    expect(result.world_news).toHaveLength(1);
    expect(result.ai_news).toHaveLength(1);
  });

  it("空セクションを許容する", () => {
    const result = AnalysisSchema.parse({
      political_economic_news: [],
      world_news: [],
      ai_news: [],
    });
    expect(result.political_economic_news).toHaveLength(0);
  });

  it("必須フィールドが欠けるとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({ political_economic_news: [], world_news: [] }),
    ).toThrow();
  });

  it("details が2つを超えるとエラー", () => {
    expect(() =>
      AnalysisSchema.parse({
        political_economic_news: [
          {
            title: "test",
            details: ["1", "2", "3"],
            sources: [],
          },
        ],
        world_news: [],
        ai_news: [],
      }),
    ).toThrow();
  });

  it("details が2つちょうどは許容する", () => {
    const result = AnalysisSchema.parse({
      political_economic_news: [
        {
          title: "test",
          details: ["1", "2"],
          sources: [],
        },
      ],
      world_news: [],
      ai_news: [],
    });
    expect(result.political_economic_news[0]!.details).toHaveLength(2);
  });
});

describe("analysisResponseSchema", () => {
  it("JSON Schema オブジェクトが生成される", () => {
    expect(analysisResponseSchema).toBeDefined();
    expect(typeof analysisResponseSchema).toBe("object");
  });

  it("4つのセクションプロパティを含む", () => {
    const schema = analysisResponseSchema as Record<string, unknown>;
    const props = (schema as { properties?: Record<string, unknown> })
      .properties;
    expect(props).toBeDefined();
    expect(props).toHaveProperty("political_economic_news");
    expect(props).toHaveProperty("world_news");
    expect(props).toHaveProperty("ai_news");
    expect(props).toHaveProperty("tool_recommendations");
  });
});
