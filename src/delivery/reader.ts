import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GoogleGenAI, Modality } from "@google/genai";
import type { Analysis } from "../analysis/schema.js";
import type { Settings } from "../settings.js";

// Gemini の音声合成が返す音声の形式（16bit・モノラル・24kHz の生 PCM）
const PCM_SAMPLE_RATE = 24_000;

const SECTIONS = [
  ["world_news", "世界のニュース"],
  ["political_economic_news", "日本の政治・経済"],
  ["ai_news", "AIニュース"],
] as const;

/**
 * 読み上げページ（web/index.html）が読み込む brief.json と、
 * 要約を読み上げた brief.mp3 を書き出す。
 * GitHub Actions がこのフォルダを GitHub Pages として公開する。
 * 音声づくりに失敗しても brief.json は書き出し、配信は止めない
 * （ページは端末の読み上げ機能で動く）。
 */
export async function writeReaderData(
  analysis: Analysis,
  settings: Settings,
  geminiApiKey: string | undefined,
): Promise<void> {
  const dir = settings.reader.outputDir;
  await mkdir(dir, { recursive: true });

  let audio: string | undefined;
  const { tts } = settings.reader;
  if (tts.enabled && geminiApiKey) {
    try {
      audio = await writeAudio(buildSpeechScript(analysis), settings, geminiApiKey);
    } catch (error) {
      console.warn("[TTS] 音声ファイルを作れなかったため、端末の読み上げで代用します。", error);
    }
  } else if (tts.enabled) {
    console.warn("[TTS] GEMINI_API_KEY が未設定のため、音声ファイルは作りません。");
  }

  await writeFile(
    join(dir, "brief.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), audio, analysis }),
  );
  console.info(`→ 読み上げページ用に ${join(dir, "brief.json")} を書き出しました`);
}

/** 読み上げる原稿。ページの表示順（世界 → 日本 → AI → ツール）に合わせる */
export function buildSpeechScript(analysis: Analysis, now = new Date()): string {
  const today = now.toLocaleDateString("ja-JP", {
    month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Tokyo",
  });
  const lines = [`おはようございます。${today}のモーニングブリーフです。`];

  for (const [key, label] of SECTIONS) {
    const items = analysis[key];
    if (items.length === 0) continue;
    lines.push(`${label}です。`);
    items.forEach((item, i) => {
      lines.push(`${i + 1}つ目。${item.title}。${item.details.join(" ")}`);
    });
  }

  if (analysis.tool_recommendations.length > 0) {
    lines.push("AIツールの動きです。");
    for (const r of analysis.tool_recommendations) {
      lines.push(`${r.tool}、${r.verdict}。${r.reason}`);
    }
  }

  lines.push("以上、モーニングブリーフでした。");
  return lines.join("\n");
}

/** 原稿を行の切れ目で、指定文字数以下のかたまりに分ける */
export function splitScript(script: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of script.split("\n")) {
    if (current && current.length + line.length + 1 > maxChars) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function writeAudio(
  script: string,
  settings: Settings,
  apiKey: string,
): Promise<string> {
  const { tts, outputDir } = settings.reader;
  const ai = new GoogleGenAI({ apiKey });
  const chunks = splitScript(script, tts.maxCharsPerRequest);
  console.info(`[TTS] ${tts.model} で ${script.length}文字を音声にしています（${chunks.length}回に分割）...`);

  const pcm: Buffer[] = [];
  for (const chunk of chunks) {
    pcm.push(await synthesize(ai, chunk, tts.model, tts.voice));
  }

  const file = "brief.mp3";
  await encodeMp3(Buffer.concat(pcm), join(outputDir, file));
  const seconds = Math.round(Buffer.concat(pcm).length / 2 / PCM_SAMPLE_RATE);
  console.info(`→ 音声ファイル ${file} を書き出しました（約${Math.floor(seconds / 60)}分${seconds % 60}秒）`);
  return file;
}

async function synthesize(
  ai: GoogleGenAI,
  text: string,
  model: string,
  voice: string,
): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      });
      const data = res.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!data) throw new Error("音声データが空でした");
      return Buffer.from(data, "base64");
    } catch (error) {
      // 無料枠の回数制限（429）は少し待って1回だけやり直す
      const status = (error as { status?: number }).status;
      if (status === 429 && attempt === 1) {
        console.warn("[TTS] 429。30秒待ってやり直します...");
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }
      throw error;
    }
  }
}

/** 生 PCM を ffmpeg で MP3 にする（GitHub Actions の ubuntu には ffmpeg が入っている） */
function encodeMp3(pcm: Buffer, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "s16le", "-ar", String(PCM_SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
      "-codec:a", "libmp3lame", "-b:a", "48k", outPath,
    ]);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d));
    ff.on("error", reject);
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg が失敗しました (${code}): ${stderr}`)),
    );
    ff.stdin.end(pcm);
  });
}
