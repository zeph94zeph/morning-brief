// フィードの健康診断。LINE への配信も API キーも使わない。
//   npm run check-feeds                       … settings.ts の全フィード
//   npm run check-feeds -- <URL> [<URL> ...]  … 追加で任意の URL も確かめる
// GitHub Actions の「Check Feeds」ワークフローからも実行できる。

import { settings } from "./settings.js";
import { checkFeed, describeReport } from "./sources/rss-feeds.js";

const cutoff = new Date(
  Date.now() - settings.schedule.lookbackHours * 60 * 60 * 1000,
);
const extraUrls = process.argv.slice(2).flatMap((a) => a.split(/\s+/)).filter(Boolean);
const feeds = [
  ...settings.rss.feeds,
  ...extraUrls.map((url) => ({ name: `(追加) ${url}`, url })),
];

console.info(`過去${settings.schedule.lookbackHours}時間の記事を数えます（${feeds.length}フィード）\n`);

for (const feed of feeds) {
  try {
    const { items, report } = await checkFeed(feed, cutoff);
    const mark = items.length > 0 ? "OK  " : "ZERO";
    console.info(`${mark} ${feed.name}: ${items.length}件 — ${describeReport(report)}`);
    if (report.head) console.info(`     本文の冒頭: ${report.head}`);
  } catch (error) {
    console.info(`FAIL ${feed.name}: ${String(error)}`);
  }
}
