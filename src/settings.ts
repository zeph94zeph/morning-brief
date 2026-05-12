export interface RssFeed {
  /** Slack / Gemini に渡す表示名 */
  name: string;
  /** RSS フィード URL */
  url: string;
}

export interface Settings {
  schedule: {
    lookbackHours: number;
    maxTweets: number;
  };
  urlContent: {
    enabled: boolean;
    timeoutMs: number;
    parallelism: number;
    maxSummaryChars: number;
    inputCharsMultiplier: number;
  };
  analysis: {
    urlSummaryModel: string;
    trendAnalysisModel: string;
    temperature: number;
  };
  /** USE_RSS=true のときに使うフィード一覧。自由に追加・削除できる */
  rss: {
    feeds: RssFeed[];
  };
}

export const settings: Settings = {
  schedule: {
    lookbackHours: 24,
    maxTweets: 500,
  },
  urlContent: {
    enabled: true,
    timeoutMs: 10_000,
    parallelism: 10,
    maxSummaryChars: 200,
    inputCharsMultiplier: 20,
  },
  analysis: {
    urlSummaryModel: "gemini-2.5-flash",
    trendAnalysisModel: "gemini-2.5-pro",
    temperature: 0,
  },
  rss: {
    feeds: [
            // ── 日本の政治・経済 ─────────────────────────────────
      { name: "NHK 政治",       url: "https://www3.nhk.or.jp/rss/news/cat04.xml" },
      { name: "NHK 経済",       url: "https://www3.nhk.or.jp/rss/news/cat05.xml" },
      { name: "東洋経済",        url: "https://toyokeizai.net/list/feed/rss" },
            // ── 世界のニュース ────────────────────────────────
      { name: "BBC Japan",        url: "https://feeds.bbci.co.uk/japanese/rss.xml" },
      { name: "Reuters Japan",    url: "https://feeds.reuters.com/reuters/JPGeneralNews" },
      { name: "CNN Japan",        url: "https://feeds.cnn.co.jp/cnn/rss" },
      // ── AI 専門メディア ──────────────────────────────────────
      { name: "TechCrunch AI",    url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
      { name: "VentureBeat AI",   url: "https://venturebeat.com/category/ai/feed/" },
      { name: "MIT Tech Review",  url: "https://www.technologyreview.com/feed/" },
      // ── 公式ブログ ───────────────────────────────────────────
      { name: "OpenAI Blog",      url: "https://openai.com/blog/rss/" },
      { name: "Google AI Blog",   url: "https://blog.research.google/feeds/posts/default?alt=rss" },
      { name: "Hugging Face",     url: "https://huggingface.co/blog/feed.xml" },
      { name: "Anthropic",        url: "https://www.anthropic.com/rss.xml" },
    ],
  },
  
};
