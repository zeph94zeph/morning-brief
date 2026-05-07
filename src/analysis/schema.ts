import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const NewsItemSchema = z.object({
    title: z.string(),
    details: z.array(z.string()).max(2),
    sources: z.array(z.string()),
});

export const AnalysisSchema = z.object({
    political_economic_news: z.array(NewsItemSchema).max(3),
    world_news: z.array(NewsItemSchema).max(3),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const analysisResponseSchema = zodToJsonSchema(AnalysisSchema, {
    target: "openApi3",
    $refStrategy: "none",
});
