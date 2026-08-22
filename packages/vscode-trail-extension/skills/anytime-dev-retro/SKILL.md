---
name: anytime-dev-retro
effort: medium
description: 開発の実績データと事故から改善を還流させるふりかえり（retrospective）。Trail の 3DB(trail-caravan-book/markdown-catalog/trail)を横断分析し、セッション粒度の LLM コスト分析（旧 anytime-token-budget を統合）も含めて、前回からのデルタに基づく開発健全性レポートと(閾値超なら)改善提案書＋チケットを生成する。「/anytime-dev-retro」「ふりかえり」「レトロ」「定期分析」「開発健全性」「dev health」「健全性レポート」「token budget」「トークン予算」「LLM コスト」「Opus コスト」「セッションコスト分析」の指示、または週次スケジュールからの起動で使用する。「インシデント分析」「ポストモーテム」「事故分析」「再発防止策をまとめて」の指示、または本番リリース後の障害発生時はインシデントモード（事故の要件化）を使用する。「暗黙知を明文化」「経典を生成」「doctrine を抽出」「設計哲学を抽出」「ユビキタス言語をまとめて」「暗黙ルールを見える化」「/anytime-reverse-doctrine」（旧スキル名）の指示では doctrine 抽出モード（旧 anytime-reverse-doctrine を統合。`--delta` で差分更新と乖離報告、`--category` でカテゴリ限定。手順は references/reverse-doctrine.ja.md）を使用する。PC 環境・Claude Code 設定の診断（「セットアップ監査」「環境監査」「環境診断」）は anytime-dev-audit、システム構造の設計書生成は anytime-reverse-spec を使う。
---

# anytime-dev-retro — 開発のふりかえり（定期分析＋インシデント要件化＋doctrine 抽出）

更新日: 2026-08-22（旧 `anytime-reverse-doctrine` を doctrine 抽出モードとして統合。どちらも実績・履歴から改善・規範を還流させるふりかえり系のため）

Trail が蓄積する 3 つのローカル DB を横断分析し、**前回からの変化（デルタ）に基づく**健全性レポートを出力する。変化が閾値を超えたシグナルだけ改善提案に昇格させ、提案書に加えてチケットを起票する（毎回同じ指摘を繰り返さないのが本スキルの肝）。

コスト面は**セッション粒度の LLM コスト分析**（Opus 占有率・cache_read 二乗膨張・「高コスト×compact 未使用」のセッション衛生・週次トレンド。旧 `anytime-token-budget` を 2026-07-18 に統合）を含む。実装は専用 grounding（`grounding.token-budget.cjs`）で、3DB 横断の grounding（`grounding.cjs`）と 2 本立てで実行する。リアルタイムのトークン予算監視（Stop フック `token-budget.sh` → viewer タブバー）は本スキルとは別機構で、統合対象外。

- 分析対象 DB（read-only）: `<workspace>/.anytime/trail/db/{activity.db, caravan-book.db, catalog.db}`。Flight Record（`caravan_flight_reviews` / `instructions` / `caravan_instruction_sessions`）は 2026-08-07 に activity.db から caravan-book.db へ移設した。grounding はテーブル実在で読み先を選ぶ（未移行 DB では activity.db 側フォールバック。`flightRecord.source` に読み先を出力する）。コスト詳細は `activity.db` の `activity_session_costs`（session×model 別・`estimated_cost_usd`）/ `sessions`（`message_count` / `peak_context_tokens` / `compact_count` / `sub_agent_count` / `git_branch`）を `grounding.token-budget.cjs` で集計する。
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

- **(3) 観測経路の突合スモーク**（MCP が使えるセッションのみ。headless ならスキップし、その旨をレポートへ明記する）: mcp-trail `get_doctrine_agreement`（範囲指定なし）を呼び、(a) 返り値の `sourceErrors` が空であること、(b) `total` が DB 直読カウント（`node:sqlite` readOnly で `SELECT COUNT(*) FROM caravan_doctrine_judgments`）と一致することを確認する。`sourceErrors` 非空・件数乖離は**観測経路の故障**としてレポート冒頭に明記し、doctrine 系指標は測定不能として扱う（誤った 0 を真値にしない）。背景: 2026-08-15 に caravan-book.db の malformed で MCP が全指標 0 を返し、DB 実体の 74 件と乖離していた実測（proposal `20260815-adlc-evals-adoption`）。

- `<YYYYMMDD>` は snapshot の `generatedAt` を JST に変換した日付。保存先 `_signals/`・`_signals/token-budget/` は初回未作成のため上記 `mkdir -p` で必ず先に用意する。
- コスト grounding が cwd 相対で DB を見つけられない場合は引数で明示: `node .claude/skills/anytime-dev-retro/grounding.token-budget.cjs <workspace>/.anytime/trail/db`。
- 両出力の `errors` 配列を**必ず確認**する。空でなければ（スキーマ変化等でクエリが失敗している）、その旨をレポート冒頭に明記し、該当シグナルは「測定不能」として扱う（誤った 0 を真値にしない）。

### 2. デルタ検出（最重要）

`report/_signals/` から**今回より前の最新スナップショット**を 1 つ選び、主要メトリクスを今回と比較する。比較対象メトリクス:

| メトリクス | 源 | 悪化方向 |
| --- | --- | --- |
| Opus コスト占有率 `costWindow30d.opusCostSharePct` | trail | 上昇 |
| Opus 絶対コスト `costWindow30d.opusCostUsd` | trail | 上昇（占有率が比であることの裏取り。分母縮小と真の増加を分ける） |
| cache_read 占有率 `costWindow30d.cacheReadSharePct` | trail | 上昇 |
| 1000msg 超セッション数 `costWindow30d.sessionsOver1000Msgs` | trail | 上昇 |
| 未対処 finding `quality.unaddressedFindings` | memory | 上昇 |
| 重大度別の対処率 `quality.bySeverity`（severity ごとの total / addressed / addressedPct） | memory | error・warn の `addressedPct` 低下（`info` は対処任意のため判定に使わない） |
| reviewer 空 `quality.reviewerEmpty` | memory | 上昇 |
| bug:review 比 `quality.bugToReviewRatio` | memory | 上昇 |
| 観点の穴 `quality.checklistNone` / クラスタ `quality.checklistNoneClusters`（checklist_ref='none' のカテゴリ×パッケージ束・2 件以上） | memory | 新規クラスタ出現 / 増加（null は列未マイグレーション＝測定不能） |
| 条文効果 `quality.checklistByRef30d`（章別・30 日窓の観点キー付き指摘件数） | memory | 条文化・改訂した章の件数が減らない（2 回連続はメタ還流対象） |
| 未解決 drift（`drift.byType` から spec_vs_code を除いて算出。設計書ドリフトは dev-cycle 段5 へ移管） | memory | 上昇 / 新種別出現 |
| embedding 充足率 `docCore.embeddingCoveragePct` | markdown-catalog | 低下（**`docCore.semanticWired` が false の間は判定しない**。§4 参照） |
| 意味検索の配線状態 `docCore.semanticWired` | source | true → false（配線が外れた＝本当の劣化）。`null` は走査未完了＝**測定不能**で、false（未配線と確定）と区別する |
| 孤立 doc `docCore.orphanDocsScoped`（`orphanScopedTypes` = spec / plan に限定） | markdown-catalog | 上昇（`orphanDocs` 全体は索引範囲の拡大で動くため参照値に留める） |
| cc>15 関数数 `hotspotOver15` と `hotspots` top | trail | 上昇 / 新規高 cc 関数 |
| SHORTCUT 技術負債 `techDebt.shortcutMarkers` / `techDebt.noTriggerMarkers` | source | 上昇 / no-trigger 増 |
| スキル健全性 `skillHealth.brokenRefs` / `staleOver90` / `unused30d` | source+trail | 上昇 |
| スキル発火変化 `skillHealth.usageWindows`（2 窓比較）× `skillHealth.manifestVersions` | source+trail | 版数バンプ（改訂）後に n30 が prev30 比で半減・ゼロ化 |
| 委譲率（量） `delegation.delegationRatePct`（委譲 ÷（委譲＋見送り）・`declinedByExclusion` に除外 ID 別内訳） | docs(plan) | 低下（安いモデルへ流す仕事の総量が減っている。記録 0 件は `null`＝測定不能） |
| 委任成績 `delegation.byVersion`（雛形版数別の 採用/差し戻し/abstain） | docs(plan) | 差し戻し率の上昇 |
| 委任成績(モデル別) `delegation.byModel`（実行系/モデル別の 採用/差し戻し/abstain） | docs(plan) | 特定モデルの差し戻し率の上昇 |
| 見積り予実 `delegation.estimates.referenceClass`（カテゴリ×モデル別の 実測中央値・誤差比中央値） | docs(plan) | n≥5 の組で誤差比中央値が 2.0 超 or 0.5 未満（系統的な過小/過大見積り） |
| 再発シグナル `recurrence.danglingClusters` / `recurrence.uncoveredBugFiles` | memory dir + memory | 新規クラスタ出現 / 増加 |
| 未達成率 `flightRecord.reviews30d.unachievedSharePct`（自己/手動評価済みに占める partial+unachieved・30 日窓） | memory(flight record) | 上昇 |
| 手戻り平均 `flightRecord.reviews30d.avgReworkCount`（30 日窓） | memory(flight record) | 上昇 |
| ツール失敗率 `flightRecord.reviews30d.toolFailureRatePct`（30 日窓） | memory(flight record) | 上昇 |
| 自己評価カバレッジ `flightRecord.reviews30d.selfAssessedPct`（30 日窓） | memory(flight record) | 低下（machine unknown のまま振り返れない行が増える） |
| 滞留指示 `flightRecord.instructions.openOver7d`（7 日超オープン） | memory(flight record) | 上昇 |
| 具体化の取りこぼし `doctrineGap.missedByPromptShape`（指示の型別。申告が空なのに人が modified した判断） | memory(doctrine) | 同一 shape の再出現 / 増加 |
| 指示不足の申告率 `doctrineGap.instructionGapRatePct` | memory(doctrine) | **0 へ張り付く**（申告の形骸化。上昇は正常） |
| 申告の読み取り不能 `doctrineGap.unreadableDeclarations` | memory(doctrine) | 1 件以上（他 2 指標の解釈を保留する） |
| ゲート理由分布 `doctrineGap.escalateReasons` / `gateVerdicts`（全期間・エスカレーション理由コード別件数） | memory(doctrine) | `doctrine_silent` + `no_canon_citation` の比率増加（canon 補完の遅れ）/ `underspecified_instruction` の滞留（解消経路 `resolve_underspecified_points` が使われていない） |

- **具体化観点（DCT-14）の読み方**: `doctrineGap` は**レビューでは拾えない失敗**を測る。主材料は `missedCount`（申告が空＝「この指示だけで結論は一意に定まる」と言い切ったのに、人が `modified` で覆した判断）で、`declaredCount`（申告できた側）は既に運用が働いた記録なので学ぶべきは取りこぼした側にある。`missedByPromptShape` の型は grounding が決定論で付ける**近似**（`terse`=15 文字以下の継続指示 / `question`=疑問符で終わる指示 / `other` / `undeclared`=指示台帳へ未紐付け）で、E-1〜E-3 への当てはめは `missedSamples` の `originPrompt` を読んで判断する。**`available: false`（列未マイグレーション）は 0 件ではなく測定不能**として扱う。正本は `<docsRoot>/proposal/20260807-elaboration-checklist.ja.md`。
  - **ゲート理由分布（DCT-19）の読み方**: `escalateReasons` のうち `always_human_operation` / `restricted_area` / `severity_high` は設計どおりの人間ゲートで是正対象ではない。是正が効くのは `doctrine_silent` / `no_canon_citation`（→ 該当判断の subject を集計し canon 補完の入力にする）と `underspecified_instruction`（→ 解消経路の運用を確認する）。前回スナップショットとの比率デルタで読む（採択根拠は `<docsRoot>/proposal/20260815-ai-review-approval-intake.ja.md`）。`gateVerdicts` / `escalateReasons` が `null` の場合は列未導入で測定不能。
  - **修正方針の二択は取りこぼしに数えない**。方針の選択は自動選択規約の対象で、`underspecified_points` に書かないことが正しい（2026-08-07 判断）。`missedSamples` に方針選択が覆されただけの判断が混ざっていたら、観点昇格の候補から外す。

- **再発の「2 回」判定**: `recurrence.danglingClusters` は件数ではなく、同一 target の滞留サイクル数（初出 / 2 回目 / 3 回目以降）で扱う。同一 target が**前回スナップショットにも存在**していたら「2 回目」とみなし、R023（constraint メモリ昇格）の発火候補として §4 の提案へ昇格する。grounding はステートレスに現在値のみ出力するため、前回スナップショットとの突合で滞留サイクル数を数えるのは本デルタ比較の責務である。`skillHealth.brokenRefs` 対象の同一スキルが前回にも存在した場合は、R024（スキル本文反映）の発火候補として扱う。

- 各メトリクスを **新規発生 / 悪化 / 改善 / 横ばい** に分類する。
- 前回スナップショットが無い（初回）場合は全メトリクスを「初期値」として記録し、デルタ比較はスキップする。
- **累積指標を増加判定に使わない**: コスト・セッション系は `cost.*`（全期間累積）ではなく `costWindow30d.*`（直近 30 日窓）でデルタを見る。`cost.opusCostSharePct` / `cost.cacheReadSharePct` / `activity.sessionsOver1000Msgs` は全期間累積で**単調増加しかせず**、「増加＝悪化」判定が活動のある限り構造的に発火する（偽陽性）。`cost.*` は現状値の参照用に残す。新メトリクスを追加する際は「累積か期間か・悪化判定と整合するか」を必ず確認する。

- **比の指標は絶対値と対で読む**: 占有率は分子が動かなくても分母の他方が縮めば上がる。2026-08-19 実測では `costWindow30d.opusCostSharePct` が 53.7% → 62.4%（+8.7pt）だった一方、`costWindow30d.opusCostUsd` は 11,766 → 11,431 USD と**減っていた**（非 Opus が -32% 縮んだ結果）。占有率だけで昇格させると、既に縮んでいる委譲側をさらに削る誤った是正へ進む。累積か期間かと同じく、比か絶対値かを必ず確認する。

**コスト詳細メトリクス**（`grounding.token-budget.cjs` 出力。`report/_signals/token-budget/` の前回スナップショットと比較）: 集計レベルの `costWindow30d.*`（上表）と別に、セッション粒度で以下を比較する。

| メトリクス | 源 | 悪化方向 |
| --- | --- | --- |
| Opus コスト占有率 `totals.opusCostSharePct` | activity_session_costs | 上昇 |
| Opus cache_read 占有率 `totals.opusCacheReadSharePct` | activity_session_costs | 上昇 |
| top15 セッションのコスト集中 `totals.top15SessionsCostSharePct` | activity_session_costs | 上昇 |
| 直近 7d コスト `trend.last7dCost`（対 `prior7dCost`） | activity_session_costs+sessions | 上昇 |
| 高コスト×compact 未使用 `hygiene.expensiveNoCompact` | join | 上昇 |
| 衛生行動の減衰 `hygiene.windows`（高コストセッションの `avgSubAgents` / `avgCompacts` を 3 期間 last7d / prior7to30d / prior30to60d で比較） | join | 直近窓が古い窓より低下（`avgMessages` が横ばいのまま低下しているときだけ「畳む行動が消えた」と読む） |
| 超長大×compact 未使用 `hygiene.longNoCompact` | sessions | 上昇 |
| 高コストセッション数 `hygiene.expensiveSessions` | activity_session_costs | 上昇 |
| 料金表未登録モデル `unknownPricingModels`（既定単価で推計中） | activity_session_costs | 1 件以上（trail-activity `pricing.ts` の現行化トリガ。レポートで必ず言及する） |

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
- **再発シグナル**（`recurrence.danglingClusters` / `recurrence.uncoveredBugFiles`）: dangling target は全件を滞留サイクル数（初出 / 2 回目 / 3 回目以降）付きで列挙する。参照元が 3 件以上の target は `priority: high` 相当として扱う。
- **メタ機構の健全性**: 改善機構そのものが機能しているかの点検。(a) 前回レトロで昇格した提案の追跡（`proposal/` の該当ファイルと git 履歴から 採択 / 見送り / 未判断 のいずれかへ必ず遷移させ、件数だけでなく状態を確定させる）。前回レトロが昇格した提案は次回レトロまでにこの 3 状態のいずれかへ置く。`ticketStatus: "unfiled"` の提案は滞留日数付きで全件再掲し、件数で丸めない。未判断が 2 回連続した提案は見送りに落として追跡対象から外し、その理由 1 行を当該提案書に残す。(b) **起票済みチケットの滞留点検**（下記）。(c) 前回レトロ以降に版数バンプされたスキル・委任テンプレのうち、§2 のスキル発火変化・委任成績で効果が確認できない / 悪化した対象の一覧。機械集計できない項目は「※要確認」で残す（沈黙させない）。

    **起票済みチケットの滞留点検**: 提案が起票されるようになっても、チケットが `backlog` から動かなければシグナルは悪化し続ける（2026-08-19 実測: T-10 が 18 日・T-18 / T-19 が 14 日滞留する間に `review_unfixed` drift が 81 → 203 件へ増えた一方、完了した T-17 は平均 compact を 4.7 → 7.9 へ反転させた）。次を毎回行う。

    - チケットリポジトリ（VS Code 設定 `anytimeAgent.tickets.directory`。既定 `/Shared/anytime-ticket`）の `.tickets/*.md` から、`status: backlog` かつ `creator: anytime-dev-retro` のチケットを**滞留日数付きで全件再掲**する。件数で丸めない。
    - 同一チケットが 2 回のレトロを跨いで `backlog` のままなら、「次アクション候補」の**先頭**（新規提案より上）に置く。
    - 滞留チケットの対象シグナルが同期間に**悪化していれば**その事実を併記する。悪化していない滞留は優先度を下げてよい（全件を警告で埋めるとレポートが読まれなくなる）。
    - 同一シグナルに対する新規提案は作らない（重複提案は滞留を増やすだけ）。

    チケットリポジトリはワークスペース外にあり `lep.json` にパス定義が無いため、集計は grounding では行わずレポート作成時の手順として実施する。
- **Flight Record**（`flightRecord`・30 日窓）: outcome 分布（achieved/partial/unachieved/unknown）・自己評価カバレッジ・手戻り平均・ツール失敗率・滞留指示（openOver7d）と、指示単位コスト上位 `topInstructionsByCost30d`（caravan_instruction_sessions × trail.activity_session_costs の突合。セッション粒度のコスト分析を「1 指示にいくら掛かったか」の作業単位へ引き上げる）。`lessonCandidateReviews`（教訓候補を持つ振り返り）は再発シグナルの突合候補として件数を明記する。`source` が `trail(pre-migration)` の場合は移行未完了と明記する。
- **具体化観点の候補**（`doctrineGap`）: `missedCount` が 1 件以上なら `missedSamples` を**毎回列挙**する（subject / promptShape / originPrompt）。各件は「着手前に聞けたはずの論点」で、§4 の閾値を満たしたら具体化観点への昇格提案＋チケットへ回す。`available: false`（DCT-14 未マイグレーション）・`missedCount` が 0 のときもその旨を明記する（沈黙させない）。`unreadableDeclarations` が 1 件以上なら申告率の解釈を保留する旨を添える。
- **評価ケース層**（§4.2）: `grep -rhoE "EVAL-[0-9]+" packages/*/__tests__ | sort -u | wc -l` の件数と前回比、`test.failing`（昇格待ち）の件数。2 回連続で増分 0 なら §4.2 の抽出運用見直しを提案候補にする。
- **grounding errors**（あれば）: 測定不能だったシグナル。手順 1 (3) の突合スモークで検出した観測経路の故障もここへ含める。
- 末尾に「次アクション候補」を箇条書き（提案に昇格したものは proposal へのリンク）。

出力後、`anytime-markdown-output` スキル §10（出力後の検証）で検証する。レポートの出力先 `<docsRoot>/report/` は mcp-markdown のルート（`/anytime-markdown`）外のため `format_markdown` は使えない（`Access denied: path outside root directory`）。frontmatter 必須キーの実在確認と同スキル §10.2〜10.3 の意味判断チェックリストを手動で適用する。**`~/.claude/scripts/validate-markdown.sh` は実在しない**（2026-08-14 実測。実行すると `No such file or directory` で落ちる）。

### 4. 改善提案への昇格（閾値超のみ）

下記いずれかを満たすシグナルがあれば、`anytime-analysis` スキル（**既定 lightweight**・1 提案 = 1 論点）で改善提案を生成し `proposal/<YYYYMMDD>-<topic>.ja.md` に出力し、**提案 1 件につきチケットを 1 件起票する**（§4.1）。満たさなければレポートのみで終了。

昇格閾値（いずれか）:

- spec_vs_code 以外で新しい種別の drift が出現、または spec_vs_code を除く未解決 drift が前回比 +20% 以上。
- `docCore.embeddingCoveragePct` が 90% を下回る、または前回比 10pt 以上低下。**ただし `docCore.semanticWired` が false の間は昇格させない**（消費側が本番経路へ配線されていない機能の在庫状態であり、可用性ではないため）。未配線である事実はレポートへ毎回残す（沈黙させない）。`semanticWired` が true → false へ転じた場合は、配線が外れた＝本当の劣化として昇格させる。**`semanticWired` が `null`（走査上限到達・ディレクトリ読み取り失敗）のときは測定不能**として扱い、充足率も配線状態もデルタ判定に使わない(`errors` に `semanticWired scan incomplete` が積まれる)。
- `quality.unaddressedFindings` が前回比 +10 以上、または `quality.reviewerEmpty` が増加して全レビューの過半。
- `hotspots` に前回スナップショットに無い cc>200 の新規関数が出現。
- `costWindow30d.opusCostSharePct`（30 日窓）が前回比 +5pt 以上、**かつ `costWindow30d.opusCostUsd` が前回比で増加**（AND 条件）。占有率だけが上がり絶対コストが横ばい・減少なら、分母縮小による見かけの上昇としてレポートに明記し、提案へ昇格させない。または `costWindow30d.cacheReadSharePct` が 99% 超で `costWindow30d.sessionsOver1000Msgs`（30 日窓）が増加。累積の `cost.*` では機械的に発火するため窓値で判定する。
- **コスト詳細（セッション粒度・`grounding.token-budget.cjs`）**: `totals.opusCostSharePct` が 90% 超かつ前回比 +3pt 以上（Opus 偏重の進行）、または `trend.last7dCost` が `trend.prior7dCost` の +30% 以上（コスト急増）、または `hygiene.expensiveNoCompact` が前回比 +5 以上／高コストセッションの過半が compact 未使用、または `topSessions` に前回スナップショットに無い `hygieneFlag='expensive-no-compact'` の新規セッションが出現、または `totals.top15SessionsCostSharePct` が前回比 +5pt 以上（少数セッションへの集中）。提案の方向は RC2 の恒久/暫定対策（モデル委譲徹底・セッション衛生通知・retention）に紐付ける。
- **衛生行動の減衰**: `hygiene.windows` で `avgSubAgents` または `avgCompacts` が `prior30to60d` → `prior7to30d` → `last7d` と単調に低下し、かつ `avgMessages` が横ばい（最大窓比 ±20% 以内）。セッションが小さくなった結果ではなく畳む行動が消えたことを意味する。件数が 20 未満の窓を含む場合は判定しない（少数標本）。
- `techDebt.noTriggerMarkers` が前回比 +5 以上、または `techDebt.noTriggerSharePct` が 50% 超（昇格経路なき簡略化が支配的）。
- `skillHealth.brokenRefs` が 1 以上（参照切れの放置）、または `staleOver90` が前回比増かつ `unused30d` が総数の過半（棚卸し要否の判断材料）。
- **スキル改訂が効いていない**: 前回スナップショットと比べ `manifestVersions` の版数が上がったスキルの発火（`usageWindows.n30`）が prev30 比で半減以下、または同梱スキルが 30 日発火ゼロのまま → description / 本文の改訂候補として提案（発火記録は `messages.skill` の名前空間付き・旧名記録を含むため、末尾名で突合して誤判定を避ける）。
- **委任テンプレの成績悪化**: `delegation.byVersion` の現行版数の差し戻し率が前回比 +20pt 以上または 50% 超 → `references/delegation.md`（anytime-dev-cycle）の契約書式改訂候補として提案。記録件数が 5 件未満の版は判定しない（少数標本の偽シグナル抑制）。
- **委譲先の成績悪化（モデル別）**: `delegation.byModel` の特定モデル／実行系の差し戻し率が 50% 超（記録 5 件以上）→ そのモデルへの委譲を減らす／`anytime-dev-cycle` §1 委譲先選択・§3.1 モデル表の見直しを提案する。
- **較正表の乖離（見積り予実）**: `delegation.estimates.referenceClass` のあるカテゴリ × モデルで **n≥5 かつ誤差比中央値（`medianErrorOut` または `medianErrorWall`）が 2.0 超 or 0.5 未満** → `references/delegation.md` §2.3 較正表の当該セルの改訂（実測中央値へ置換）を提案する。n<5 の組は判定しない。改訂が 2 回連続で誤差を縮めない場合は表の値でなく機構側（カテゴリ語彙の切り方・ペアリング規則）の改訂を提案する（メタ機構の健全性点検と同原則）。誤差評価は同一実行系内で閉じる（Claude 系とCodex のコスト単位は非互換のためモデル間比較しない）。`modelBehavior` は記述的シグナルであり**それ単独では提案昇格の閾値にしない**（交絡があり因果を主張できないため、あくまで役割分担議論の材料）。
- **Flight Record の悪化**: `flightRecord.reviews30d.unachievedSharePct` が前回比 +10pt 以上（自己/手動評価済み n≥10 のときのみ判定）、または `flightRecord.instructions.openOver7d` が前回比 +5 以上（指示の塩漬け）、または `flightRecord.reviews30d.selfAssessedPct` が 2 回連続のレトロで低下（振り返り運用の減衰 = anytime-session-exit の発火低下とあわせて見る）。
- `recurrence.danglingClusters` に前回スナップショットと同一の target が残存（2 回目の観測 = constraint メモリ昇格を提案）、または `recurrence.uncoveredBugFiles` に新規ファイルが出現（教訓化されていない再発バグ領域）。3 回目以降の dangling target は新しい個別メモリを「作成しない」判断を確定させ、参照元リンクの書き換え、または既存の索引メモリへ寄せる作業をタスク化する。提案には対象 target / referrers / ファイルを明記し、メモリ作成・書き換え自体はユーザー承認後に行う。
  - 完了済みの作業単位を指す target は、個別メモリを作らず既存の索引メモリへ寄せてよい。ただしメモリ領域は保護領域であり、作成・書き換えは必ずユーザー承認後に行う。
  - **作成前に `<docsRoot>/plan/` を検索する**。target が指す作業単位の本体がプランファイルとして既に存在することが多く、その場合は教訓を書き起こさず `type: reference` のポインタメモリ（本体パス＋要点 1〜2 行＋参照元リンク）で解消する（2026-08-01 実測: 参照元 3 件以上の dangling 2 件はいずれもプランファイルを本体に持っていた）。
- **具体化の取りこぼしの再発**: `doctrineGap.missedByPromptShape` に**前回スナップショットにも存在した shape** が残存（2 回目の観測）→ global スキル `elaboration-checklist`（具体化観点）への観点追加を提案・チケット起票する。観点には「気づくトリガ（指示側の兆候）」を必ず持たせ、**トリガを書けない項目は昇格させない**（当てはめようのない一般論を増やさない）。出典として `missedSamples` の subject と originPrompt を提案書へ引く。観点はレビュー観点（`code-review-checklist`）とは別立てで、混ぜない — 対象（成果物 / 指示）も時点（実装後 / 着手前）も是正の宛先も異なるため。**上限 15 項目**を超えたら統合か削除を先に提案する。
  - 昇格の判定前に、当該 `missedSample` が「修正方針の二択が覆されただけ」でないかを確認する。方針の選択は自動選択規約の対象で観点化しない（2026-08-07 判断）。
  - **3 か月連続で昇格候補が 0 件なら、具体化観点の機構自体を畳む提案を出す**（提案書の撤退条件）。母数が育たないなら機構を維持するコストに見合わない。
- **観点の穴クラスタの残存**: `quality.checklistNoneClusters` に前回スナップショットと同一（カテゴリ×パッケージ）のクラスタが残存（2 回目の観測）→ global スキル `code-review-checklist` への観点追加を提案・チケット起票する。チケットには対象クラスタと出典 finding_id（`list_unaddressed_review_findings` の `checklist_ref='none'` で列挙）を明記し、条文化はチケット承認後に手動で行う（条文末尾に出典 finding_id をインライン記載）。
- **条文が効いていない（メタ還流）**: 条文化・改訂した章の `quality.checklistByRef30d` が**条文化後 2 回連続のレトロ**で減少しない → 条文の再改訂でなく、条文の書き方（NG/OK 例の具体性）またはレビュー委任プロンプトへの観点注入方法の見直しを提案する（「改善機構の空回り」と同原則）。
- **改善機構の空回り（メタ還流）**: 「スキル改訂が効いていない」または「委任テンプレの成績悪化」が**同一対象で 2 回連続のレトロ**にわたり発火した場合、対象本文の再改訂ではなく**機構側の改訂**（還流ルール＝global CLAUDE.md「メモリ運用」・本スキルの昇格閾値・委譲契約テンプレの書式）を提案対象にする。改訂を繰り返しても効かないのは直し方でなく直す仕組みの欠陥を示唆するため、改善手続き自体を改訂対象に含める（Hyperagents arXiv:2603.19461 の知見。固定されたメタ機構が改善の頭打ちを作る）。標本 5 件未満の版は判定しない規則はここでも維持する。

> deep モード（`anytime-analysis --deep` 専門観点パネル）は**コストが高い**ため、複数の重大シグナルが同時悪化した場合か、ユーザーが明示した場合のみ使う。定期実行の既定は lightweight。

### 4.1 チケット起票（提案 1 件 = チケット 1 件）

§4 で改善提案書を生成したら、提案 1 件につき `mcp__claude_ai_mcp-cms-remote__create_ticket` を 1 回呼び出してチケットリポジトリの `.tickets/` へ起票する（GitHub API 経由で直接コミットされるためローカル git 操作は不要）。

- `title`: `改善提案: <提案テーマ>`
- `description`: 一文サマリ + 提案書パス（`proposal/<YYYYMMDD>-<topic>.ja.md`）+ 起点シグナル（メトリクス名・前回比）。実装前に提案書本体を Read するよう明記する
- `status`: `backlog`（**人が採否を判断するまで自動実行ループの対象外**に保つ。loop は `up_next` / `in_progress` のみ拾う）
- `assignee`: 提案書 frontmatter の `assignee` と同じ値（`user` または `agent`）
- `workspace`: `anytime-markdown`
- `priority`: 原則 `medium`。効率／品質／要件適合への影響が特に大きいシグナル（重大 drift・cc>200 新規関数・コスト急増）は `high`
- `creator`: `anytime-dev-retro`

提案 1 件ごとに消化担当を明記する。提案書 frontmatter の `assignee`（`user` または `agent`）とチケットの `assignee` には同じ値を書く。既定は `user`（採否＝What の承認は人。採用時に人が `agent` へ変更して着手させる）とし、すでに採択済みで次の実装を直接ループへ渡す提案だけ `agent` を選べる。

起票の成否は提案書 frontmatter に必ず記録する。

- 成功時: `ticketStatus: "filed"` と `ticketId: "T-N"`（例: `T-12`）を書く。
- 不成立時: `ticketStatus: "unfiled"` と `ticketBlockedReason: "<1 行の理由>"` を書く。

`mcp__claude_ai_mcp-cms-remote__create_ticket` が使えない環境では、フォールバックとして VS Code 設定 `anytimeAgent.tickets.directory`（ワークスペースの `.vscode/settings.json`。既定値は `/Shared/anytime-ticket`）が指すチケットリポジトリを解決し、その `.tickets/` 配下へ `anytime-loop-start` スキルと同じ YAML frontmatter + Markdown 本文のチケットを直接作成する。設定値がリポジトリルートを指す場合は直下の `.tickets/` を使い、`.tickets/` 自体を指す場合はそのディレクトリを使う。ファイル名は `T-<連番>-<英数スラッグ>.md` とし、既存 `T-*.md` の最大連番の次を使う。frontmatter には上記 `title` / `status` / `priority` / `assignee` / `workspace` / `creator` と `id` / `created_at` / `updated_at` を書き、本文には概要、起点シグナル、提案書パス、実装前に提案書本体を Read する指示を含める。

レスポンスまたはフォールバック作成で得たチケット ID（`T-N`）をレポート末尾「次アクション候補」に併記する。API 呼び出しに失敗した場合はリトライせずフォールバックを試す。チケットリポジトリを解決できない、または `.tickets/` へ作成できない場合にのみ「未起票（理由）」と記し、提案書 frontmatter を `ticketStatus: "unfiled"` にする。提案を生成しなかった週（閾値未超）はチケットも起票しない。

### 4.2 失敗の 2 分類ルーティングと評価ケース層（EDD 翻案）

出典は proposal `20260815-adlc-evals-adoption`（tikalk/adlc-team-skills の evals-specify / evals-analyze の発想の移植。リポジトリ・外部フレームワークは導入しない）。

**失敗の 2 分類ルーティング**: §3〜§4 で品質シグナル（未対処 finding・取込失敗・doctrine 取りこぼし・再発バグ）を提案へ昇格させるとき、失敗を次の 2 分類へ仕分けて宛先を分ける。分類できない場合は「未分類」と明記する（沈黙させない）。

- **仕様の欠落型**（規約・書式・スキル本文が不足・曖昧・誤り）→ 宛先は**ルール側**: 該当スキル・rules・doctrine の改訂提案。既存の観点昇格（§4 の checklistNoneClusters / doctrineGap）・条文化の経路に乗せる。
- **汎化の失敗型**（規約は正しいがパーサ・機構が満たせない）→ 宛先は**実装側**: チケット起票（§4.1）。現行実装で満たせない望ましい挙動は、起票前に `test.failing` の評価ケースとして固定する（バックログの機械可読な残し方。実装が追いつくと「予期せず成功」で落ち、通常 test へ昇格させる）。

分類根拠の初回実測（2026-08-15・レビュー取込の対象パス欠落 738 件）: 仕様欠落型 423 件（本文にパスらしき文字列なし＝レビュー書式側）/ 汎化失敗型 315 件（パスはあるが取込めず＝パーサ側）。

**評価ケース層の抽出手順**（実トレース → fixture）:

1. 対象は LLM 依存の取込・判定機構（レビュー取込パーサ・doctrine カバレッジゲート・再発検出）。
2. `caravan_review_findings` / `caravan_doctrine_judgments` 等の実レコードから失敗・成功の代表例を read-only でサンプルする。
3. **観測可能な二値の Pass/Fail 条件**を定義する。期待値は憶測で書かず、確定できるものは実測（現行実装への入力）で固定する。
4. サニタイズ（機密・無関係コードの除去・構造を保存する最小化）して jest fixture 化し、由来の finding id をコメントへ残す。既存例: `packages/trail-caravan-book/__tests__/ingest/review/realTraceEvalCases.test.ts`。
5. 望ましいが未達のケースは `test.failing` で記録する（手順は上記ルーティングの汎化失敗型）。

### 5. ガードレール / 申し送り

- grounding が `errors` を返したら silent に 0 を採用しない（測定不能として明示）。
- 健全性レポートは毎回出すが、**proposal は閾値超のみ**（ノイズ抑制）。
- DB の値は ingest ラグ（数十分〜Reload Window）を含む。直近の修正反映は遅延し得る旨をレポートに注記。
- 設計書ドリフト（spec_vs_code）の検知・昇格は 2026-07-14 に `anytime-dev-cycle` 段5（タスク単位の `check_alignment` / `detect_drift` ゲート）へ移管した。grounding.cjs は drift を集計し続けるが、本スキルは spec_vs_code をデルタ判定・提案昇格に使わない（レポートの現状値表示のみ）。
- 提案の採否はユーザーが行う。採択された提案の要件書・設計書への反映は本スキルでは行わず、`anytime-dev-cycle` 段2（要件書・機能仕様書の作成・改訂 → What 承認）へ引き継ぐ（本スキルの出口は提案生成まで）。

## インシデントモード（事故発生時の要件化）

「インシデント分析」「ポストモーテム」「事故分析」「再発防止策」の指示、または本番リリース後の障害発生時は、定期デルタ分析ではなく単発のインシデント要件化を行う（管制塔要件 L4.3「インシデントからの要件化」の実行手順）。

1. **事実収集（read-only）**: 事故の時系列・影響範囲を Trail の記録（`messages` / `activity_session_commits` / git 活動記録・フォレンジックログ）と実測で裏取りする。推測で埋めず、確認できない箇所は「※要確認」と明記する。
2. **重大度・復旧方針の決定は人（管制官）**: AI は判断材料（影響範囲・復旧選択肢）の提示まで。復旧作業そのものは本モードの範囲外（該当タスクとして別途実施）。
3. **why-why-why 分析（3 段以上）と再発防止提案書の起草**: `anytime-analysis`（既定 lightweight）で `proposal/<YYYYMMDD>-<topic>.ja.md` へ出力し、§4.1 の要領でチケットを 1 件起票する（`title` は `再発防止: <テーマ>`、`priority` は事故の重大度に応じて `high` / `urgent`）。global CLAUDE.md「バグ修正時」のリリース後不具合ルールと同一プロセスであり、分析様式を二重定義しない。
4. **提案の採否は人**。採択された提案は `anytime-dev-cycle` 段2（要件書・設計書の改訂 → What 承認）へ引き継ぎ、必要ならロードマップ（`spec/00.requirements/trail-roadmap.ja.md`）の更新も同時に提案する。

## doctrine 抽出モード（暗黙知の明文化。旧 anytime-reverse-doctrine）

「暗黙知を明文化」「経典を生成」「doctrine を抽出」等の指示では、定期デルタ分析ではなく doctrine 抽出を行う。コード・git 履歴・設計文書・レビュー記録から設計哲学 / 用語 / プロセス実態 / 未明文規約の 4 カテゴリを抽出し、根拠（逐語引用＋出典）付きの doctrine 4 文書として既定 `<docsRoot>/spec/92.doctrine/` へ出力する。リバースエンジニアリング系譜の第 3 段（`anytime-reverse-codegraph`＝構造、`anytime-reverse-spec`＝設計書、本モード＝文化・暗黙知）。

- 手順の正本は `references/reverse-doctrine.ja.md`（Phase 0〜4・確度/状態/承認の統一構造・Red Flags）。出力 skeleton は `templates/doctrine/<category>.ja.md`。
- 対象リポジトリ・Trail DB へは**読み取り専用**。規約ファイル（AGENTS.md / CLAUDE.md / スキル）への昇格は提案までで自動編集しない。承認 `canon` は人だけが付与できる（抽出出力は必ず `draft`）。
- `--delta` は既存文書への差分更新＋乖離レポート、`--category` はカテゴリ限定。定期レトロ（§2 の `doctrineGap` デルタ）が doctrine 運用の**計測**を担うのに対し、本モードは doctrine 本文の**抽出・更新**を担う。

## セットアップ監査は別スキル

PC 環境・Claude Code 設定（CLAUDE.md / rules / skills / hooks / settings / MCP）の read-only 診断は `anytime-dev-audit` へ分離した（2026-07-14）。本スキルは**開発活動**のふりかえり（実績データ・事故）を担い、**環境・設定**の診断は担わない。

## スケジューラ連携（本スキルの範囲外）

本スキルはスケジューラ非依存の可搬コア。週次自動実行の配線（Desktop Scheduled Task 等）は `plan/20260622-periodic-dev-health-analysis.ja.md` の「スケジューリング」を参照。手動でも `/anytime-dev-retro` で実行できる。
