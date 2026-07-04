---
name: anytime-dev-health
effort: medium
description: Trail の 3DB(memory-core/doc-core/trail)を横断分析し、前回からのデルタに基づく開発健全性レポートと(閾値超なら)改善提案を生成する。「/anytime-dev-health」「定期分析」「開発健全性」「dev health」「健全性レポート」の指示、または週次スケジュールからの起動で使用する。
---

# anytime-dev-health — 開発健全性の定期分析

更新日: 2026-07-04

Trail が蓄積する 3 つのローカル DB を横断分析し、**前回からの変化（デルタ）に基づく**健全性レポートを出力する。変化が閾値を超えたシグナルだけ改善提案に昇格させる（毎回同じ指摘を繰り返さないのが本スキルの肝）。

- 分析対象 DB（read-only）: `<workspace>/.anytime/trail/db/{trail.db, memory-core.db, doc-core.db}`
- 分析対象ソース（read-only 走査）: ワークスペース配下の `SHORTCUT:` 意図的簡略化マーカー（台帳化・`no-trigger` 検出）。規約は `~/.claude/rules/code-quality.md` 2.1。
- 出力先: `/Shared/anytime-markdown-docs/`（`report/_signals/` ＝スナップショット、`report/` ＝健全性レポート、`proposal/` ＝閾値超の改善提案）
- 設計背景・スケジューラ選定は `plan/20260622-periodic-dev-health-analysis.ja.md` を参照。

## 手順

### 0. 前提

- **DB は read-only・出力は docs のみ・自動実装/マージはしない**。
- grounding は `node:sqlite` で完結し MCP 非依存（headless `claude -p` でも完走する）。

### 1. grounding（決定論・LLM 不要）

スキル同梱の集計スクリプトを実行し、signals snapshot(JSON) を得て保存する。

```bash
mkdir -p /Shared/anytime-markdown-docs/report/_signals
node .claude/skills/anytime-dev-health/grounding.cjs > /Shared/anytime-markdown-docs/report/_signals/<YYYYMMDD>.json
```

- `<YYYYMMDD>` は snapshot の `generatedAt` を JST に変換した日付。保存先 `_signals/` は初回未作成のため上記 `mkdir -p` で必ず先に用意する。
- 出力の `errors` 配列を**必ず確認**する。空でなければ（スキーマ変化等でクエリが失敗している）、その旨をレポート冒頭に明記し、該当シグナルは「測定不能」として扱う（誤った 0 を真値にしない）。

### 2. デルタ検出（最重要）

`report/_signals/` から**今回より前の最新スナップショット**を 1 つ選び、主要メトリクスを今回と比較する。比較対象メトリクス:

| メトリクス | 源 | 悪化方向 |
| --- | --- | --- |
| Opus コスト占有率 `cost.opusCostSharePct` | trail | 上昇 |
| cache_read 占有率 `cost.cacheReadSharePct` | trail | 上昇 |
| 1000msg 超セッション数 `activity.sessionsOver1000Msgs` | trail | 上昇 |
| 未対処 finding `quality.unaddressedFindings` | memory | 上昇 |
| reviewer 空 `quality.reviewerEmpty` | memory | 上昇 |
| bug:review 比 `quality.bugToReviewRatio` | memory | 上昇 |
| 未解決 drift `drift.unresolved` と `drift.byType` | memory | 上昇 / 新種別出現 |
| embedding 充足率 `docCore.embeddingCoveragePct` | doc-core | 低下 |
| 孤立 doc `docCore.orphanDocs` | doc-core | 上昇 |
| cc>15 関数数 `hotspotOver15` と `hotspots` top | trail | 上昇 / 新規高 cc 関数 |
| SHORTCUT 技術負債 `techDebt.shortcutMarkers` / `techDebt.noTriggerMarkers` | source | 上昇 / no-trigger 増 |
| スキル健全性 `skillHealth.brokenRefs` / `staleOver90` / `unused30d` | source+trail | 上昇 |

- 各メトリクスを **新規発生 / 悪化 / 改善 / 横ばい** に分類する。
- 前回スナップショットが無い（初回）場合は全メトリクスを「初期値」として記録し、デルタ比較はスキップする。

### 3. 健全性レポート（常時出力）

`/Shared/anytime-markdown-docs/report/<YYYYMMDD>-dev-health.ja.md` を出力する。`anytime-markdown-output` スキルの書式（frontmatter `type: report`）に従う。

構成:

- frontmatter（`title` / `date` / `type: report` / `lang: ja` / `author` / `excerpt`）
- **サマリ**: 前回比で悪化/改善した上位シグナルを 3〜5 行。
- **デルタ表**: メトリクス / 前回 / 今回 / 変化（↑↓→・新規）。**変化があった行を上に**。
- **現在の主要シグナル**: hotspot top・drift 種別内訳・コスト内訳・SHORTCUT 技術負債（総数 / no-trigger 内訳・top ファイル）・スキル健全性（総数 / 参照切れ / 90 日超 stale / 30 日未使用・利用 top）など現状値。
- **grounding errors**（あれば）: 測定不能だったシグナル。
- 末尾に「次アクション候補」を箇条書き（提案に昇格したものは proposal へのリンク）。

出力後 `bash ~/.claude/scripts/validate-markdown.sh <file>` で検証する。

### 4. 改善提案への昇格（閾値超のみ）

下記いずれかを満たすシグナルがあれば、`anytime-proposal` スキル（**既定 lightweight**・1 提案 = 1 論点）で改善提案を生成し `proposal/<YYYYMMDD>-<topic>.ja.md` に出力する。満たさなければレポートのみで終了。

昇格閾値（いずれか）:

- 新しい種別の drift が出現、または `drift.unresolved` が前回比 +20% 以上。
- `docCore.embeddingCoveragePct` が 90% を下回る、または前回比 10pt 以上低下。
- `quality.unaddressedFindings` が前回比 +10 以上、または `quality.reviewerEmpty` が増加して全レビューの過半。
- `hotspots` に前回スナップショットに無い cc>200 の新規関数が出現。
- `cost.opusCostSharePct` が前回比 +5pt 以上、または `cacheReadSharePct` が 99% 超で `sessionsOver1000Msgs` が増加。
- `techDebt.noTriggerMarkers` が前回比 +5 以上、または `techDebt.noTriggerSharePct` が 50% 超（昇格経路なき簡略化が支配的）。
- `skillHealth.brokenRefs` が 1 以上（参照切れの放置）、または `staleOver90` が前回比増かつ `unused30d` が総数の過半（棚卸し要否の判断材料）。

> deep モード（`anytime-proposal --deep` 専門観点パネル）は**コストが高い**ため、複数の重大シグナルが同時悪化した場合か、ユーザーが明示した場合のみ使う。定期実行の既定は lightweight。

### 5. ガードレール / 申し送り

- grounding が `errors` を返したら silent に 0 を採用しない（測定不能として明示）。
- 健全性レポートは毎回出すが、**proposal は閾値超のみ**（ノイズ抑制）。
- DB の値は ingest ラグ（数十分〜Reload Window）を含む。直近の修正反映は遅延し得る旨をレポートに注記。

## スケジューラ連携（本スキルの範囲外）

本スキルはスケジューラ非依存の可搬コア。週次自動実行の配線（Desktop Scheduled Task 等）は `plan/20260622-periodic-dev-health-analysis.ja.md` の「スケジューリング」を参照。手動でも `/anytime-dev-health` で実行できる。
