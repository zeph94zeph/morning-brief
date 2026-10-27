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
    settings.rss.feeds.map((feed) => checkFeed(feed, cutoff)),
  );

  const allItems: RawTweet[] = [];
  results.forEach((result, i) => {
    const name = settings.rss.feeds[i]?.name;
    if (result.status === "fulfilled") {
      const { items, report } = result.value;
      allItems.push(...items);
      // 0件のときは理由を切り分けられるように中身の様子も出す
      console.info(
        `[RSS] ${name}: ${items.length}件` +
          (items.length === 0 ? `（${describeReport(report)}）` : ""),
      );
    } else {
      console.warn(`[RSS] フィード取得失敗 (${name}): ${String(result.reason)}`);
    }
  });

  allItems.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const limited = allItems.slice(0, settings.schedule.maxTweets);
  console.info(
    `-> RSSフィード ${settings.rss.feeds.length}件 から ${limited.length}件 の記事を取得`,
  );
  return limited;
}

/** 1フィードの取得結果。0件だったときに原因を切り分けるための情報 */
export interface FeedReport {
  status: number;
  /** リダイレクト後の最終URL */
  finalUrl: string;
  contentType: string;
  /** 日付で絞る前に読み取れた記事数 */
  parsed: number;
  /** 読み取れた記事のうち最も新しい日付（ISO） */
  newest?: string;
  /** 記事を1件も読み取れなかったときの本文の冒頭 */
  head?: string;
}

/** フィードを取得し、cutoff より新しい記事と診断情報を返す。HTTP エラーは throw する */
export async function checkFeed(
  feed: { name: string; url: string },
  cutoff: Date,
): Promise<{ items: RawTweet[]; report: FeedReport }> {
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
  const parsed = parseRssItems(xml, feed.name);
  const dates = parsed.flatMap((p) => (p.dated ? [p.item.createdAt] : [])).sort();

  return {
    // 日付のない記事は従来どおり残す（取得時刻を日付として扱う）
    items: parsed
      .filter((p) => !p.dated || new Date(p.item.createdAt) >= cutoff)
      .map((p) => p.item),
    report: {
      status: res.status,
      finalUrl: res.url,
      contentType: res.headers.get("content-type") ?? "",
      parsed: parsed.length,
      newest: dates.at(-1),
      head:
        parsed.length === 0
          ? xml.slice(0, 300).replace(/\s+/g, " ").trim()
          : undefined,
    },
  };
}

export function describeReport(report: FeedReport): string {
  return [
    `記事 ${report.parsed}件`,
    `最新 ${report.newest ?? "日付なし"}`,
    `HTTP ${report.status} ${report.contentType}`,
    `URL ${report.finalUrl}`,
  ].join(" / ");
}

function parseRssItems(
  xml: string,
  sourceName: string,
): Array<{ item: RawTweet; dated: boolean }> {
  const items: Array<{ item: RawTweet; dated: boolean }> = [];
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

    const summary = stripHtml(desc).slice(0, 200);
    const text = summary ? title + "\n" + summary : title;

    items.push({
      item: {
        authorId: sourceName,
        text,
        createdAt: date ?? new Date().toISOString(),
        url: link,
      },
      dated: date !== undefined,
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
