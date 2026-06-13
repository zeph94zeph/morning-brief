import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const NewsItemSchema = z.object({
      title: z.string(),
      details: z.array(z.string()).max(2),
      sources: z.array(z.string()),
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

export const analysisResponseSchema = zodToJsonSchema(AnalysisSchema, {
      target: "openApi3",
      $refStrategy: "none",
});
