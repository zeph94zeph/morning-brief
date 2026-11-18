import type { Config } from "../config.js";
import type { Analysis } from "../analysis/schema.js";
import { UserFacingError } from "../utils/errors.js";

const LINE_API_URL = "https://api.line.me/v2/bot/message/broadcast";

export async function postToLine(
    analysis: Analysis,
    config: Config,
    readerUrl = "",
  ): Promise<void> {
    const messages = buildMessages(analysis, readerUrl);

  for (const message of messages) {
        const res = await fetch(LINE_API_URL, {
                  method: "POST",
                  headers: {
                              "Content-Type": "application/json",
                              Authorization: `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`,
                  },
                  body: JSON.stringify({ messages: [message] }),
        });

        if (!res.ok) {
                  const body = await res.text();
                  throw new UserFacingError(
                              `LINE への投稿に失敗しました (HTTP ${res.status})。` +
                                `LINE_CHANNEL_ACCESS_TOKEN を確認してください。`,
                    { cause: body },
                            );
        }
  }

  console.info("LINE broadcast 完了");
}

function stripUrls(text: string): string {
    return text.replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").trim();
}

function buildMessages(
  analysis: Analysis,
  readerUrl: string,
): Array<{ type: string; text: string }> {
  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
    timeZone: "Asia/Tokyo",
  });

  const lines: string[] = [];
  lines.push(`本日のモーニングブリーフ。${today}。`);
  if (readerUrl) lines.push(`▶ 読み上げ：${readerUrl}`);

  const sections: Array<{ title: string; items: Analysis["political_economic_news"] }> = [
    { title: "世界のニュース",    items: analysis.world_news },
    { title: "日本の政治・経済",  items: analysis.political_economic_news },
    { title: "AIニュース",        items: analysis.ai_news },
  ];

  for (const section of sections) {
    if (section.items.length === 0) continue;

    lines.push("");
    lines.push(`${section.title}。`);

    section.items.forEach((item, i) => {
      lines.push("");
      lines.push(`${i + 1}、${item.title}。`);
      for (const detail of item.details) {
        const clean = stripUrls(detail);
        if (clean) lines.push(clean);
      }
    });
  }

  const watched = analysis.tool_recommendations.filter(r => r.category === "watched");
  const discovered = analysis.tool_recommendations.filter(r => r.category === "discovered");

  if (watched.length > 0) {
    lines.push("");
    lines.push("本日のツール選定。");
    watched.forEach((r, i) => {
      lines.push("");
      lines.push(`${i + 1}、${r.tool}。${r.verdict}。`);
      lines.push(r.reason);
    });
  }

  if (discovered.length > 0) {
    lines.push("");
    lines.push("新規発見。");
    discovered.forEach((r, i) => {
      lines.push("");
      lines.push(`${i + 1}、${r.tool}。`);
      lines.push(r.reason);
    });
  }

  // 出典は各ニュースの後ろではなく、最後に重複を除いてまとめて読み上げる
  const sourceNames = [
    ...new Set(sections.flatMap((s) => s.items.flatMap((item) => item.source_names))),
  ];
  if (sourceNames.length > 0) {
    lines.push("");
    lines.push("本日の出典。");
    lines.push(`${sourceNames.join("、")}。`);
  }

  const fullText = lines.join("\n");
  const chunks = splitText(fullText, 4900);

  return chunks.map(chunk => ({ type: "text", text: chunk }));
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
        const cutPoint = remaining.lastIndexOf("\n", maxLength);
        const splitAt = cutPoint > 0 ? cutPoint : maxLength;
        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt + 1);
  }

  return chunks;
}
