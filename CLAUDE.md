# AIニュース（Morning Brief）

RSSフィード（既定）またはXのホームタイムラインから24時間以内のニュースを収集し、
Claude が記事本文を読みウェブ検索で裏付けを取って分析し、LINEに配信する自動配信ツール。
分析は Claude だけで行い、失敗した日は記事ベースの簡易版を配信する（Gemini には自動で切り替えない）。
Gemini は代替案で、`src/settings.ts` の `claude.enabled` を `false` にしたときだけ使う。
毎朝 04:52 JST に Claude の Routine が GitHub Actions（`.github/workflows/daily-news.yml`）を
手動実行（`source=routine`）で起動し、05:00 前後に届く。GitHub の schedule は数時間遅れるため予備として残し、
直近6時間に配信済みなら何もしない。

## プロジェクト構造

```
src/
├── main.ts              # エントリポイント（最初にここを読む）
├── check-feeds.ts       # RSS フィードの健康診断（配信しない）
├── settings.ts          # 受講生が触る全設定（TS定数）
├── config.ts            # 環境変数の zod 検証
├── types.ts             # 共通型定義
├── sources/
│   ├── rss-feeds.ts     # RSS/Atom 並列取得（USE_RSS=true のとき使う既定ルート）
│   ├── x-timeline.ts    # X API タイムライン取得 + モックルート分岐
│   └── url-content.ts   # Jina Reader で URL 本文並列取得
├── analysis/
│   ├── claude-analyze.ts # 本命。Claude が本文を読み検索で裏取り → JSON に整形（2段階）
│   ├── url-summarizer.ts # 代替案（claude.enabled=false）: Gemini Flash で各URL要約
│   ├── analyze.ts       # 代替案（claude.enabled=false）: Gemini でトレンド分析 + ツールアドバイザー
│   ├── fallback.ts      # AI 分析が失敗したときの記事ベース簡易分析
│   ├── schema.ts        # zod スキーマ（SSoT）
│   └── prompts.ts       # プロンプト（Gemini 用2つ + Claude 用2つ）
├── delivery/
│   ├── line.ts          # LINE Messaging API broadcast（現在の配信先）
│   └── slack.ts         # 旧Slack配信。現在どこからも呼ばれていない
└── utils/
    ├── chunk.ts         # 配列チャンク分割
    ├── errors.ts        # UserFacingError + assertSlackOk
    └── post-optimizer.ts # URL抽出・t.co展開・テキスト整形
```

## 実行方法

```bash
USE_RSS=true npm start         # 通常実行（GitHub Actions と同じルート）
USE_SAMPLE_DATA=true npm start # モックルート（X API / RSS 不要）
npm start                      # X API ルート（X_* のシークレットが要る）
npm run check-feeds            # RSS フィードの健康診断（LINE 配信なし・APIキー不要）
npm test                       # vitest
npm run typecheck              # tsc --noEmit
```

## 読む順番

1. `src/main.ts` — 4ステップの全体像
2. `src/sources/rss-feeds.ts` — ソース元（X ルートを見たいときは `x-timeline.ts`）
3. `src/analysis/claude-analyze.ts` — 処理（代替案の Gemini は `analyze.ts`）
4. `src/delivery/line.ts` — 届ける先
5. `src/settings.ts` — 設定を変えたいとき

## GitHub Secrets

ワークフローは `USE_RSS=true` で走るため、X 系のシークレットは現在使っていない。

| シークレット名 | 用途 |
|---|---|
| `JINA_API_KEY` | Jina Reader。**401（失効）・402（無料枠切れ）のときは鍵なしで引き直すので、本文取得は止まらない** |
| `ANTHROPIC_API_KEY` | Claude（分析）。**未設定・失敗時はその日だけ記事の見出しだけの簡易版になる** |
| `GEMINI_API_KEY` | Gemini（代替案。`claude.enabled=false` のときだけ使う。それ以外は未設定でもよい） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API のチャネルアクセストークン |
| `LINE_USER_ID` | 配信先ユーザーID（`LINE_USER_ID_2` は任意） |

X API ルート（`USE_RSS=false` かつ `USE_SAMPLE_DATA=false`）に戻す場合のみ、
`X_CONSUMER_KEY` / `X_CONSUMER_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` が追加で要る。

## 禁止事項

- curl で直接 LINE API / X API を叩かない
- `src/settings.ts` 以外のファイルで設定値をハードコードしない
- 受講生に見せたいエラー文言は `UserFacingError` の `message` に入れる（`main.ts` が `[USER-FACING]` プレフィックス付きで出力する）。`throw new Error(...)` だけだと `[INTERNAL]` 扱いになり、受講生が混乱する
