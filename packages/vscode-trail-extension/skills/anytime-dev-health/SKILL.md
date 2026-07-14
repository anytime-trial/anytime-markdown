---
name: anytime-dev-health
effort: medium
description: Trail の 3DB(memory-core/doc-core/trail)を横断分析し、前回からのデルタに基づく開発健全性レポートと(閾値超なら)改善提案を生成する。「/anytime-dev-health」「定期分析」「開発健全性」「dev health」「健全性レポート」の指示、または週次スケジュールからの起動で使用する。「セットアップ監査」「環境監査」「環境診断」「setup audit」「Claude Code 設定の診断」の指示では references/setup-audit.md のセットアップ監査モードを使用する。
---

# anytime-dev-health — 開発健全性の定期分析

更新日: 2026-07-14

Trail が蓄積する 3 つのローカル DB を横断分析し、**前回からの変化（デルタ）に基づく**健全性レポートを出力する。変化が閾値を超えたシグナルだけ改善提案に昇格させる（毎回同じ指摘を繰り返さないのが本スキルの肝）。

- 分析対象 DB（read-only）: `<workspace>/.anytime/trail/db/{trail.db, memory-core.db, doc-core.db}`
- 分析対象ソース（read-only 走査）: ワークスペース配下の `SHORTCUT:` 意図的簡略化マーカー（台帳化・`no-trigger` 検出。判定はスキル同梱 `shortcutMarkers.cjs` に一本化し、CI ゲート `scripts/check-shortcut-markers.mjs`＝`npm run check-skills` と同一実装）。規約は `~/.claude/rules/code-quality.md` 2.1。
- 分析対象メモリ（read-only 走査）: プロジェクトメモリ（`~/.claude/projects/<project>/memory/*.md`）の再発シグナル（スキル同梱 `recurrence.cjs`）。「同種の罠 2 回再発で constraint 昇格」「スキル乖離 2 回でスキル本文反映」の昇格候補を機械提示する。**検出のみで自動書き込みはしない**（メモリ領域は保護領域。作成はユーザー承認後）。
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
| Opus コスト占有率 `costWindow30d.opusCostSharePct` | trail | 上昇 |
| cache_read 占有率 `costWindow30d.cacheReadSharePct` | trail | 上昇 |
| 1000msg 超セッション数 `costWindow30d.sessionsOver1000Msgs` | trail | 上昇 |
| 未対処 finding `quality.unaddressedFindings` | memory | 上昇 |
| reviewer 空 `quality.reviewerEmpty` | memory | 上昇 |
| bug:review 比 `quality.bugToReviewRatio` | memory | 上昇 |
| 未解決 drift（`drift.byType` から spec_vs_code を除いて算出。設計書ドリフトは dev-cycle 段5 へ移管） | memory | 上昇 / 新種別出現 |
| embedding 充足率 `docCore.embeddingCoveragePct` | doc-core | 低下 |
| 孤立 doc `docCore.orphanDocs` | doc-core | 上昇 |
| cc>15 関数数 `hotspotOver15` と `hotspots` top | trail | 上昇 / 新規高 cc 関数 |
| SHORTCUT 技術負債 `techDebt.shortcutMarkers` / `techDebt.noTriggerMarkers` | source | 上昇 / no-trigger 増 |
| スキル健全性 `skillHealth.brokenRefs` / `staleOver90` / `unused30d` | source+trail | 上昇 |
| 再発シグナル `recurrence.danglingClusters` / `recurrence.uncoveredBugFiles` | memory dir + memory | 新規クラスタ出現 / 増加 |

- **再発の「2 回」判定**: `recurrence.danglingClusters` の同一 target、または `skillHealth.brokenRefs` 対象の同一スキルが**前回スナップショットにも存在**していたら「2 回目」とみなし、R023（constraint メモリ昇格）/ R024（スキル本文反映）の発火候補として §4 の提案へ昇格する。grounding はステートレスに現在値のみ出力し、連続判定は本デルタ比較で行う。

- 各メトリクスを **新規発生 / 悪化 / 改善 / 横ばい** に分類する。
- 前回スナップショットが無い（初回）場合は全メトリクスを「初期値」として記録し、デルタ比較はスキップする。
- **累積指標を増加判定に使わない**: コスト・セッション系は `cost.*`（全期間累積）ではなく `costWindow30d.*`（直近 30 日窓）でデルタを見る。`cost.opusCostSharePct` / `cost.cacheReadSharePct` / `activity.sessionsOver1000Msgs` は全期間累積で**単調増加しかせず**、「増加＝悪化」判定が活動のある限り構造的に発火する（偽陽性）。`cost.*` は現状値の参照用に残す。新メトリクスを追加する際は「累積か期間か・悪化判定と整合するか」を必ず確認する。

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

- spec_vs_code 以外で新しい種別の drift が出現、または spec_vs_code を除く未解決 drift が前回比 +20% 以上。
- `docCore.embeddingCoveragePct` が 90% を下回る、または前回比 10pt 以上低下。
- `quality.unaddressedFindings` が前回比 +10 以上、または `quality.reviewerEmpty` が増加して全レビューの過半。
- `hotspots` に前回スナップショットに無い cc>200 の新規関数が出現。
- `costWindow30d.opusCostSharePct`（30 日窓）が前回比 +5pt 以上、または `costWindow30d.cacheReadSharePct` が 99% 超で `costWindow30d.sessionsOver1000Msgs`（30 日窓）が増加。累積の `cost.*` では機械的に発火するため窓値で判定する。
- `techDebt.noTriggerMarkers` が前回比 +5 以上、または `techDebt.noTriggerSharePct` が 50% 超（昇格経路なき簡略化が支配的）。
- `skillHealth.brokenRefs` が 1 以上（参照切れの放置）、または `staleOver90` が前回比増かつ `unused30d` が総数の過半（棚卸し要否の判断材料）。
- `recurrence.danglingClusters` に前回スナップショットと同一の target が残存（2 回目の観測 = constraint メモリ作成を提案）、または `recurrence.uncoveredBugFiles` に新規ファイルが出現（教訓化されていない再発バグ領域）。提案には対象 target / referrers / ファイルを明記し、メモリ作成自体はユーザー承認後に行う。

> deep モード（`anytime-proposal --deep` 専門観点パネル）は**コストが高い**ため、複数の重大シグナルが同時悪化した場合か、ユーザーが明示した場合のみ使う。定期実行の既定は lightweight。

### 5. ガードレール / 申し送り

- grounding が `errors` を返したら silent に 0 を採用しない（測定不能として明示）。
- 健全性レポートは毎回出すが、**proposal は閾値超のみ**（ノイズ抑制）。
- DB の値は ingest ラグ（数十分〜Reload Window）を含む。直近の修正反映は遅延し得る旨をレポートに注記。
- 設計書ドリフト（spec_vs_code）の検知・昇格は 2026-07-14 に `anytime-dev-cycle` 段5（タスク単位の `check_alignment` / `detect_drift` ゲート）へ移管した。grounding.cjs は drift を集計し続けるが、本スキルは spec_vs_code をデルタ判定・提案昇格に使わない（レポートの現状値表示のみ）。

## セットアップ監査モード（環境・設定の健全性）

「セットアップ監査」「環境監査」「環境診断」「setup audit」の指示では、Trail DB のデルタ分析ではなく **PC 環境と Claude Code 設定の read-only 診断**を行う。手順・診断対象チェックリスト・並列サブエージェント構造・裏取り原則・出力形式は `references/setup-audit.md` に従う。要点:

- 診断フェーズは read-only（読み取り系コマンドのみ・変更はプラン承認後の是正フェーズ）。開始前にスキャンルートと出力形式を確認する。
- サブエージェント報告は一次証拠（`git check-ignore` / `ls-files` / `log --all -S` 等）で裏取りしてから所見にする。
- 出力は現状マップ・影響度×工数マトリクス・理想構成案・段階的実行プラン。前回監査レポートがあれば指摘の解消/残存/新規デルタを含める。

## スケジューラ連携（本スキルの範囲外）

本スキルはスケジューラ非依存の可搬コア。週次自動実行の配線（Desktop Scheduled Task 等）は `plan/20260622-periodic-dev-health-analysis.ja.md` の「スケジューリング」を参照。手動でも `/anytime-dev-health` で実行できる。
