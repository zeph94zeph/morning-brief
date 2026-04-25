import type { Config } from "../config.js";
import type { Analysis } from "../analysis/schema.js";
import { UserFacingError } from "../utils/errors.js";

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

export async function postToLine(
  analysis: Analysis,
  config: Config,
): Promise<void> {
  const messages = buildMessages(analysis);

  for (const message of messages) {
    const res = await fetch(LINE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: config.LINE_USER_ID,
        messages: [message],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new UserFacingError(
        `LINE への投稿に失敗しました (HTTP ${res.status})。` +
          `LINE_CHANNEL_ACCESS_TOKEN と LINE_USER_ID を確認してください。`,
        { cause: body },
      );
    }
  }

  console.info("LINE 投稿完了");
}

function buildMessages(analysis: Analysis): Array<{ type: string; text: string }> {
  const messages: Array<{ type: string; text: string }> = [];

  // メッセージ1: ヘッダー + 主要ニュース
  const lines: string[] = [];
  lines.push("🤖 24時間以内のAIトレンド");
  lines.push("─────────────────");

  const sections: Array<{ title: string; items: Analysis["main_news"] }> = [
    { title: "🔥 主要なニュース・話題", items: analysis.main_news },
    { title: "⚡ 注目のアップデート", items: analysis.updates },
    { title: "💡 技術トレンド", items: analysis.tech_trends },
  ];

  for (const section of sections) {
    if (section.items.length === 0) continue;

    lines.push("");
    lines.push(section.title);
    lines.push("─────────────────");

    for (const topic of section.items.slice(0, 1)) {
      lines.push("");
      lines.push(`■ ${topic.title}`);

      for (const detail of topic.details) {
        lines.push(`  ${detail}`);
      }
    }
  }

  // LINEのテキストメッセージは5000文字制限なので分割
  const fullText = lines.join("\n");
  const chunks = splitText(fullText, 4900);

  for (const chunk of chunks) {
    messages.push({ type: "text", text: chunk });
  }

  return messages;
}

function splitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    // 改行で切れ目を探す
    const cutPoint = remaining.lastIndexOf("\n", maxLength);
    const splitAt = cutPoint > 0 ? cutPoint : maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt + 1);
  }

  return chunks;
}
