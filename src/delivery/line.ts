import type { Config } from "../config.js";
import type { Analysis } from "../analysis/schema.js";
import { UserFacingError } from "../utils/errors.js";

const LINE_API_URL = "https://api.line.me/v2/bot/message/push";

export async function postToLine(
    analysis: Analysis,
    config: Config,
  ): Promise<void> {
    const messages = buildMessages(analysis);

  const userIds = [
        config.LINE_USER_ID,
        ...(config.LINE_USER_ID_2 ? [config.LINE_USER_ID_2] : []),
      ];

  for (const userId of userIds) {
        for (const message of messages) {
                const res = await fetch(LINE_API_URL, {
                          method: "POST",
                          headers: {
                                      "Content-Type": "application/json",
                                      Authorization: `Bearer ${config.LINE_CHANNEL_ACCESS_TOKEN}`,
                          },
                          body: JSON.stringify({
                                      to: userId,
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
  }

  console.info(`LINE 投稿完了 (${userIds.length}人)`);
}

function stripUrls(text: string): string {
    return text.replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").trim();
}

function buildMessages(analysis: Analysis): Array<{ type: string; text: string }> {
    const today = new Date().toLocaleDateString("ja-JP", {
          year: "numeric", month: "long", day: "numeric", weekday: "short",
    });

  const lines: string[] = [];
        lines.push(`📰 本日のモーニングブリーフ`);
    lines.push(`${today}`);
    lines.push("─────────────────");

  const sections: Array<{ title: string; items: Analysis["political_economic_news"] }> = [
    { title: "💴 日本の政治・経済",       items: analysis.political_economic_news },
    { title: "🌏 世界のニュース",         items: analysis.world_news },
      { title: "🤖 AIニュース",      items: analysis.ai_news },
      ];

  for (const section of sections) {
        if (section.items.length === 0) continue;

      lines.push("");
        lines.push(section.title);
        lines.push("─────────────────");

      section.items.forEach((item, i) => {
              lines.push("");
              lines.push(`${i + 1}. ${item.title}`);

                                  for (const detail of item.details) {
                                            const clean = stripUrls(detail);
                                            if (clean) lines.push(`  ${clean}`);
                                  }
      });
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
