import type { Settings } from "../settings.js";
import type { RawTweet } from "../types.js";

/**
 * RSS/Atom フィードを並列取得し RawTweet[] に変換して返す。
 * Node.js 22 ネイティブ fetch のみ使用（外部ライブラリ不要）。
 */
export async function fetchRssFeeds(settings: Settings): Promise<RawTweet[]> {
  const cutoff = new Date(
    Date.now() - settings.schedule.lookbackHours * 60 * 60 * 1000,
  );

  const results = await Promise.allSettled(
    settings.rss.feeds.map((feed) => fetchOneFeed(feed, cutoff)),
  );

  const allItems: RawTweet[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    } else {
      console.warn(`[RSS] フィード取得失敗: ${String(result.reason)}`);
    }
  }

  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const limited = allItems.slice(0, settings.schedule.maxTweets);
  console.info(
    `-> RSSフィード ${settings.rss.feeds.length}件 から ${limited.length}件 の記事を取得`,
  );
  return limited;
}

async function fetchOneFeed(
  feed: { name: string; url: string },
  cutoff: Date,
): Promise<RawTweet[]> {
  const res = await fetch(feed.url, {
    headers: {
      "User-Agent": "ai-news-bot/1.0",
      "Accept": "application/rss+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${feed.url}`);
  }

  const xml = await res.text();
  return parseRssItems(xml, feed.name, cutoff);
}

function parseRssItems(
  xml: string,
  sourceName: string,
  cutoff: Date,
): RawTweet[] {
  const items: RawTweet[] = [];
  const itemPattern = "<(?:item|entry)[\\s>]([\\s\\S]*?)<\\/(?:item|entry)>";
  const itemRegex = new RegExp(itemPattern, "gi");
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1] ?? "";

    const title = extractTag(block, "title");
    const link  = extractLink(block);
    const date  = extractDate(block);
    const desc  =
      extractTag(block, "description") ??
      extractTag(block, "summary") ??
      "";

    if (!title || !link) continue;
    if (date && new Date(date) < cutoff) continue;

    const summary = stripHtml(desc).slice(0, 200);
    const text = summary ? title + "\n" + summary : title;

    items.push({
      authorId: sourceName,
      text,
      createdAt: date ?? new Date().toISOString(),
      url: link,
    });
  }

  return items;
}

function extractTag(block: string, tag: string): string | undefined {
  const pattern =
    "<" + tag + "[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/" + tag + ">";
  const re = new RegExp(pattern, "si");
  return re.exec(block)?.[1]?.trim() || undefined;
}

function extractLink(block: string): string | undefined {
  const hrefPattern = "<link[^>]+href=[\"']([^\"']+)[\"']";
  const href = new RegExp(hrefPattern, "i").exec(block)?.[1];
  if (href) return href;
  return extractTag(block, "link");
}

function extractDate(block: string): string | undefined {
  const raw =
    extractTag(block, "pubDate") ??
    extractTag(block, "published") ??
    extractTag(block, "updated");
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
