---
name: anytime-token-budget
effort: medium
description: Trail の trail.db(session_costs/sessions)を集計し、セッション粒度の LLM コスト(token budget)レポートを前回比デルタで生成する。Opus コスト占有率・cache_read 二乗膨張・「高コスト×/compact 未使用」セッション衛生を定量化し、閾値超なら改善提案へ昇格する。「/anytime-token-budget」「token budget」「トークン予算」「LLM コスト」「Opus コスト」「セッションコスト分析」の指示、または週次スケジュールからの起動で使用する。
---

# anytime-token-budget — LLM コストの定期分析

Trail が蓄積する `trail.db` を集計し、**セッション粒度**の LLM コストレポートを出力する。狙いは RC2（Opus メインの超長大セッションが `/clear`・`/compact` なしで継続し `cache_read` が「文脈サイズ×ターン数」で二乗膨張する）の継続監視。`anytime-dev-health` の集計レベルの cost glance と異なり、本スキルは**セッション別ランキング・モデル別内訳・セッション衛生（高コスト×compact 未使用）・週次トレンド**を扱う。

- 分析対象 DB（read-only）: `<workspace>/.anytime/trail/db/trail.db`
- 主テーブル: `session_costs`（session×model 別・`estimated_cost_usd` 算出済み）/ `sessions`（`message_count` / `peak_context_tokens` / `compact_count` / `sub_agent_count` / `git_branch` / `start_time`）
- 出力先: `/Shared/anytime-markdown-docs/`（`report/_signals/token-budget/` ＝スナップショット、`report/` ＝レポート、`proposal/` ＝閾値超の改善提案）
- 背景: RC2 の根本原因分析は `proposal/20260622-trail-data-driven-dev-improvement.ja.md`、トークン削減の既往分析は `report/20260619-feature-token-consumption-analysis.ja.md` / `proposal/20260619-token-usage-reduction.ja.md` を参照。

## 手順

### 0. 前提

- **DB は read-only・出力は docs のみ・自動実装/マージはしない**。
- grounding は `node:sqlite` で完結し MCP 非依存（headless `claude -p` でも完走する）。
- `estimated_cost_usd` は推定値（サブスク枠の相対比較用）。絶対額でなく**占有率・デルタ・集中度**で読む。

### 1. grounding（決定論・LLM 不要）

スキル同梱の集計スクリプトを実行し、signals snapshot(JSON) を得て保存する。

```bash
mkdir -p /Shared/anytime-markdown-docs/report/_signals/token-budget
node .claude/skills/anytime-token-budget/grounding.cjs > /Shared/anytime-markdown-docs/report/_signals/token-budget/<YYYYMMDD>.json
```

- `<YYYYMMDD>` は snapshot の `generatedAt` を JST に変換した日付。保存先は初回未作成のため上記 `mkdir -p` で必ず先に用意する。
- DB が cwd 相対で見つからない場合は引数で明示: `node .claude/skills/anytime-token-budget/grounding.cjs <workspace>/.anytime/trail/db`。
- 出力の `errors` 配列を**必ず確認**する。空でなければ（スキーマ変化等でクエリが失敗している）、その旨をレポート冒頭に明記し、該当シグナルは「測定不能」として扱う（誤った 0 を真値にしない）。

### 2. デルタ検出（最重要）

`report/_signals/token-budget/` から**今回より前の最新スナップショット**を 1 つ選び、主要メトリクスを今回と比較する。比較対象メトリクス:

| メトリクス | 源 | 悪化方向 |
| --- | --- | --- |
| Opus コスト占有率 `totals.opusCostSharePct` | session_costs | 上昇 |
| Opus cache_read 占有率 `totals.opusCacheReadSharePct` | session_costs | 上昇 |
| top15 セッションのコスト集中 `totals.top15SessionsCostSharePct` | session_costs | 上昇 |
| 直近 7d コスト `trend.last7dCost`（対 `prior7dCost`） | session_costs+sessions | 上昇 |
| 高コスト×compact 未使用 `hygiene.expensiveNoCompact` | join | 上昇 |
| 超長大×compact 未使用 `hygiene.longNoCompact` | sessions | 上昇 |
| 高コストセッション数 `hygiene.expensiveSessions` | session_costs | 上昇 |

- 各メトリクスを **新規発生 / 悪化 / 改善 / 横ばい** に分類する。
- `topSessions` は前回スナップショットに無い `hygieneFlag='expensive-no-compact'` の新規セッションを特に注視する。
- 前回スナップショットが無い（初回）場合は全メトリクスを「初期値（baseline）」として記録し、デルタ比較はスキップする。

### 3. レポート（常時出力）

`/Shared/anytime-markdown-docs/report/<YYYYMMDD>-token-budget.ja.md` を出力する。`anytime-markdown-output` スキルの書式（frontmatter `type: report`）に従う。

構成:

- frontmatter（`title` / `date` / `type: report` / `lang: ja` / `author` / `excerpt`）
- **サマリ**: 前回比で悪化/改善した上位シグナルを 3〜5 行（Opus 占有率・直近コスト・衛生）。
- **デルタ表**: メトリクス / 前回 / 今回 / 変化（↑↓→・新規）。**変化があった行を上に**。
- **モデル別コスト内訳**: `byModel`（model / sessions / cost / cacheRead）。Opus 比率を強調。
- **コスト上位セッション**: `topSessions` を表で（session / cost / messageCount / peakContextTokens / compactCount / gitBranch / hygieneFlag）。
- **セッション衛生**: `hygiene`（expensiveNoCompact 等）と所見。
- **週次トレンド**: `trend.weekly`。
- **grounding errors**（あれば）: 測定不能だったシグナル。
- 末尾に「次アクション候補」を箇条書き（提案に昇格したものは proposal へのリンク）。

出力後 `bash ~/.claude/scripts/validate-markdown.sh <file>` で検証する。

### 4. 改善提案への昇格（閾値超のみ）

下記いずれかを満たすシグナルがあれば、`anytime-proposal` スキル（**既定 lightweight**・1 提案 = 1 論点）で改善提案を生成し `proposal/<YYYYMMDD>-<topic>.ja.md` に出力する。満たさなければレポートのみで終了。

昇格閾値（いずれか）:

- `totals.opusCostSharePct` が 90% 超かつ前回比 +3pt 以上（Opus 偏重の進行）。
- `trend.last7dCost` が `trend.prior7dCost` の +30% 以上（コスト急増）。
- `hygiene.expensiveNoCompact` が前回比 +5 以上、または高コストセッションの過半が compact 未使用。
- `topSessions` に前回スナップショットに無い `hygieneFlag='expensive-no-compact'` の新規セッションが出現。
- `totals.top15SessionsCostSharePct` が前回比 +5pt 以上（少数セッションへの集中悪化）。

> 提案の方向は RC2 の恒久/暫定対策（P6 モデル委譲徹底・T1 セッション衛生通知・T2 本レポート・T3 retention）に紐付ける。deep モード（`anytime-proposal --deep`）は複数シグナルの同時悪化時かユーザー明示時のみ。

### 5. ガードレール / 申し送り

- grounding が `errors` を返したら silent に 0 を採用しない（測定不能として明示）。
- レポートは毎回出すが、**proposal は閾値超のみ**（ノイズ抑制）。
- `estimated_cost_usd` は推定。**占有率・デルタで読み、絶対額の精度を主張しない**。
- DB の値は ingest ラグ（数十分〜Reload Window）を含む。直近セッションは未集計の場合がある旨をレポートに注記。
- 閾値（`EXPENSIVE_COST_USD=20` / `LONG_SESSION_MSGS=1000`）は grounding.cjs 冒頭の定数。運用実績に応じて調整可。

## スケジューラ連携（本スキルの範囲外）

本スキルはスケジューラ非依存の可搬コア。週次自動実行の配線（Desktop Scheduled Task 等）は `anytime-dev-health` と同じ選定論点（`plan/20260622-periodic-dev-health-analysis.ja.md`）に従う。手動でも `/anytime-token-budget` で実行できる。
