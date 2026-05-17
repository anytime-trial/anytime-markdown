<!--
評価レポート skeleton (anytime-reverse-spec Phase E4 で使用)

出力先: {outputDir}/_eval/{YYYYMMDD-HHmmss}-eval.ja.md

プレースホルダ:
- {{timestamp_iso}}      : ISO 8601 UTC タイムスタンプ
- {{golden_commit}}      : git HEAD short hash (例: a3f21b)
- {{candidate_dir}}      : 評価対象ディレクトリ絶対パス
- {{overall_score}}      : 全体スコア (小数 2 桁、例: 0.81)
- {{threshold}}          : しきい値 (例: 0.75)
- {{pass_or_fail}}       : "PASS" または "FAIL"
- {{total_files}}        : 対象ファイル数 (例: 43)
- {{top_level_count}}    : トップレベル章数 (例: 12)
- {{feature_detail_count}} : 機能詳細数 (例: 31)
- {{unmatched_count}}    : unmatched 合計
- {{top_level_table}}    : トップレベル章スコア表 (markdown)
- {{feature_detail_table}} : 機能詳細スコア表 (markdown)
- {{regression_section}} : ⚠ Regression Findings (overall<threshold が 1 件以上なら埋める)
- {{unmatched_section}}  : Unmatched セクション (内容: candidate-only / reference-only)
- {{detail_section}}     : <details> で折りたたんだ章別軸別詳細

ガイダンス:
- regression が 0 件のときは "{{regression_section}}" を「(なし)」と置換
- unmatched が 0 件のときは "{{unmatched_section}}" 全体を省略可
-->

---
title: "anytime-reverse-spec 評価レポート"
type: "report"
lang: "ja"
date: "{{timestamp_iso}}"
category: "basic-design/eval"
excerpt: "git HEAD ({{golden_commit}}) を golden として markdown 全 {{total_files}} ファイルを 3 軸採点した結果。overall {{overall_score}} ({{pass_or_fail}})。"
---


## サマリ

- **Golden**: git HEAD (commit `{{golden_commit}}`)
- **Candidate**: `{{candidate_dir}}`
- **Overall Score**: `{{overall_score}}` (threshold `{{threshold}}` {{pass_or_fail}})
- **対象ファイル数**: {{total_files}} (トップレベル章 {{top_level_count}} + 機能詳細 {{feature_detail_count}})
- **Unmatched**: {{unmatched_count}}


## トップレベル章スコア ({{top_level_count}})

{{top_level_table}}


## 機能詳細スコア ({{feature_detail_count}}, 折りたたみ)

<details><summary>03.feature-detail/ 全 {{feature_detail_count}} ファイル</summary>

{{feature_detail_table}}

</details>


## ⚠ Regression Findings

{{regression_section}}


## Unmatched

{{unmatched_section}}


## 詳細スコア (章別軸別)

{{detail_section}}


<!--
## トップレベル章スコア表のフォーマット例

| 章 | Heuristic | LLM | Overall | 判定 |
| --- | --- | --- | --- | --- |
| `00-index.ja.md` | 0.95 | 0.98 | 0.96 | ✓ |
| `01-system-overview.ja.md` | 0.77 | 0.85 | 0.81 | ✓ |
| `04-data-model.ja.md` | 0.62 | 0.58 | 0.60 | ✗ |

## Regression Findings のフォーマット例 (overall<threshold の章のみ)

### `04-data-model.ja.md` (overall 0.60)

- **軸別下落**: intent 0.52 / design 0.61 / completeness 0.83
- **主因推測**:
  - 識別子 Jaccard 大幅低下 → スキーマセクションのテーブル名表記が変更
  - 完全一致 cosine だけ下がっている → 同義語言い換え (「テーブル」⇔「エンティティ」)
- **LLM notes**: "candidate ではマイグレーション手順セクションが消失している"
- **推奨アクション**: `chapter=4` で再生成、`templates/04-data-model.ja.md` の構造が変わっていないか確認

## Unmatched のフォーマット例

- **candidate-only** (golden に存在しない): `12-extra.ja.md` (スキルが章追加？)
- **reference-only** (candidate に存在しない): (なし)

## 詳細スコアのフォーマット例 (章ごとに <details>)

<details><summary>01-system-overview.ja.md</summary>

- **Intent**: cosine 0.78 / LLM 0.85
- **Design**:
  - identifier Jaccard 0.82
  - heading Jaccard 0.71
  - heuristic 合算 0.78 (0.6 × 0.82 + 0.4 × 0.71)
  - LLM 0.85
- **Completeness**:
  - golden 見出し 8 個 / candidate 一致 6 個 (heuristic 0.75)
  - LLM 0.85
- **LLM notes**: "同義語言い換えで heuristic 低めだが意図一致"

</details>
-->
