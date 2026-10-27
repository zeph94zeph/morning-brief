import { describe, it, expect, vi } from "vitest";
import { fetchUrlContents, interleaveBySource } from "./url-content.js";
import type { Config } from "../config.js";
import type { Settings } from "../settings.js";
import type { RawTweet } from "../types.js";

const mockConfig: Config = {
  JINA_API_KEY: "test-jina",
  GEMINI_API_KEY: "test-gemini",
  LINE_CHANNEL_ACCESS_TOKEN: "test-token",
  LINE_USER_ID: "U123",
  USE_SAMPLE_DATA: true,
  USE_RSS: false,
};

const baseSettings: Settings = {
  schedule: { lookbackHours: 24, maxTweets: 100 },
  urlContent: {
    enabled: true,
    maxUrls: 50,
    timeoutMs: 5000,
    parallelism: 5,
    maxSummaryChars: 200,
    inputCharsMultiplier: 20,
  },
  claude: {
    enabled: false,
    model: "claude-opus-5-5",
    effort: "high",
    formatEffort: "medium",
    maxArticleChars: 8000,
    maxWebSearches: 0,
    pricing: {
      inputPerMTok: 4,
      cacheWritePerMTok: 5,
      cacheReadPerMTok: 0.2,
      outputPerMTok: 20,
      perWebSearch: 0.01,
    },
  },
  analysis: {
    urlSummaryModel: "gemini-2.5-flash",
    trendAnalysisModel: "gemini-2.5-pro",
    temperature: 0,
    maxGeminiAttempts: 6,
    geminiRetryDelayMs: 30_000,
  },
  rss: { feeds: [] },
  toolAdvisor: {
    enabled: false,
    maxRecommendations: 5,
    watchedTools: [],
    discovery: { enabled: false, description: "" },
    userProfile: { primaryUseCases: [], constraints: [] },
  },
};

const disabledSettings: Settings = {
  ...baseSettings,
  urlContent: { ...baseSettings.urlContent, enabled: false },
};

const tweetsNoUrl: RawTweet[] = [
  {
    authorId: "user1",
    text: "URLなしのツイート",
    createdAt: "2026-04-16T10:00:00.000Z",
    url: "https://x.com/user1/status/1",
  },
];

/** RSS ルートの形。記事URLは本文ではなく url フィールドに入る */
function makeRssItems(...urls: string[]): RawTweet[] {
  return urls.map((u, i) => ({
    authorId: "NHK 経済",
    text: `見出し${i + 1}\n本文にURLを含まない200字の抄録`,
    createdAt: "2026-04-16T10:00:00.000Z",
    url: u,
  }));
}

/** HEAD はそのままのURLを返し、Jina は本文を返すだけの stub */
function stubFetchOk(body = "Article body content") {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "HEAD") {
        return Promise.resolve({ url });
      }
      if (url.startsWith("https://r.jina.ai/")) {
        return Promise.resolve(new Response(body, { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
}

function makeTweetsWithUrls(...urls: string[]): RawTweet[] {
  return urls.map((u, i) => ({
    authorId: "user1",
    text: `Check out ${u}`,
    createdAt: "2026-04-16T10:00:00.000Z",
    url: `https://x.com/user1/status/${i + 1}`,
  }));
}

describe("fetchUrlContents", () => {
  it("urlContent.enabled=false のとき空Mapを返す", async () => {
    const result = await fetchUrlContents(
      makeTweetsWithUrls("https://example.com/article"),
      mockConfig,
      disabledSettings,
    );
    expect(result.size).toBe(0);
  });

  it("外部URLを持たないツイートでは空Mapを返す", async () => {
    stubFetchOk();
    const result = await fetchUrlContents(
      tweetsNoUrl,
      mockConfig,
      baseSettings,
    );
    // 本文にURLはなく、permalink は x.com なので expandUrls が除外する
    expect(result.size).toBe(0);
  });

  it("RSS記事は本文にURLがなくても url フィールドから本文を取得する", async () => {
    stubFetchOk("RSS記事の本文");

    const result = await fetchUrlContents(
      makeRssItems("https://example.com/news/1", "https://example.com/news/2"),
      mockConfig,
      baseSettings,
    );

    expect(result.size).toBe(2);
    expect(result.get("https://example.com/news/1")).toBe("RSS記事の本文");
    expect(result.get("https://example.com/news/2")).toBe("RSS記事の本文");
  });

  it("maxUrls を超える分は取りに行かない", async () => {
    stubFetchOk("RSS記事の本文");

    const result = await fetchUrlContents(
      makeRssItems(
        "https://example.com/news/1",
        "https://example.com/news/2",
        "https://example.com/news/3",
      ),
      mockConfig,
      { ...baseSettings, urlContent: { ...baseSettings.urlContent, maxUrls: 2 } },
    );

    expect(result.size).toBe(2);
    expect(result.has("https://example.com/news/3")).toBe(false);
  });

  it("鍵なしでも401なら認証エラーとして報告する（枠切れの402と区別する）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (init?.method === "HEAD") {
          return Promise.resolve({ url });
        }
        return Promise.resolve(new Response(null, { status: 401 }));
      }),
    );

    const result = await fetchUrlContents(
      makeRssItems("https://example.com/news/1", "https://example.com/news/2"),
      mockConfig,
      baseSettings,
    );

    expect(result.size).toBe(0);
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("JINA_API_KEY"))).toBe(true);
    expect(messages.some((m) => m.includes("無料枠が枯渇"))).toBe(false);
    // 並列分がまとめて刺さっても中断理由は1回だけ
    expect(messages.filter((m) => m.includes("JINA_API_KEY"))).toHaveLength(1);
    warn.mockRestore();
  });

  it("401 のとき Authorization を外して1回だけ引き直す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const authHeaders: (string | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (init?.method === "HEAD") {
          return Promise.resolve({ url });
        }
        const auth = (init?.headers as Record<string, string> | undefined)
          ?.Authorization;
        authHeaders.push(auth);
        // 鍵付きは弾かれるが、鍵なしなら通る（Jina Reader の実挙動）
        return Promise.resolve(
          auth
            ? new Response(null, { status: 401 })
            : new Response("鍵なしで取れた本文", { status: 200 }),
        );
      }),
    );

    const result = await fetchUrlContents(
      makeRssItems("https://example.com/news/1", "https://example.com/news/2"),
      mockConfig,
      { ...baseSettings, urlContent: { ...baseSettings.urlContent, parallelism: 1 } },
    );

    expect(result.size).toBe(2);
    expect(result.get("https://example.com/news/1")).toBe("鍵なしで取れた本文");
    // 1件目: 鍵あり→401→鍵なしで再試行。2件目: 鍵は無効と分かっているので最初から鍵なし
    expect(authHeaders).toEqual([
      "Bearer test-jina",
      undefined,
      undefined,
    ]);
    // 中断していないので枠切れ扱いの警告は出ない
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("無料枠が枯渇"))).toBe(false);
    expect(messages.filter((m) => m.includes("JINA_API_KEY"))).toHaveLength(1);
    warn.mockRestore();
  });

  it("除外される permalink は maxUrls の枠を消費しない", async () => {
    stubFetchOk("本文");

    // 各ツイートは 外部URL1件 + x.com の permalink1件 を持つ
    const result = await fetchUrlContents(
      makeTweetsWithUrls("https://a.example.com/1", "https://b.example.com/2"),
      mockConfig,
      { ...baseSettings, urlContent: { ...baseSettings.urlContent, maxUrls: 2 } },
    );

    // permalink が枠を食っていれば1件しか取れない
    expect(result.size).toBe(2);
  });

  it("Jina 200 OK で本文を取得できる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        // HEAD展開: 展開後URLとしてそのまま返す（x.com系でないので通過する）
        if (init?.method === "HEAD") {
          return Promise.resolve({ url });
        }
        // Jina Reader 呼び出し
        if (url.startsWith("https://r.jina.ai/")) {
          return Promise.resolve(new Response("Article body content", { status: 200 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    const tweets = makeTweetsWithUrls("https://example.com/article");
    const result = await fetchUrlContents(tweets, mockConfig, baseSettings);
    expect(result.size).toBe(1);
    const content = [...result.values()][0];
    expect(content).toBe("Article body content");
  });

  it("Jina 402 でフォールバックし残りをスキップする", async () => {
    let jinaCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (init?.method === "HEAD") {
          return Promise.resolve({ url });
        }
        if (url.startsWith("https://r.jina.ai/")) {
          jinaCallCount++;
          if (jinaCallCount === 1) {
            return Promise.resolve(new Response("First article", { status: 200 }));
          }
          return Promise.resolve(new Response(null, { status: 402 }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }),
    );

    const tweets = makeTweetsWithUrls(
      "https://a.example.com/1",
      "https://b.example.com/2",
      "https://c.example.com/3",
    );
    const result = await fetchUrlContents(tweets, mockConfig, {
      ...baseSettings,
      urlContent: { ...baseSettings.urlContent, parallelism: 1 },
    });
    expect(result.size).toBe(1);
    expect([...result.values()][0]).toBe("First article");
  });
});

describe("interleaveBySource", () => {
  const item = (authorId: string, n: number): RawTweet => ({
    authorId,
    text: `${authorId}-${n}`,
    createdAt: "2026-04-16T10:00:00.000Z",
    url: `https://example.com/${authorId}/${n}`,
  });

  it("ソースごとに元の順序を保ったまま1件ずつ交互に並べる", () => {
    const tweets = [item("A", 1), item("A", 2), item("A", 3), item("B", 1), item("C", 1), item("C", 2)];
    expect(interleaveBySource(tweets).map((t) => t.text)).toEqual([
      "A-1", "B-1", "C-1", "A-2", "C-2", "A-3",
    ]);
  });

  it("件数の多いソースが本文取得の枠を独占しない", async () => {
    stubFetchOk();

    const tweets = [item("A", 1), item("A", 2), item("A", 3), item("B", 1)];
    const result = await fetchUrlContents(tweets, mockConfig, {
      ...baseSettings,
      urlContent: { ...baseSettings.urlContent, maxUrls: 2 },
    });
    expect([...result.keys()]).toEqual([
      "https://example.com/A/1",
      "https://example.com/B/1",
    ]);
  });
});
