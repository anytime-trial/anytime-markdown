<!--
採点プロンプト雛形 (anytime-reverse-spec Phase E3 で使用)

スキル実行 Agent (Claude) が各 pair について採点する際、本ファイルを Read
してから {{placeholder}} を pair の値に置き換えてプロンプトとして利用する。

プレースホルダ:
- {{file}}              : 章ファイル名 (例: 01-system-overview.ja.md)
- {{golden_excerpt}}    : MCP ツールから返された golden 抜粋
- {{candidate_excerpt}} : MCP ツールから返された candidate 抜粋
-->

あなたは anytime-reverse-spec が生成した基本設計書を評価する専門家です。

REFERENCE は git HEAD で凍結した「正解」、CANDIDATE は今回再生成された候補です。
両者は同じ章 ({{file}}) を扱います。

CANDIDATE を REFERENCE に対して **3 軸 (各 0.0〜1.0)** で採点してください。
日本語の同義語言い換え・順序入れ替え・冗長表現の差異は **意図が一致していれば減点しない**。
heuristic スコア (TF cosine と識別子 Jaccard) では拾えないニュアンスを評価することがあなたの役割です。

## 1. Intent Similarity

目的・対象読者・スコープが同じか。

- 1.0 = 完全一致 (同じ章の目的、同じ読者像、同じ取り扱い範囲)
- 0.5 = 部分的に重なる (主目的は同じだが副次的な対象範囲が異なる)
- 0.0 = 全く別物 (別の章を書いてしまっている)

## 2. Design Similarity

アーキテクチャ判断・データモデル・主要識別子 (クラス名 / テーブル名 / API パス) が一致するか。

- 1.0 = 同じ構成要素 (同じコンポーネント・同じ依存方向・同じ命名)
- 0.5 = 高レベルでは一致 (主要コンポーネント名は揃うが細部の方針差あり)
- 0.0 = 別アプローチ (登場するコンポーネントセットが異なる、データモデルが矛盾)

## 3. Completeness

REFERENCE のトピックを CANDIDATE が網羅するか。

- 1.0 = 全章節カバー (REFERENCE の見出し・小節がすべて CANDIDATE に存在)
- 0.5 = 主要節カバーだが脱落あり (テーブル詳細、ユースケース、制約などが一部抜けている)
- 0.0 = 大半が欠落 (REFERENCE の半分以上の節が CANDIDATE で見当たらない)

## 出力形式

回答は **JSON のみ** (コードフェンスなし、前置きなし、JSON 後のテキストなし):

```
{"intent": 0.0, "design": 0.0, "completeness": 0.0, "notes": "簡潔な根拠 1-2 文"}
```

`notes` には heuristic では拾えなかった観点 (同義語言い換え / セクション再構成 /
新規追加トピック / 重要な脱落) を 1-2 文で記載してください。

---

## REFERENCE ({{file}})

{{golden_excerpt}}

---

## CANDIDATE ({{file}})

{{candidate_excerpt}}
