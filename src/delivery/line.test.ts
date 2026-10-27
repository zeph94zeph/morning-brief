import { describe, it, expect, vi } from "vitest";
import { postToLine } from "./line.js";
import type { Config } from "../config.js";
import type { Analysis } from "../analysis/schema.js";

const config: Config = {
  JINA_API_KEY: "test",
  GEMINI_API_KEY: "test",
  LINE_CHANNEL_ACCESS_TOKEN: "test-token",
  LINE_USER_ID: "U123",
  USE_SAMPLE_DATA: true,
  USE_RSS: false,
};

const item = (title: string, source_names: string[]) => ({
  title,
  details: ["詳細"],
  sources: [],
  source_names,
});

describe("postToLine", () => {
  it("出典は各ニュースの後ろに出さず、最後に重複なしでまとめる", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response("{}")),
    );
    vi.stubGlobal("fetch", fetchMock);

    const analysis: Analysis = {
      political_economic_news: [item("国内A", ["NHK", "時事通信"])],
      world_news: [item("海外B", ["BBC", "NHK"])],
      ai_news: [item("AI C", ["TechCrunch"])],
      tool_recommendations: [],
    };
    await postToLine(analysis, config);

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    const text: string = body.messages[0].text;
    expect(text.match(/出典/g)).toHaveLength(1);
    expect(text.trimEnd().endsWith("本日の出典。\nNHK、時事通信、BBC、TechCrunch。")).toBe(true);
  });
});
