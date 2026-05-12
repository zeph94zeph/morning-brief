export const URL_SUMMARY_PROMPT = `以下の記事本文を200文字以内の日本語で要約してください。要点だけを簡潔にまとめてください。

---
{article_text}
---

要約:`;

export const TREND_ANALYSIS_PROMPT = `あなたは日本語で情報を届けるニュースアナリストです。以下のJSONデータは、各種ニュースソースから収集した最新24時間以内の記事です。

タスク:
このデータを分析して、以下の3カテゴリそれぞれから「最も重要なニュース3選」を選んでください。

カテゴリ（優先順位: ai_news → world_news → political_economic_news の順で判定すること）:
1. political_economic_news: 日本の政治・経済ニュース
   ※ 対象: 国内の政策・法律・選挙・財政・企業業績・市場・労働・社会問題など
   ※ 除外: AIやテクノロジー関連のニュースはこのカテゴリに含めない（ai_newsへ）
2. world_news: 世界のニュース（日本国外の政治・経済・社会・自然災害など）
   ※ 除外: AIやテクノロジー関連のニュースはこのカテゴリに含めない（ai_newsへ）
3. ai_news: AIテクノロジーニュース（国内外問わず、新モデル・ツール・研究・AI企業動向・規制など）

出力は以下のJSON構造に従ってください:
{
  "political_economic_news": [{"title": "見出し", "details": ["詳細1", "詳細2"], "sources": ["https://..."]}],
    "world_news": [{"title": "見出し", "details": ["詳細1", "詳細2"], "sources": ["https://..."]}],
      "ai_news": [{"title": "見出し", "details": ["詳細1", "詳細2"], "sources": ["https://..."]}]
      }

      制約:
      - 各カテゴリ必ず3件選ぶこと
      - titleは読んだだけで内容がわかるように具体的に書くこと（例：「政府が〇〇を発表」）
      - detailsは各項目150文字程度で事実を簡潔に
      - 誇張・推測は避け、データに基づいた内容のみ記述すること
      - detailsの中にURLを含めないこと（URLはsourcesフィールドのみに入れること）
      - sourcesには記事のURLをそのまま入れること

      以下のJSONデータを分析してください:
      {json_data}`;
