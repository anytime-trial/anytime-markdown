# CLAUDE.md（anytime-markdown プロジェクト固有）

更新日: 2026-09-26

> 汎用の作業スタイル・Git・サブエージェント・応答ルールは `~/.claude/CLAUDE.md`（global）、ツール中立規約（リポジトリ構成・出力先・モノレポ・Git 基本）は `AGENTS.md`（重複時はそちらが優先）。本ファイルは Claude 固有の補足のみ。根拠・経緯・実測値は `.claude/docs/claude-md-rationale.md`（常時ロードしない）に置き、本文へ戻さない。

## ドキュメント保存先（docsRoot）

- docsRoot: /Shared/anytime-markdown-docs
- spec / proposal / plan / review / report は docsRoot 配下へ出力する（コード repo 内に置かない）。例外はマニュアル（type: manual）で、本リポジトリの `docs/manual/` が正本。
- スキル・ドキュメント内の `<docsRoot>` は本節の値に読み替える。スキル本文へ絶対パスを直接書かない。`anytime-dev-cycle` の preflight.cjs は本節の `- docsRoot:` 行を自動解決する。

## チケット保存先（ticketsRoot）

- ticketsRoot: /Shared/anytime-ticket（独立 git リポジトリ・ブランチ `main`）。正本は `<ticketsRoot>/.tickets/*.md`、アーカイブは `.tickets/archive/`。
- 本リポジトリに `.tickets/` を作らない。
- ID はリポジトリ全体で通番。起票前に既存の最大 ID を確認する（`tickets-core` の `nextTicketId` に既存 ID 配列を渡す）。ticketsRoot は複数ワークスペース共有で、frontmatter `workspace`（`anytime-markdown` / `anytime-trade` / `other`）で区別する。
- 起票後は `npx tsx` で `tickets-core` の `parseTicketMarkdown` + `validateTicketFrontmatter` に全件通し、ID 重複と `dependencies` の実在を確認する。

## Claude 固有のドキュメント参照

- UI / 画面コンポーネントの実装・修正時は `<docsRoot>/spec/10.web-app/design.md` を Read してから着手する（`screen-design` スキル）。
- design.md が対象としない UI（VS Code 拡張の webview 等）を新規に起こす場合のみ global スキル `shadcn-ui-fallback` を使う。design.md のトークンを流用する画面では常に design.md が優先し、2 系統を混在させない。
- worktree とブランチ切替の詳細判断: `<docsRoot>/tech/branch/worktree-vs-branch.ja.md`。

## Trail DB

- セッション・コミット・コードグラフの調査は `git log` / `*.jsonl` grep より Trail DB（`activity.db`）を優先する。
- 保存先は `lep.json` の `database.storagePath`（既定 `.anytime/trail/db`）を `anytimeTrail.workspace.path` 起点で解決する。既定構成の実体は `<wsRoot>/.anytime/trail/db/activity.db`、同ディレクトリに `caravan-book.db`。`catalog.db` は `<wsRoot>/.anytime/markdown/` 配下。参照前に実在を確認する。

  | 用途 | テーブル |
  | --- | --- |
  | セッション・メッセージ | `activity_messages`（`session_id` / `type` / `timestamp` / `skill` / `tool_calls`） |
  | コミット調査 | `activity_session_commits` / `activity_commit_files` / `activity_message_commits` |
  | コードグラフ構造探索 | `activity_current_code_graphs.graph_json`（丸読み禁止。影響範囲は `get_code_dependencies`） |

- インポートラグ（数十分〜VS Code リロード）のため直近データは未取込の場合がある。
- discovery 順序: (1) `get_important_files`（filter: central/dead/barrel/risky）→ (2) `get_code_dependencies`（影響範囲）/ `query_code_graph`（シンボル所在）/ `find_code_path`（接続経路）/ `get_cochange_partners`（共変更）→ Serena（本文）→ Read（編集箇所）。TrailDataServer 稼働が前提。
- バグ修正・調査・提案 grounding の着手時に `search_caravan_book` へ対象ファイル名・シンボル名・概念名を照会し、過去の決定・不具合・レビュー指摘との接続を確認する。

## ドクトリン接地判断と What 承認の代行（D2）

What 承認が要る場面では、AskUserQuestion を出す前に mcp-trail `record_doctrine_judgment` で接地判断を記録し、`gate.verdict` が `delegable` かつ自分の判断が `approve` のときだけ人に聞かずに進めて `record_delegated_approval` で記録する。それ以外は人へ聞き、直後に `record_human_decision` で記録する。申告必須の 4 項目（`severity` / `target_paths` / `operation_kind` / `underspecified_points`）・`underspecified_instruction` 時の質問対応・記録失敗時の扱い・監視指標と D1 差し戻し条件は **What 承認に入る時点で `.claude/docs/doctrine-judgment-procedure.md` を Read する**。正本は `<docsRoot>/spec/31.trail/16.doctrine-judgment/doctrine-judgment.ja.md` と `18.coverage-gate/coverage-gate.ja.md`。

## 修正方針の既定: ベストプラクティス案

- 修正方針は提示せず、根本構造を整える方向で実装まで進める。リファクタリング・再設計・抽象化を伴ってよい。
- パッケージ追加・更新、破壊的操作、リモート push・本番リリース、永続データ書込は従来どおり人へ聞く。
- 採った方針、却下した安定性優先案と理由、想定される失敗シナリオを応答またはコミット本文に 1 行以上残す。
- 明らかに割に合わない場合（変更範囲が要求に不釣り合い・受入合格済み機能の作り直し等）は自動選択せず、理由を添えて人へ聞く。

## 並行セッション検知（airspace）

- 台帳は `<git-common-dir>/anytime/claims/*.json`（既定 `/anytime-markdown/.git/anytime/claims/`）。全 worktree で共有。1 セッション 1 ファイルで `sessionId` / `pid` / `starttime` / `worktree` / `branch` / `updatedAt` を持つ。
- 生存判定は `updatedAt` でなくプロセス実在（`/proc/<pid>` 実在・`comm` が claude・非ゾンビ・`starttime` 一致の 4 条件）。`updatedAt` が古くてもプロセスが生きていれば衝突相手。
- 判定単位は worktree。worktree 作成・長時間タスク前に `claims/` を確認し、自分以外の生存クレームが同一 worktree を保持していれば相手の終了を待つか `git worktree add` で分離する。
- Bash ゲートは破壊的 git を分類し、他者の生存クレームがある対象への作業ツリー破棄系は deny、それ以外は warn。`git worktree remove` は保持者がいれば deny。脱出口はコマンド行の `ANYTIME_AIRSPACE=off`（ユーザー確認済みの場合のみ）。
- `/clear` は `sessionId` だけを変え pid は生きるため、単独作業でも自分の旧クレームと衝突して永久 deny になり得る。その場合は旧クレームファイルの削除を検討する。

## プロジェクト固有スキル

`.claude/skills/` の規約系スキルは description のトリガに応じて参照する: `anytime-doc-authoring`（ドキュメント執筆）/ `i18n-naming`（i18n キー）/ `screen-design`（UI）/ `sqlite-table-definition-trail-activity`（activity.db のテーブル定義）/ `anytime-trail-review`（レビュー書式）/ `vanilla-ui-conventions`（markdown-editor）/ `production-release`（リリース）。90 日発火ゼロのスキル（`deploy-cms-remote` / `supabase-schema-sync` / `prosemirror-conventions` / `weekly-research` / `daily-research`）は `.claude/skills-archive/` に退避してあり自動発火しない。該当作業ではパス指定で Read する（起動時文脈の圧縮。2026-09-26）。

## 開発基本スキル（anytime-agent 拡張が管理・手動編集しない）

- 実装・修正・リファクタ・一気通貫、Codex / ollama への委譲、サブエージェント回転は `anytime-dev-cycle` スキルを基本として実行する。
- 初回またはスキル更新後は `node .claude/skills/anytime-dev-cycle/preflight.cjs` を先に実行する。
