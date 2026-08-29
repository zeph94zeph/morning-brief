import type { Config } from "../config.js";
import type { Settings } from "../settings.js";
import type { RawTweet } from "../types.js";
import { extractUrls, expandUrls } from "../utils/post-optimizer.js";
import { chunkArray } from "../utils/chunk.js";

/**
 * 記事URLの本文を Jina Reader で取得する。
 *
 * 収集対象は2箇所:
 *   - 投稿本文に書かれたURL（X ルート。extractUrls で抽出）
 *   - RawTweet.url そのもの（RSS ルート。記事URLは本文ではなくここに入る）
 * RSS ルートは本文にURLを持たないため、t.url を見ないと1件も拾えない。
 *
 * 返す Map のキーは収集元のURLそのもの。
 * url-summarizer がそのまま Map.get(url) で引けるようにする。
 */
export async function fetchUrlContents(
  tweets: RawTweet[],
  config: Config,
  settings: Settings,
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();

  if (!settings.urlContent.enabled) {
    console.info("URL本文取得は src/settings.ts の urlContent.enabled=false のため無効");
    return contents;
  }

  const allRawUrls = tweets.flatMap((t) => collectUrls(t));
  const uniqueRawUrls = [...new Set(allRawUrls)];

  if (uniqueRawUrls.length === 0) return contents;

  console.info(`→ ${uniqueRawUrls.length}件 のURLをHEADで展開中`);
  const urlMapping = await expandUrls(uniqueRawUrls);
  console.info(
    `→ 外部URL: ${urlMapping.size}件（x.com/twitter.com を除外済み）`,
  );

  if (urlMapping.size === 0) return contents;

  let jina402Detected = false;
  // 上限は除外後にかける。HEAD展開は無料なので、
  // 捨てられる permalink が Jina / Gemini の枠を食い潰さないようにする。
  const entries = [...urlMapping.entries()].slice(0, settings.urlContent.maxUrls);
  if (entries.length < urlMapping.size) {
    console.info(
      `→ 本文取得は新しい順に ${entries.length}件 まで（settings.urlContent.maxUrls）`,
    );
  }
  const chunks = chunkArray(entries, settings.urlContent.parallelism);

  for (const chunk of chunks) {
    if (jina402Detected) break;

    const results = await Promise.allSettled(
      chunk.map(async ([originalUrl, expandedUrl]) => {
        const ctl = new AbortController();
        const timer = setTimeout(
          () => ctl.abort(),
          settings.urlContent.timeoutMs,
        );
        try {
          const res = await fetch(`https://r.jina.ai/${expandedUrl}`, {
            headers: {
              Accept: "text/plain",
              ...(config.JINA_API_KEY
                ? { Authorization: `Bearer ${config.JINA_API_KEY}` }
                : {}),
            },
            signal: ctl.signal,
          });

          if (res.status === 402 || res.status === 401) {
            jina402Detected = true;
            console.warn(
              `[Jina] ${res.status} — 無料枠が枯渇しました。URL本文なしで分析を続行します。`,
            );
            return { originalUrl, content: undefined };
          }
          if (!res.ok) {
            return { originalUrl, content: undefined };
          }
          const text = await res.text();
          return { originalUrl, content: text };
        } finally {
          clearTimeout(timer);
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.content) {
        contents.set(r.value.originalUrl, r.value.content);
      }
    }
  }

  if (jina402Detected) {
    console.warn(
      `[Jina] フォールバック: ${contents.size} URLs の本文を取得済み。残りはスキップします。`,
    );
  } else {
    console.info(`→ 本文取得完了: ${contents.size}件`);
  }

  return contents;
}

/** 1件の記事／投稿から本文取得の候補URLを集める */
function collectUrls(tweet: RawTweet): string[] {
  const urls = extractUrls(tweet.text);
  // RSS 記事の URL。X ルートでは投稿の permalink になるが、
  // expandUrls が x.com / twitter.com / t.co を除外するので実害はない。
  if (tweet.url) urls.push(tweet.url);
  return urls;
}
