---
name: anytime-ticket-loop
description: チケット駆動の自動実行 1 tick。「/anytime-ticket-loop」「チケットループ」「ticket loop」「チケットを自動実行」の指示、または /loop からの定期起動で使用する。.tickets/ 配下の Markdown チケット（1 チケット=1 ファイル・YAML フロントマター）を走査し、担当が AI のチケットを 1 件選定して着手宣言→実行→状態遷移コミットまでを行う。人への質問・確認・承認はチャットでなくチケット（Comments + question ラベル）で管理する。
---

# anytime-ticket-loop — チケット駆動自動実行（1 tick）

更新日: 2026-07-16

チケット正本は Git リポジトリの `.tickets/` 配下の Markdown（フォーマットは要件定義書
`spec/00.requirements/ticket-system-requirements.ja.md` の FR-2 / §8。web-app の /tickets ボードと同一）。
本スキルは **1 回の起動で 1 tick（最大 1 チケット）** を処理する固定手順ループであり、
チケット本文の作業自体は通常の開発規約（`anytime-dev-cycle` 等）に従って実施する。

## 0. 前提の解決（満たせなければ中断して報告）

1. チケットディレクトリ: ワークスペースルートの `.tickets/`。無ければ環境変数 `ANYTIME_TICKETS_DIR` を確認し、どちらも無ければ「チケットリポジトリが見つからない」と報告して終了する。
2. AI エージェント識別名: 既定 `agent`（チケットの `assignee` と照合。web-app の新規作成 UI は `agent` / `user` の選択式。旧識別名 `claude-code` のチケットも対象に含めてよい）。
3. git リポジトリであり、リモートへの push 権限があること（後述の安全境界の範囲のみ使用）。

## 1. tick の手順（固定手順・分岐最小）

1. **最新化**: `git pull --ff-only`。失敗（コンフリクト・非 ff）したら何も変更せず報告して終了する。
2. **走査**: `.tickets/*.md`（`archive/` は除外）のフロントマターを解析する。解析不能ファイルはスキップし、tick 報告に「要修復」として列挙する（ループ全体を止めない）。
3. **対象選定**（上から優先・各条件はすべて AND）:
   1. 再開: `status: in_progress` / `assignee` が AI 識別名 / `labels` に `question` **無し**（人の回答が済み再開待ち）
   2. 新規: `status: up_next` / `assignee` が AI 識別名 / `dependencies` の全チケットが `completed` / `labels` に `question` 無し
   - 複数該当時は priority（urgent > high > medium > low）→ id 番号昇順で **1 件のみ**選ぶ。
4. **対象 0 件**: 「静穏 tick（対象なし）」と 1 行報告して終了する。
5. **着手宣言（重複実行防止）**: 選定チケットの `status: in_progress` と `updated_at`（ISO 8601 UTC）を更新し、当該ファイルのみコミットして push する。push が non fast-forward 等で拒否されたら**他エージェントの先行**とみなし、ローカルコミットを取り消さず `git pull --rebase` → 自分の変更が競合したら手を引いて終了する（次 tick に委ねる）。
6. **実行**: チケット本文の `## 概要 (Description)` と `## 作業タスクリスト (Subtasks)` を作業指示として実施する。
   - サブタスクを完了するたびに `- [x]` 化と `progress` 更新をコミットする。
   - 中断・セッション跨ぎに備え、`## 引継ぎサマリー (Handoff Notes)` に現在状態（何が済み・次に何をするか）を維持する。
   - 作業の進め方自体は通常の開発規約（`anytime-dev-cycle`・プロジェクト CLAUDE.md）に従う。
7. **完了**: 全サブタスク完了（または本文の完了条件を充足）したら `status: in_review` と `updated_at` を更新してコミット・push し、実施内容を tick 報告にまとめて終了する。`completed` への遷移は人のレビュー操作であり、本スキルは行わない。

## 2. 質問・確認・承認のチケット上管理（チャットで聞かない）

実行中に人の判断が必要になったら（仕様の曖昧さ・What の確定・パッケージ追加・破壊的操作・リモート push 等の承認）、AskUserQuestion やチャットではなく次の手順で行う:

1. `## コミュニケーションスレッド (Comments)` の末尾へ追記する（書式は下記）。プレフィクスは `質問:` または `承認依頼:` とし、判断材料（根拠・選択肢・推奨）を含める。

   ```markdown
   ### agent - 2026-07-16T05:00:00.000Z

   承認依頼: パッケージ X の追加が必要です。理由: ...。代替案: ...。承認いただければ次 tick で実施します。
   ```

2. フロントマターの `labels` に `question` を追加する（`status` は `in_progress` のまま）。
3. 当該ファイルのみコミット・push し、このチケットの作業を中断する（以後の tick は選定条件によりスキップされる）。
4. 人は web-app（/tickets）・GitHub・ローカル編集のいずれかで Comments に回答を追記し、`labels` から `question` を外す。次 tick から手順 1-3-1（再開）で選定される。再開時は必ず Comments の最新回答を読み、**承認（「承認」「ok」等）が明記された場合のみ**依頼した操作を実行する。

## 3. 安全境界

- **push してよいのは `.tickets/` 配下のチケットファイルの変更のみ**。コミットはファイル名を明示して add する（`git add .` 禁止）。
- 作業成果物（コード等）のリモート push・本番リリース・破壊的操作（`git reset --hard` / `clean -f` 等）は、§2 の承認依頼で明示承認を得るまで実行しない。
- Claude Code の権限設定・hooks・プロジェクト規約を迂回しない。
- 1 tick で着手するチケットは 1 件のみ（暴走・並行汚染の防止）。

## 4. コミットメッセージ規約

| 場面 | 例 |
| --- | --- |
| 着手宣言 | `ticket: T-12 start (in_progress)` |
| 進捗反映 | `ticket: T-12 progress 60% (subtask 3/5)` |
| 質問・承認依頼 | `ticket: T-12 question (needs answer)` |
| 完了 | `ticket: T-12 ready for review (in_review)` |

## 5. /loop からの運用

- 推奨: `/loop 20m /anytime-ticket-loop`（20 分間隔。prompt cache 効率の制約から 270 秒以下か 1200 秒以上のどちらかに振る）。
- tick 報告（毎回 1〜3 行）: 選定チケット（または「対象なし」）/ 実施内容 / 遷移した status / 要修復ファイル。
- 同一チケットで 2 tick 連続して進捗が出ない場合は、同じ方針で回し続けず質問（§2）に切り替えるか、無進捗の観測内容を報告する。
