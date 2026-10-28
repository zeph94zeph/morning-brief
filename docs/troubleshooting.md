# 困ったとき

## GitHub Actions のログの読み方

1. リポジトリの **Actions** タブを開く
2. 実行したワークフローをクリック
3. **run** ジョブをクリックして各ステップを展開
4. `[USER-FACING]` で始まる行を最優先で読む — 次に何をすべきかが書いてある
5. `[INTERNAL]` で始まる行は開発者向けの詳細情報

---

## エラー別の対処法

### X API

| 症状 | 原因 | 対処 |
|---|---|---|
| `401 Unauthorized` | 4つのキーのいずれかが間違っているか期限切れ | console.x.com → アプリ → キーとトークン → 「OAuth 1.0 キー」のアクセストークンを再生成し、GitHub Secrets を更新 |
| `429 Too Many Requests` | レート制限に到達 | 15分待機してから再実行。`src/settings.ts` の `maxTweets` を下げる |
| X API が使えない / 申請が通らない | pay-per-use の Billing 未設定、または申請待ち | X Developer Portal → Billing → Add payment method。申請中は `USE_SAMPLE_DATA=true` のモックルートで動作確認 |

### Jina Reader

| 症状 | 原因 | 対処 |
|---|---|---|
| `402` / `401` | 鍵の無料枠が枯渇 / 鍵が無効 | **鍵なしに自動で切り替えて取得を続ける**ため配信は止まらない。ただし鍵なしは回数制限が厳しく本文の取りこぼしが増えるので、jina.ai で鍵を再発行して GitHub Secrets の `JINA_API_KEY` を更新する |

### Claude

Claude が失敗しても配信は止まらず、記事の見出しだけの簡易版が届く（最初の項目に「本日は Claude の分析に失敗したため…」と入る）。
Gemini には自動で切り替えない。クレジットが切れて当面 Claude を使わないなら、`src/settings.ts` の `claude.enabled` を `false` にすると Gemini（代替案）で分析する。

| 症状 | 原因 | 対処 |
|---|---|---|
| LINE に「Claude の分析に失敗したため」と出る | クレジット残高切れ・期限切れ、または `ANTHROPIC_API_KEY` の誤り | Claude Console（platform.claude.com）の Billing で残高と有効期限を確認。クレジットを購入するか、`src/settings.ts` の `claude.enabled` を `false` にして Gemini（代替案）に切り替える |
| `401 authentication_error` | APIキーの誤り・失効 | Claude Console で再発行し、GitHub Secrets の `ANTHROPIC_API_KEY` を更新 |
| 費用が想定より多い | 記事本文・検索の量が多い | ログの `[Claude 調査]` 行でトークン数と検索回数を確認。`claude.maxWebSearches` / `claude.maxArticleChars` / `urlContent.maxUrls` を下げる |
| `web search is not enabled` | 組織の設定でウェブ検索が無効 | Claude Console の設定で有効にするか、`claude.maxWebSearches` を `0` に |

### Gemini（代替案。claude.enabled=false のときだけ）

| 症状 | 原因 | 対処 |
|---|---|---|
| `400 API key not valid` | APIキーの誤り | aistudio.google.com で再発行し、GitHub Secrets の `GEMINI_API_KEY` を更新 |
| `429 Resource exhausted` | Free枠の1日上限超過（Flash 250/day, Pro 100/day） | 明日まで待つ。手動実行は1日1〜2回に抑える |
| `SAFETY filter` | ツイート内容がセーフティフィルタに抵触 | `maxTweets` を減らす。タイムラインのフォロー先を見直す |

### Slack

| 症状 | 原因 | 対処 |
|---|---|---|
| `channel_not_found` | `SLACK_CHANNEL` のIDが間違っている | Slackでチャンネルを右クリック → チャンネル詳細 → 最下部のID（`C`で始まる文字列）をコピーし直す |
| `not_in_channel` | BotアプリがチャンネルにいないBot | チャンネルで `/invite @あなたのBot名` を実行 |
| `not_authed` / `invalid_auth` | `SLACK_BOT_TOKEN` が間違っているか期限切れ | api.slack.com → アプリ → OAuth & Permissions → Bot User OAuth Token を再コピー |

### RSS

| 症状 | 原因 | 対処 |
|---|---|---|
| ログに `[RSS] ○○: 0件（記事 N件 / 最新 …）` | 「最新」が何日も前ならフィードの更新停止。数日以内なら単にその日の投稿がないだけ | Actions の **Check Feeds** を手動実行して全フィードの状態を確認。止まっていれば `src/settings.ts` の URL を差し替える（「Run workflow」の欄に候補 URL を入れると一緒に確かめられる） |
| `フィード取得失敗: HTTP 429` | 配信元のアクセス制限 | 続くようならそのフィードを外す |

### その他

| 症状 | 原因 | 対処 |
|---|---|---|
| 成功扱い（緑）だが Slack に投稿がない | `maxTweets: 0` や `lookbackHours: 0` の誤設定 | `src/settings.ts` の値を確認 |
| Actions がずっと黄色（実行中） | Jina Reader の大量タイムアウト | `src/settings.ts` の `urlContent.parallelism` を `5` に下げる、または `urlContent.enabled` を `false` にして再実行 |
