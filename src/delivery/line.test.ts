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
    // 出典は読み上げ順（世界 → 日本 → AI）に並ぶ
    expect(text.trimEnd().endsWith("本日の出典。\nBBC、NHK、時事通信、TechCrunch。")).toBe(true);
  });

  it("世界のニュース → 日本の政治・経済 → AIニュースの順に読み上げる", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response("{}")),
    );
    vi.stubGlobal("fetch", fetchMock);

    await postToLine(
      {
        political_economic_news: [item("国内A", [])],
        world_news: [item("海外B", [])],
        ai_news: [item("AI C", [])],
        tool_recommendations: [],
      },
      config,
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    const text: string = body.messages[0].text;
    const world = text.indexOf("世界のニュース。");
    const japan = text.indexOf("日本の政治・経済。");
    const ai = text.indexOf("AIニュース。");
    expect(world).toBeGreaterThan(-1);
    expect(world).toBeLessThan(japan);
    expect(japan).toBeLessThan(ai);
  });
});
