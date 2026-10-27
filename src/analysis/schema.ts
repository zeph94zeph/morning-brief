import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const NewsItemSchema = z.object({
      title: z.string(),
      details: z.array(z.string()).max(2),
      sources: z.array(z.string()),
      /** 読み上げ用の媒体名（例: "NHK", "ロイター"）。URL は sources に入れる */
      source_names: z.array(z.string()).default([]),
});

const ToolRecommendationSchema = z.object({
  tool: z.string(),
  verdict: z.enum(["推奨", "保留", "注視"]),
  reason: z.string(),
  sources: z.array(z.string()),
  category: z.enum(["watched", "discovered"]),
});

export type ToolRecommendation = z.infer<typeof ToolRecommendationSchema>;

export const AnalysisSchema = z.object({
      political_economic_news: z.array(NewsItemSchema).max(3),
      world_news: z.array(NewsItemSchema).max(3),
      ai_news: z.array(NewsItemSchema).max(3),
      tool_recommendations: z.array(ToolRecommendationSchema).default([]),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

/** Gemini の responseSchema 用 */
export const analysisResponseSchema = zodToJsonSchema(AnalysisSchema, {
      target: "openApi3",
      $refStrategy: "none",
});

/**
 * Claude の構造化出力用。
 * API が受け付けない制約（maxItems・default など）を外し、全項目を必須にする。
 * 件数の上限は受け取った後に AnalysisSchema.parse で確かめる。
 */
export const claudeAnalysisJsonSchema = toStrictJsonSchema(
  zodToJsonSchema(AnalysisSchema, { $refStrategy: "none" }),
);

function toStrictJsonSchema(node: unknown): Record<string, unknown> {
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = { type: src.type };
  if (src.enum) out.enum = src.enum;
  if (src.type === "array") out.items = toStrictJsonSchema(src.items);
  if (src.type === "object") {
    const props = src.properties as Record<string, unknown>;
    out.properties = Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, toStrictJsonSchema(v)]),
    );
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}
