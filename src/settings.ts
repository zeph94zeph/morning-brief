export interface RssFeed {
  /** Slack / Gemini に渡す表示名 */
  name: string;
  /** RSS フィード URL */
  url: string;
}

export interface ToolAdvisorSettings {
  enabled: boolean;
  maxRecommendations: number;
  watchedTools: string[];
  discovery: { enabled: boolean; description: string };
  userProfile: { primaryUseCases: string[]; constraints: string[] };
}

export interface Settings {
  schedule: {
    lookbackHours: number;
    maxTweets: number;
  };
  urlContent: {
    enabled: boolean;
    /** 本文を取りに行く URL の上限。Jina / Gemini の無料枠を守るための安全弁 */
    maxUrls: number;
    timeoutMs: number;
    parallelism: number;
    maxSummaryChars: number;
    inputCharsMultiplier: number;
  };
  analysis: {
    urlSummaryModel: string;
    trendAnalysisModel: string;
    temperature: number;
    maxGeminiAttempts: number;
    geminiRetryDelayMs: number;
  };
  /** USE_RSS=true のときに使うフィード一覧。自由に追加・削除できる */
  rss: {
    feeds: RssFeed[];
  };
  toolAdvisor: ToolAdvisorSettings;
}

export const settings: Settings = {
  schedule: {
    lookbackHours: 24,
    maxTweets: 500,
  },
  urlContent: {
    enabled: true,
    maxUrls: 12,
    timeoutMs: 10_000,
    parallelism: 10,
    maxSummaryChars: 200,
    inputCharsMultiplier: 20,
  },
  analysis: {
    urlSummaryModel: "gemini-2.5-flash",
    trendAnalysisModel: "gemini-2.5-flash",
    temperature: 0,
    maxGeminiAttempts: 6,
    geminiRetryDelayMs: 30_000,
  },
  toolAdvisor: {
    enabled: true,
    maxRecommendations: 5,
    watchedTools: [
      "Codex",
      "Claude Code",
      "Gemini",
      "Antigravity",
      "Gemini SPARK",
      "Cursor",
      "GitHub Copilot",
      "Perplexity",
      "Grok / X AI",
    ],
    discovery: {
      enabled: true,
      description: "業務自動化・コード修正・資料作成・AIニュース収集に役立つ新しいAIツールや重要アップデートを拾う",
    },
    userProfile: {
      primaryUseCases: [
        "コード修正",
        "GitHub Actions修復",
        "業務自動化",
        "AIニュース収集",
        "LINE/Slack配信",
        "資料作成",
      ],
      constraints: [
        "日本語で判断したい",
        "安定性重視",
        "無料枠優先。ただし重要用途では有料化も検討",
      ],
    },
  },
  rss: {
    feeds: [
            // ── 日本の政治・経済 ─────────────────────────────────
      { name: "NHK 政治",       url: "https://www3.nhk.or.jp/rss/news/cat4.xml" },
      { name: "NHK 経済",       url: "https://www3.nhk.or.jp/rss/news/cat5.xml" },
      { name: "東洋経済",        url: "https://toyokeizai.net/list/feed/rss" },
            // ── 世界のニュース ────────────────────────────────
      { name: "BBC Japan",        url: "https://feeds.bbci.co.uk/japanese/rss.xml" },
      { name: "時事通信",          url: "https://www.jiji.com/rss/ranking.rdf" },
      { name: "CNN Japan",        url: "https://feeds.cnn.co.jp/cnn/rss" },
      // ── AI 専門メディア ──────────────────────────────────────
      { name: "TechCrunch AI",    url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
      { name: "VentureBeat AI",   url: "https://venturebeat.com/category/ai/feed/" },
      { name: "MIT Tech Review",  url: "https://www.technologyreview.com/feed/" },
      // ── 公式ブログ ───────────────────────────────────────────
      { name: "OpenAI Blog",      url: "https://openai.com/news/rss.xml" },
      { name: "Google AI Blog",   url: "https://blog.research.google/feeds/posts/default?alt=rss" },
      { name: "Hugging Face",     url: "https://huggingface.co/blog/feed.xml" },
    ],
  },
  
};
