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

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Settings {
  schedule: {
    lookbackHours: number;
    maxTweets: number;
  };
  urlContent: {
    enabled: boolean;
    /** 本文を取りに行く URL の上限。Jina の無料枠と Claude の入力コストを守るための安全弁 */
    maxUrls: number;
    timeoutMs: number;
    parallelism: number;
    maxSummaryChars: number;
    inputCharsMultiplier: number;
  };
  /** 分析エンジン（Claude）。Gemini は claude.enabled=false にしたときだけ使う代替案 */
  claude: {
    /**
     * true: Claude だけで分析する。失敗した日は記事の見出しだけの簡易版になる（Gemini には切り替えない）
     * false: 代替案の Gemini で分析する（Claude のクレジットが切れたときなど。GEMINI_API_KEY が要る）
     */
    enabled: boolean;
    model: string;
    /** 考える深さ。low / medium / high / xhigh / max。上げるほど精度もコストも上がる */
    effort: ClaudeEffort;
    /** 調査メモを JSON に整える2段階目の effort。材料は揃っているので軽めでよい */
    formatEffort: ClaudeEffort;
    /** 1記事あたり Claude に渡す本文の上限文字数。コストの安全弁 */
    maxArticleChars: number;
    /** 裏取り・追加取材のウェブ検索回数の上限（1回 約$0.01 + 読んだ分のトークン代）。0 で検索しない */
    maxWebSearches: number;
    /** ログに概算費用を出すための単価（USD）。model を変えたらここも合わせる */
    pricing: {
      inputPerMTok: number;
      cacheWritePerMTok: number;
      cacheReadPerMTok: number;
      outputPerMTok: number;
      perWebSearch: number;
    };
  };
  /** Gemini 設定。代替案（claude.enabled=false）のときだけ使う */
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
  /** 配信文の長さ。各カテゴリ3件はスキーマで固定 */
  brief: {
    /** 1ニュースあたりの詳細の項目数（1〜2） */
    detailsPerItem: number;
    /** 詳細1項目あたりの目安文字数 */
    charsPerDetail: number;
  };
  /** スマホで読み上げるページ（GitHub Pages） */
  reader: {
    /** LINE の冒頭に載せるページの URL。空にすると載せない */
    url: string;
    /** 当日分の brief.json を書き出すフォルダ（ワークフローがここをページとして公開する） */
    outputDir: string;
  };
}

export const settings: Settings = {
  schedule: {
    lookbackHours: 24,
    maxTweets: 500,
  },
  urlContent: {
    enabled: true,
    // 本文を取りに行く記事数。ソースごとに新しい順で1件ずつ順番に選ぶ。
    // Gemini 運用中は1件ごとに Gemini Flash で要約するので、無料枠の回数制限に収まるよう12件にしている
    // （Claude に戻すなら36件が目安）
    maxUrls: 12,
    timeoutMs: 10_000,
    parallelism: 10,
    maxSummaryChars: 200,
    inputCharsMultiplier: 20,
  },
  claude: {
    // 2026-11-20 に無料クレジットが切れるため、無料の Gemini（代替案）で運用中。Claude に戻すなら true
    enabled: false,
    // Opus 5.5 だと1日 約$1.5〜2。Sonnet 5.5 は約半分。品質を見て戻す場合は "claude-opus-5-5" と pricing を戻す
    model: "claude-sonnet-5-5",
    effort: "high",
    formatEffort: "medium",
    maxArticleChars: 8000,
    maxWebSearches: 10,
    // claude-sonnet-5-5 の単価（2026年11月時点）。キャッシュ書込は5分保持の料金
    // （Opus 5.5 は 入力4 / 書込5 / 読込0.2 / 出力20）
    pricing: {
      inputPerMTok: 2,
      cacheWritePerMTok: 2.5,
      cacheReadPerMTok: 0.2,
      outputPerMTok: 10,
      perWebSearch: 0.01,
    },
  },
  analysis: {
    urlSummaryModel: "gemini-2.5-flash",
    trendAnalysisModel: "gemini-2.5-flash",
    temperature: 0,
    maxGeminiAttempts: 6,
    geminiRetryDelayMs: 30_000,
  },
  brief: {
    detailsPerItem: 1,
    charsPerDetail: 100,
  },
  reader: {
    // openExternalBrowser=1 で LINE 内ブラウザではなく Chrome などで開く（LINE 内ブラウザは読み上げ不可）
    url: "https://zeph94zeph.github.io/morning-brief/?openExternalBrowser=1",
    outputDir: "site",
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
      { name: "NHK 政治",       url: "https://news.web.nhk/n-data/conf/na/rss/cat4.xml" },
      { name: "NHK 経済",       url: "https://news.web.nhk/n-data/conf/na/rss/cat5.xml" },
      { name: "東洋経済",        url: "https://toyokeizai.net/list/feed/rss" },
            // ── 世界のニュース ────────────────────────────────
      { name: "BBC Japan",        url: "https://feeds.bbci.co.uk/japanese/rss.xml" },
      { name: "時事通信",          url: "https://www.jiji.com/rss/ranking.rdf" },
      { name: "CNN Japan",        url: "https://feeds.cnn.co.jp/cnn/rss" },
      { name: "NHK 国際",          url: "https://news.web.nhk/n-data/conf/na/rss/cat6.xml" },
      // ── AI 専門メディア ──────────────────────────────────────
      { name: "TechCrunch AI",    url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
      { name: "VentureBeat AI",   url: "https://venturebeat.com/category/ai/feed/" },
      { name: "MIT Tech Review",  url: "https://www.technologyreview.com/feed/" },
      { name: "The Verge AI",     url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
      { name: "Ars Technica AI",  url: "https://arstechnica.com/ai/feed/" },
      { name: "ITmedia AI+",      url: "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml" },
      { name: "Publickey",        url: "https://www.publickey1.jp/atom.xml" },
      // ── 公式ブログ ───────────────────────────────────────────
      { name: "OpenAI Blog",      url: "https://openai.com/news/rss.xml" },
      { name: "Google Research",   url: "https://research.google/blog/rss/" },
      { name: "Hugging Face",     url: "https://huggingface.co/blog/feed.xml" },
      { name: "Google DeepMind",  url: "https://deepmind.google/blog/rss.xml" },
    ],
  },
  
};
