# AIニュース（Morning Brief）

RSSフィード（既定）またはXのホームタイムラインから24時間以内のニュースを収集し、
Claude が記事本文を読みウェブ検索で裏付けを取って分析し、LINEに配信する自動配信ツール。
Claude が失敗したら Gemini、それも失敗したら記事ベースの簡易版で配信する。
GitHub Actions で毎朝 03:37 JST に実行される（`.github/workflows/daily-news.yml`）。

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
│   ├── url-summarizer.ts # 予備ルート: Gemini Flash で各URL要約
│   ├── analyze.ts       # 予備ルート: Gemini で最終トレンド分析 + ツールアドバイザー
│   ├── fallback.ts      # Claude も Gemini も落ちたときの記事ベース簡易分析
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
3. `src/analysis/claude-analyze.ts` — 処理（Gemini の予備ルートは `analyze.ts`）
4. `src/delivery/line.ts` — 届ける先
5. `src/settings.ts` — 設定を変えたいとき

## GitHub Secrets

ワークフローは `USE_RSS=true` で走るため、X 系のシークレットは現在使っていない。

| シークレット名 | 用途 |
|---|---|
| `JINA_API_KEY` | Jina Reader。**401 のときは鍵なしで引き直すので、失効しても本文取得は止まらない** |
| `ANTHROPIC_API_KEY` | Claude（本命の分析）。**未設定・失敗時は Gemini で配信が続く** |
| `GEMINI_API_KEY` | Gemini（Claude が失敗したときの予備） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API のチャネルアクセストークン |
| `LINE_USER_ID` | 配信先ユーザーID（`LINE_USER_ID_2` は任意） |

X API ルート（`USE_RSS=false` かつ `USE_SAMPLE_DATA=false`）に戻す場合のみ、
`X_CONSUMER_KEY` / `X_CONSUMER_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` が追加で要る。

## 禁止事項

- curl で直接 LINE API / X API を叩かない
- `src/settings.ts` 以外のファイルで設定値をハードコードしない
- 受講生に見せたいエラー文言は `UserFacingError` の `message` に入れる（`main.ts` が `[USER-FACING]` プレフィックス付きで出力する）。`throw new Error(...)` だけだと `[INTERNAL]` 扱いになり、受講生が混乱する
