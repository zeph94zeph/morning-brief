import { describe, it, expect, vi } from "vitest";
import { checkFeed } from "./rss-feeds.js";

const feed = { name: "Test", url: "https://example.com/rss.xml" };
const cutoff = new Date("2026-10-26T00:00:00Z");

function stubBody(body: string, contentType = "application/rss+xml") {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(body, { headers: { "content-type": contentType } })),
    ),
  );
}

const item = (title: string, pubDate?: string) =>
  `<item><title>${title}</title><link>https://example.com/${title}</link>` +
  (pubDate ? `<pubDate>${pubDate}</pubDate>` : "") +
  `</item>`;

describe("checkFeed", () => {
  it("cutoff より古い記事は除き、最新日付を診断情報に残す", async () => {
    stubBody(
      `<rss><channel>${item("new", "Mon, 26 Oct 2026 09:00:00 +0900")}` +
        `${item("old", "Mon, 19 Oct 2026 09:00:00 +0900")}</channel></rss>`,
    );
    const { items, report } = await checkFeed(feed, cutoff);
    expect(items.map((i) => i.url)).toEqual(["https://example.com/new"]);
    expect(report.parsed).toBe(2);
    expect(report.newest).toBe("2026-10-26T00:00:00.000Z");
    expect(report.head).toBeUndefined();
  });

  it("日付のない記事は残す（従来どおり）", async () => {
    stubBody(`<rss><channel>${item("undated")}</channel></rss>`);
    const { items, report } = await checkFeed(feed, cutoff);
    expect(items).toHaveLength(1);
    expect(report.newest).toBeUndefined();
  });

  it("記事が読み取れないときは本文の冒頭を返す（HTML が返った場合など）", async () => {
    stubBody("<!DOCTYPE html>\n<html><body>moved</body></html>", "text/html");
    const { items, report } = await checkFeed(feed, cutoff);
    expect(items).toHaveLength(0);
    expect(report.contentType).toBe("text/html");
    expect(report.head).toBe("<!DOCTYPE html> <html><body>moved</body></html>");
  });
});
