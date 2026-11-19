import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Analysis } from "../analysis/schema.js";
import type { Settings } from "../settings.js";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("@google/genai", async (orig) => ({
  ...(await orig<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateContent: mockGenerate };
  },
}));

const { buildSpeechScript, splitScript, writeReaderData } = await import("./reader.js");

const item = (title: string) => ({ title, details: ["詳細"], sources: [], source_names: [] });
const analysis: Analysis = {
  political_economic_news: [item("国内A")],
  world_news: [item("海外B")],
  ai_news: [item("AI C")],
  tool_recommendations: [
    { tool: "Codex", verdict: "注視", reason: "理由", sources: [], category: "watched" },
  ],
};

async function settingsIn(dir: string, enabled = true): Promise<Settings> {
  const { settings } = await import("../settings.js");
  return {
    ...settings,
    reader: { ...settings.reader, outputDir: dir, tts: { ...settings.reader.tts, enabled } },
  };
}

// 1秒分の無音 PCM（16bit・モノラル・24kHz）
const silence = Buffer.alloc(24_000 * 2).toString("base64");
const audioResponse = {
  candidates: [{ content: { parts: [{ inlineData: { data: silence } }] } }],
};

beforeEach(() => mockGenerate.mockReset());

describe("buildSpeechScript", () => {
  it("世界 → 日本 → AI → ツールの順に読む", () => {
    const script = buildSpeechScript(analysis, new Date("2026-11-19T00:00:00Z"));
    const order = ["世界のニュース", "日本の政治・経済", "AIニュース", "AIツール"].map((w) =>
      script.indexOf(w),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(script).toContain("1つ目。海外B。詳細");
  });
});

describe("splitScript", () => {
  it("行の切れ目で指定文字数以下に分ける", () => {
    const chunks = splitScript("aaaa\nbbbb\ncccc", 9);
    expect(chunks).toEqual(["aaaa\nbbbb", "cccc"]);
  });
});

describe("writeReaderData", () => {
  it("音声を MP3 にして brief.json から参照する", async () => {
    mockGenerate.mockResolvedValue(audioResponse);
    const dir = await mkdtemp(join(tmpdir(), "reader-"));

    await writeReaderData(analysis, await settingsIn(dir), "key");

    const json = JSON.parse(await readFile(join(dir, "brief.json"), "utf8"));
    expect(json.audio).toBe("brief.mp3");
    expect((await stat(join(dir, "brief.mp3"))).size).toBeGreaterThan(0);
    const call = mockGenerate.mock.calls[0]![0];
    expect(call.config.responseModalities).toEqual(["AUDIO"]);
  });

  it("ffmpeg が無いときは WAV で保存する", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGenerate.mockResolvedValue(audioResponse);
    const dir = await mkdtemp(join(tmpdir(), "reader-"));
    const path = process.env.PATH;
    process.env.PATH = "";  // ffmpeg を見つけられない状態（本番の初回と同じ）
    try {
      await writeReaderData(analysis, await settingsIn(dir), "key");
    } finally {
      process.env.PATH = path;
    }

    const json = JSON.parse(await readFile(join(dir, "brief.json"), "utf8"));
    expect(json.audio).toBe("brief.wav");
    const wav = await readFile(join(dir, "brief.wav"));
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.length).toBe(44 + 24_000 * 2);
    warn.mockRestore();
  });

  it("音声づくりに失敗しても brief.json は書き出す（audio なし）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // 音声データなしで返ってきた場合（無料枠の制限やモデル側の不具合）
    mockGenerate.mockResolvedValue({ candidates: [{ content: { parts: [] } }] });
    const dir = await mkdtemp(join(tmpdir(), "reader-"));

    await writeReaderData(analysis, await settingsIn(dir), "key");

    const json = JSON.parse(await readFile(join(dir, "brief.json"), "utf8"));
    expect(json.audio).toBeUndefined();
    expect(json.analysis.world_news[0].title).toBe("海外B");
    warn.mockRestore();
  });
});
