---
name: anytime-dev-retro
effort: medium
description: 開発の実績データと事故から改善を還流させるふりかえり（retrospective）。Trail の 3DB(memory-core/doc-core/trail)を横断分析し、セッション粒度の LLM コスト分析（旧 anytime-token-budget を統合）も含めて、前回からのデルタに基づく開発健全性レポートと(閾値超なら)改善提案書＋チケットを生成する。「/anytime-dev-retro」「ふりかえり」「レトロ」「定期分析」「開発健全性」「dev health」「健全性レポート」「token budget」「トークン予算」「LLM コスト」「Opus コスト」「セッションコスト分析」の指示、または週次スケジュールからの起動で使用する。「インシデント分析」「ポストモーテム」「事故分析」「再発防止策をまとめて」の指示、または本番リリース後の障害発生時はインシデントモード（事故の要件化）を使用する。PC 環境・Claude Code 設定の診断（「セットアップ監査」「環境監査」「環境診断」）は anytime-dev-audit を使う。
---

# anytime-dev-retro — 開発のふりかえり（定期分析＋インシデント要件化）

更新日: 2026-07-18

Trail が蓄積する 3 つのローカル DB を横断分析し、**前回からの変化（デルタ）に基づく**健全性レポートを出力する。変化が閾値を超えたシグナルだけ改善提案に昇格させ、提案書に加えてチケットを起票する（毎回同じ指摘を繰り返さないのが本スキルの肝）。

コスト面は**セッション粒度の LLM コスト分析**（Opus 占有率・cache_read 二乗膨張・「高コスト×compact 未使用」のセッション衛生・週次トレンド。旧 `anytime-token-budget` を 2026-07-18 に統合）を含む。実装は専用 grounding（`grounding.token-budget.cjs`）で、3DB 横断の grounding（`grounding.cjs`）と 2 本立てで実行する。リアルタイムのトークン予算監視（Stop フック `token-budget.sh` → viewer タブバー）は本スキルとは別機構で、統合対象外。

- 分析対象 DB（read-only）: `<workspace>/.anytime/trail/db/{trail.db, memory-core.db, doc-core.db}`。コスト詳細は `trail.db` の `session_costs`（session×model 別・`estimated_cost_usd`）/ `sessions`（`message_count` / `peak_context_tokens` / `compact_count` / `sub_agent_count` / `git_branch`）を `grounding.token-budget.cjs` で集計する。
- 分析対象ソース（read-only 走査）: ワークスペース配下の `SHORTCUT:` 意図的簡略化マーカー（台帳化・`no-trigger` 検出。判定はスキル同梱 `shortcutMarkers.cjs` に一本化し、CI ゲート `scripts/check-shortcut-markers.mjs`＝`npm run check-skills` と同一実装）。規約は `~/.claude/rules/code-quality.md` 2.1。
- 分析対象メモリ（read-only 走査）: プロジェクトメモリ（`~/.claude/projects/<project>/memory/*.md`）の再発シグナル（スキル同梱 `recurrence.cjs`）。「同種の罠 2 回再発で constraint 昇格」「スキル乖離 2 回でスキル本文反映」の昇格候補を機械提示する。**検出のみで自動書き込みはしない**（メモリ領域は保護領域。作成はユーザー承認後）。
- 出力先: `<docsRoot>/`（`report/_signals/` ＝スナップショット、`report/` ＝健全性レポート、`proposal/` ＝閾値超の改善提案）
- 設計背景・スケジューラ選定は `plan/20260622-periodic-dev-health-analysis.ja.md`、コスト分析（RC2）の根本原因は `proposal/20260622-trail-data-driven-dev-improvement.ja.md` / `report/20260619-feature-token-consumption-analysis.ja.md` / `proposal/20260619-token-usage-reduction.ja.md` を参照。

## 手順

### 0. 前提

- **DB は read-only・出力は docs のみ・自動実装/マージはしない**。
- grounding は `node:sqlite` で完結し MCP 非依存（headless `claude -p` でも完走する）。

### 1. grounding（決定論・LLM 不要）

スキル同梱の集計スクリプトを **2 本**実行し、signals snapshot(JSON) を得て保存する。

```bash
mkdir -p <docsRoot>/report/_signals <docsRoot>/report/_signals/token-budget
# (1) 3DB 横断の健全性 grounding
node .claude/skills/anytime-dev-retro/grounding.cjs > <docsRoot>/report/_signals/<YYYYMMDD>.json
# (2) セッション粒度のコスト grounding（旧 anytime-token-budget）
node .claude/skills/anytime-dev-retro/grounding.token-budget.cjs > <docsRoot>/report/_signals/token-budget/<YYYYMMDD>.json
```

- `<YYYYMMDD>` は snapshot の `generatedAt` を JST に変換した日付。保存先 `_signals/`・`_signals/token-budget/` は初回未作成のため上記 `mkdir -p` で必ず先に用意する。
- コスト grounding が cwd 相対で DB を見つけられない場合は引数で明示: `node .claude/skills/anytime-dev-retro/grounding.token-budget.cjs <workspace>/.anytime/trail/db`。
- 両出力の `errors` 配列を**必ず確認**する。空でなければ（スキーマ変化等でクエリが失敗している）、その旨をレポート冒頭に明記し、該当シグナルは「測定不能」として扱う（誤った 0 を真値にしない）。

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
| 観点の穴 `quality.checklistNone` / クラスタ `quality.checklistNoneClusters`（checklist_ref='none' のカテゴリ×パッケージ束・2 件以上） | memory | 新規クラスタ出現 / 増加（null は列未マイグレーション＝測定不能） |
| 条文効果 `quality.checklistByRef30d`（章別・30 日窓の観点キー付き指摘件数） | memory | 条文化・改訂した章の件数が減らない（2 回連続はメタ還流対象） |
| 未解決 drift（`drift.byType` から spec_vs_code を除いて算出。設計書ドリフトは dev-cycle 段5 へ移管） | memory | 上昇 / 新種別出現 |
| embedding 充足率 `docCore.embeddingCoveragePct` | doc-core | 低下 |
| 孤立 doc `docCore.orphanDocs` | doc-core | 上昇 |
| cc>15 関数数 `hotspotOver15` と `hotspots` top | trail | 上昇 / 新規高 cc 関数 |
| SHORTCUT 技術負債 `techDebt.shortcutMarkers` / `techDebt.noTriggerMarkers` | source | 上昇 / no-trigger 増 |
| スキル健全性 `skillHealth.brokenRefs` / `staleOver90` / `unused30d` | source+trail | 上昇 |
| スキル発火変化 `skillHealth.usageWindows`（2 窓比較）× `skillHealth.manifestVersions` | source+trail | 版数バンプ（改訂）後に n30 が prev30 比で半減・ゼロ化 |
| 委任成績 `delegation.byVersion`（雛形版数別の 採用/差し戻し/abstain） | docs(plan) | 差し戻し率の上昇 |
| 委任成績(モデル別) `delegation.byModel`（実行系/モデル別の 採用/差し戻し/abstain） | docs(plan) | 特定モデルの差し戻し率の上昇 |
| 見積り予実 `delegation.estimates.referenceClass`（カテゴリ×モデル別の 実測中央値・誤差比中央値） | docs(plan) | n≥5 の組で誤差比中央値が 2.0 超 or 0.5 未満（系統的な過小/過大見積り） |
| 再発シグナル `recurrence.danglingClusters` / `recurrence.uncoveredBugFiles` | memory dir + memory | 新規クラスタ出現 / 増加 |

- **再発の「2 回」判定**: `recurrence.danglingClusters` の同一 target、または `skillHealth.brokenRefs` 対象の同一スキルが**前回スナップショットにも存在**していたら「2 回目」とみなし、R023（constraint メモリ昇格）/ R024（スキル本文反映）の発火候補として §4 の提案へ昇格する。grounding はステートレスに現在値のみ出力し、連続判定は本デルタ比較で行う。

- 各メトリクスを **新規発生 / 悪化 / 改善 / 横ばい** に分類する。
- 前回スナップショットが無い（初回）場合は全メトリクスを「初期値」として記録し、デルタ比較はスキップする。
- **累積指標を増加判定に使わない**: コスト・セッション系は `cost.*`（全期間累積）ではなく `costWindow30d.*`（直近 30 日窓）でデルタを見る。`cost.opusCostSharePct` / `cost.cacheReadSharePct` / `activity.sessionsOver1000Msgs` は全期間累積で**単調増加しかせず**、「増加＝悪化」判定が活動のある限り構造的に発火する（偽陽性）。`cost.*` は現状値の参照用に残す。新メトリクスを追加する際は「累積か期間か・悪化判定と整合するか」を必ず確認する。

**コスト詳細メトリクス**（`grounding.token-budget.cjs` 出力。`report/_signals/token-budget/` の前回スナップショットと比較）: 集計レベルの `costWindow30d.*`（上表）と別に、セッション粒度で以下を比較する。

| メトリクス | 源 | 悪化方向 |
| --- | --- | --- |
| Opus コスト占有率 `totals.opusCostSharePct` | session_costs | 上昇 |
| Opus cache_read 占有率 `totals.opusCacheReadSharePct` | session_costs | 上昇 |
| top15 セッションのコスト集中 `totals.top15SessionsCostSharePct` | session_costs | 上昇 |
| 直近 7d コスト `trend.last7dCost`（対 `prior7dCost`） | session_costs+sessions | 上昇 |
| 高コスト×compact 未使用 `hygiene.expensiveNoCompact` | join | 上昇 |
| 超長大×compact 未使用 `hygiene.longNoCompact` | sessions | 上昇 |
| 高コストセッション数 `hygiene.expensiveSessions` | session_costs | 上昇 |

`topSessions` は前回スナップショットに無い `hygieneFlag='expensive-no-compact'` の新規セッションを特に注視する。`estimated_cost_usd` は推定値（サブスク枠の相対比較用）で、絶対額でなく**占有率・デルタ・集中度**で読む。

**分析観点: 呼び出し回数削減を per-file 削減より優先する**。`message_count`（`sessions` 表）が高いのに `peak_context_tokens` が横ばいのセッションは、1 回あたりの読み込み量でなく往復回数（判断→Read→判断→Read の逐次化・並列化不足）がコスト増の主因である可能性が高い。対策候補の優先順位づけは「1 呼び出しあたりのトークン削減」より「呼び出し回数そのものの削減」を優先する（参考: Qiita「CLAUDE.mdによるClaude Code探索コスト削減」の一事例実測 — CLAUDE.md 導入で API 呼び出し 57.1% 減・入力トークン 45.8% 減、要因分解では呼び出し回数削減の寄与が単位あたり削減より大きい。単一リポジトリでの計測であり一般化の検証は未了だが、基本入力の削減効果は呼び出し回数倍でしか効かない構造は自明のため、ヒューリスティックとして採用する）。

### 3. 健全性レポート（常時出力）

`<docsRoot>/report/<YYYYMMDD>-dev-retro.ja.md` を出力する（旧名 `<YYYYMMDD>-dev-health.ja.md`。過去分は改名しない）。`anytime-markdown-output` スキルの書式（frontmatter `type: report`）に従う。

構成:

- frontmatter（`title` / `date` / `type: report` / `lang: ja` / `author` / `excerpt`）
- **サマリ**: 前回比で悪化/改善した上位シグナルを 3〜5 行。
- **デルタ表**: メトリクス / 前回 / 今回 / 変化（↑↓→・新規）。**変化があった行を上に**。
- **現在の主要シグナル**: hotspot top・drift 種別内訳・コスト内訳・SHORTCUT 技術負債（総数 / no-trigger 内訳・top ファイル）・スキル健全性（総数 / 参照切れ / 90 日超 stale / 30 日未使用・利用 top）など現状値。
- **観点昇格候補**（`quality.checklistNoneClusters`）: checklist_ref='none'（global スキル `code-review-checklist` のどの章にも該当しない指摘）のカテゴリ×パッケージ束で 2 件以上のクラスタを**毎回列挙**する（2 回再発ルールの機械化。global CLAUDE.md「メモリ運用」の横断制約昇格と同じ閾値）。各クラスタは「チェックリストへの観点追加候補」で、§4 の閾値を満たしたら提案＋チケットへ昇格する（§4.1）。条文化はチケットの What 承認後に手動で行い、条文には出典 finding_id をインライン記載する（自動編集しない）。クラスタゼロ・列未マイグレーション（null）もその旨を明記する（沈黙させない）。
- **条文効果**（`quality.checklistByRef30d`）: 前回レトロ以降に条文化・改訂した章があれば、その章の 30 日窓指摘件数の前回比を明記する（減少＝条文が効いている / 横ばい以上＝§4 メタ還流の観測 1 回目）。
- **コスト詳細**（`grounding.token-budget.cjs` 出力。集計レベルの cost glance を超える深掘り）: モデル別コスト内訳 `byModel`（model / sessions / cost / cacheRead。Opus 比率を強調）・コスト上位セッション `topSessions`（session / cost / messageCount / peakContextTokens / compactCount / gitBranch / hygieneFlag）・セッション衛生 `hygiene`（expensiveNoCompact 等）・週次トレンド `trend.weekly`。狙いは RC2（Opus メインの超長大セッションが `/clear`・`/compact` なしで継続し `cache_read` が「文脈サイズ×ターン数」で二乗膨張する）の継続監視。
- **モデル別挙動プロファイル**（`modelBehavior.byModel`・30 日窓・記述的）: モデル（フル ID）ごとの冗長性（`avgOutputTokens`）・ツール失敗率（`toolErrorRatePct`）・平均実行時間（`avgTurnExecMs`）を現状値として表示する。委譲先の役割分担（`anytime-dev-cycle` §1・§3.1 モデル表）の見直し材料。**因果主張はしない**: タスク割当が非ランダム（性質でモデルを選んでいる）ため、モデル間差は「性格」でなく割当タスクの性質を含む交絡を持つ。`assistantMsgs` が `minSampleForJudgment`（5）未満のモデルは「標本不足・判定しない」と明記する。
- **メタ機構の健全性**: 改善機構そのものが機能しているかの点検。(a) 前回レトロで昇格した提案の追跡（`proposal/` の該当ファイルと git 履歴から 採択 / 見送り / 未判断 を確認し件数を記す）、(b) 前回レトロ以降に版数バンプされたスキル・委任テンプレのうち、§2 のスキル発火変化・委任成績で効果が確認できない / 悪化した対象の一覧。機械集計できない項目は「※要確認」で残す（沈黙させない）。
- **grounding errors**（あれば）: 測定不能だったシグナル。
- 末尾に「次アクション候補」を箇条書き（提案に昇格したものは proposal へのリンク）。

出力後 `bash ~/.claude/scripts/validate-markdown.sh <file>` で検証する。

### 4. 改善提案への昇格（閾値超のみ）

下記いずれかを満たすシグナルがあれば、`anytime-proposal` スキル（**既定 lightweight**・1 提案 = 1 論点）で改善提案を生成し `proposal/<YYYYMMDD>-<topic>.ja.md` に出力し、**提案 1 件につきチケットを 1 件起票する**（§4.1）。満たさなければレポートのみで終了。

昇格閾値（いずれか）:

- spec_vs_code 以外で新しい種別の drift が出現、または spec_vs_code を除く未解決 drift が前回比 +20% 以上。
- `docCore.embeddingCoveragePct` が 90% を下回る、または前回比 10pt 以上低下。
- `quality.unaddressedFindings` が前回比 +10 以上、または `quality.reviewerEmpty` が増加して全レビューの過半。
- `hotspots` に前回スナップショットに無い cc>200 の新規関数が出現。
- `costWindow30d.opusCostSharePct`（30 日窓）が前回比 +5pt 以上、または `costWindow30d.cacheReadSharePct` が 99% 超で `costWindow30d.sessionsOver1000Msgs`（30 日窓）が増加。累積の `cost.*` では機械的に発火するため窓値で判定する。
- **コスト詳細（セッション粒度・`grounding.token-budget.cjs`）**: `totals.opusCostSharePct` が 90% 超かつ前回比 +3pt 以上（Opus 偏重の進行）、または `trend.last7dCost` が `trend.prior7dCost` の +30% 以上（コスト急増）、または `hygiene.expensiveNoCompact` が前回比 +5 以上／高コストセッションの過半が compact 未使用、または `topSessions` に前回スナップショットに無い `hygieneFlag='expensive-no-compact'` の新規セッションが出現、または `totals.top15SessionsCostSharePct` が前回比 +5pt 以上（少数セッションへの集中）。提案の方向は RC2 の恒久/暫定対策（モデル委譲徹底・セッション衛生通知・retention）に紐付ける。
- `techDebt.noTriggerMarkers` が前回比 +5 以上、または `techDebt.noTriggerSharePct` が 50% 超（昇格経路なき簡略化が支配的）。
- `skillHealth.brokenRefs` が 1 以上（参照切れの放置）、または `staleOver90` が前回比増かつ `unused30d` が総数の過半（棚卸し要否の判断材料）。
- **スキル改訂が効いていない**: 前回スナップショットと比べ `manifestVersions` の版数が上がったスキルの発火（`usageWindows.n30`）が prev30 比で半減以下、または同梱スキルが 30 日発火ゼロのまま → description / 本文の改訂候補として提案（発火記録は `messages.skill` の名前空間付き・旧名記録を含むため、末尾名で突合して誤判定を避ける）。
- **委任テンプレの成績悪化**: `delegation.byVersion` の現行版数の差し戻し率が前回比 +20pt 以上または 50% 超 → `references/delegation.md`（anytime-dev-cycle）の契約書式改訂候補として提案。記録件数が 5 件未満の版は判定しない（少数標本の偽シグナル抑制）。
- **委譲先の成績悪化（モデル別）**: `delegation.byModel` の特定モデル／実行系の差し戻し率が 50% 超（記録 5 件以上）→ そのモデルへの委譲を減らす／`anytime-dev-cycle` §1 委譲先選択・§3.1 モデル表の見直しを提案する。
- **較正表の乖離（見積り予実）**: `delegation.estimates.referenceClass` のあるカテゴリ × モデルで **n≥5 かつ誤差比中央値（`medianErrorOut` または `medianErrorWall`）が 2.0 超 or 0.5 未満** → `references/delegation.md` §2.3 較正表の当該セルの改訂（実測中央値へ置換）を提案する。n<5 の組は判定しない。改訂が 2 回連続で誤差を縮めない場合は表の値でなく機構側（カテゴリ語彙の切り方・ペアリング規則）の改訂を提案する（メタ機構の健全性点検と同原則）。誤差評価は同一実行系内で閉じる（Claude 系とCodex のコスト単位は非互換のためモデル間比較しない）。`modelBehavior` は記述的シグナルであり**それ単独では提案昇格の閾値にしない**（交絡があり因果を主張できないため、あくまで役割分担議論の材料）。
- `recurrence.danglingClusters` に前回スナップショットと同一の target が残存（2 回目の観測 = constraint メモリ昇格を提案）、または `recurrence.uncoveredBugFiles` に新規ファイルが出現（教訓化されていない再発バグ領域）。提案には対象 target / referrers / ファイルを明記し、メモリ作成自体はユーザー承認後に行う。
- **観点の穴クラスタの残存**: `quality.checklistNoneClusters` に前回スナップショットと同一（カテゴリ×パッケージ）のクラスタが残存（2 回目の観測）→ global スキル `code-review-checklist` への観点追加を提案・チケット起票する。チケットには対象クラスタと出典 finding_id（`list_unaddressed_review_findings` の `checklist_ref='none'` で列挙）を明記し、条文化はチケット承認後に手動で行う（条文末尾に出典 finding_id をインライン記載）。
- **条文が効いていない（メタ還流）**: 条文化・改訂した章の `quality.checklistByRef30d` が**条文化後 2 回連続のレトロ**で減少しない → 条文の再改訂でなく、条文の書き方（NG/OK 例の具体性）またはレビュー委任プロンプトへの観点注入方法の見直しを提案する（「改善機構の空回り」と同原則）。
- **改善機構の空回り（メタ還流）**: 「スキル改訂が効いていない」または「委任テンプレの成績悪化」が**同一対象で 2 回連続のレトロ**にわたり発火した場合、対象本文の再改訂ではなく**機構側の改訂**（還流ルール＝global CLAUDE.md「メモリ運用」・本スキルの昇格閾値・委譲契約テンプレの書式）を提案対象にする。改訂を繰り返しても効かないのは直し方でなく直す仕組みの欠陥を示唆するため、改善手続き自体を改訂対象に含める（Hyperagents arXiv:2603.19461 の知見。固定されたメタ機構が改善の頭打ちを作る）。標本 5 件未満の版は判定しない規則はここでも維持する。

> deep モード（`anytime-proposal --deep` 専門観点パネル）は**コストが高い**ため、複数の重大シグナルが同時悪化した場合か、ユーザーが明示した場合のみ使う。定期実行の既定は lightweight。

### 4.1 チケット起票（提案 1 件 = チケット 1 件）

§4 で改善提案書を生成したら、提案 1 件につき `mcp__claude_ai_mcp-cms-remote__create_ticket` を 1 回呼び出してチケットリポジトリの `.tickets/` へ起票する（GitHub API 経由で直接コミットされるためローカル git 操作は不要）。

- `title`: `改善提案: <提案テーマ>`
- `description`: 一文サマリ + 提案書パス（`proposal/<YYYYMMDD>-<topic>.ja.md`）+ 起点シグナル（メトリクス名・前回比）。実装前に提案書本体を Read するよう明記する
- `status`: `backlog`（**人が採否を判断するまで自動実行ループの対象外**に保つ。loop は `up_next` / `in_progress` のみ拾う）
- `assignee`: `user`（採否＝What の承認は人。採用時に人が `agent` へ変更して着手させる）
- `workspace`: `anytime-markdown`
- `priority`: 原則 `medium`。効率／品質／要件適合への影響が特に大きいシグナル（重大 drift・cc>200 新規関数・コスト急増）は `high`
- `creator`: `anytime-dev-retro`

レスポンスのチケット ID（`T-N`）をレポート末尾「次アクション候補」に併記する。ツールが使えない環境（ローカル mcp-cms には create_ticket が無い）・呼び出し失敗時はリトライせず「未起票（理由）」と記す。提案を生成しなかった週（閾値未超）はチケットも起票しない。

### 5. ガードレール / 申し送り

- grounding が `errors` を返したら silent に 0 を採用しない（測定不能として明示）。
- 健全性レポートは毎回出すが、**proposal は閾値超のみ**（ノイズ抑制）。
- DB の値は ingest ラグ（数十分〜Reload Window）を含む。直近の修正反映は遅延し得る旨をレポートに注記。
- 設計書ドリフト（spec_vs_code）の検知・昇格は 2026-07-14 に `anytime-dev-cycle` 段5（タスク単位の `check_alignment` / `detect_drift` ゲート）へ移管した。grounding.cjs は drift を集計し続けるが、本スキルは spec_vs_code をデルタ判定・提案昇格に使わない（レポートの現状値表示のみ）。
- 提案の採否はユーザーが行う。採択された提案の要件書・設計書への反映は本スキルでは行わず、`anytime-dev-cycle` 段2（要件書・機能仕様書の作成・改訂 → What 承認）へ引き継ぐ（本スキルの出口は提案生成まで）。

## インシデントモード（事故発生時の要件化）

「インシデント分析」「ポストモーテム」「事故分析」「再発防止策」の指示、または本番リリース後の障害発生時は、定期デルタ分析ではなく単発のインシデント要件化を行う（管制塔要件 L4.3「インシデントからの要件化」の実行手順）。

1. **事実収集（read-only）**: 事故の時系列・影響範囲を Trail の記録（`messages` / `session_commits` / git 活動記録・フォレンジックログ）と実測で裏取りする。推測で埋めず、確認できない箇所は「※要確認」と明記する。
2. **重大度・復旧方針の決定は人（管制官）**: AI は判断材料（影響範囲・復旧選択肢）の提示まで。復旧作業そのものは本モードの範囲外（該当タスクとして別途実施）。
3. **why-why-why 分析（3 段以上）と再発防止提案書の起草**: `anytime-proposal`（既定 lightweight）で `proposal/<YYYYMMDD>-<topic>.ja.md` へ出力し、§4.1 の要領でチケットを 1 件起票する（`title` は `再発防止: <テーマ>`、`priority` は事故の重大度に応じて `high` / `urgent`）。global CLAUDE.md「バグ修正時」のリリース後不具合ルールと同一プロセスであり、分析様式を二重定義しない。
4. **提案の採否は人**。採択された提案は `anytime-dev-cycle` 段2（要件書・設計書の改訂 → What 承認）へ引き継ぎ、必要ならロードマップ（`spec/00.requirements/trail-roadmap.ja.md`）の更新も同時に提案する。

## セットアップ監査は別スキル

PC 環境・Claude Code 設定（CLAUDE.md / rules / skills / hooks / settings / MCP）の read-only 診断は `anytime-dev-audit` へ分離した（2026-07-14）。本スキルは**開発活動**のふりかえり（実績データ・事故）を担い、**環境・設定**の診断は担わない。

## スケジューラ連携（本スキルの範囲外）

本スキルはスケジューラ非依存の可搬コア。週次自動実行の配線（Desktop Scheduled Task 等）は `plan/20260622-periodic-dev-health-analysis.ja.md` の「スケジューリング」を参照。手動でも `/anytime-dev-retro` で実行できる。
