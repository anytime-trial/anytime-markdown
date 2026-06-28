# CLAUDE.md（anytime-markdown プロジェクト固有）

更新日: 2026-06-27

> 汎用の作業スタイル・Git 哲学・サブエージェント方針・応答ルールは `~/.claude/CLAUDE.md`（global）に従う。\
> ツール中立な規約（リポジトリ構成・ドキュメント正本の位置づけ・出力先・モノレポ構造・Git 基本）は `AGENTS.md`（Claude / Codex 共通）に従う。\
> 本ファイルは Claude 固有の補足（discovery 手順・Trail DB・並行セッション検知・スキル参照）のみを定義する。

## ツール中立規約は AGENTS.md を参照

- リポジトリ構成・ドキュメント正本の位置づけ（OKF 形式優先）・出力先・モノレポ構造・検証コマンド実在確認・Git 基本ルールは `AGENTS.md`（ツール中立規約の単一の正。Claude / Codex 双方が従う）に集約した。重複時は `AGENTS.md` を優先する。本ファイルは Claude 固有の補足のみを定義する。

## Claude 固有のドキュメント参照

- UI / 画面コンポーネントの実装・修正時は `/Shared/anytime-markdown-docs/spec/10.web-app/design.md` を必ず Read してから着手する（指針は `screen-design` スキル）。
- worktree とブランチ切替の詳細判断: `/Shared/anytime-markdown-docs/tech/branch/worktree-vs-branch.ja.md`。

## Trail DB

- **Trail DB** (`~/.claude/trail/trail.db`): セッション・コミット・コードグラフの調査は `git log` / `*.jsonl` grep より DB を優先。

  | 用途 | テーブル |
  | --- | --- |
  | セッション・メッセージ | `messages`（`session_id` / `type` / `timestamp` / `skill` / `tool_calls`） |
  | コミット調査 | `session_commits` / `commit_files` / `message_commits` |
  | コードグラフ構造探索 | `current_code_graphs.graph_json`（テキスト検索は Grep / Serena） |

  **注意**: Trail 拡張のインポートラグ（数十分〜VS Code リロード）のため直近データは未取込の場合あり。

- **discovery 順序（mcp-trail discovery ツール優先）**: 構造・依存・所在の探索は `get_important_files`（どこから読むか）→ `get_code_dependencies`（影響範囲・filePath 可）/ `query_code_graph`（所在・検索専用）/ `find_code_path` / `get_cochange_partners` → Serena（本文）→ Read（編集箇所）の順。詳細は global `~/.claude/CLAUDE.md`「discovery の順序」。`current_code_graphs.graph_json` の丸読み（約43万トークン）と `list_relationships` の影響範囲用途は禁止（後者は手動 C4 専用）。TrailDataServer 稼働が前提（未起動時はエラー）。

## 並行セッション検知

- worktree 作成や長時間タスク開始前に `/anytime-markdown/.vscode/claude-code-status-*.json` の `timestamp` を確認。自身以外のセッションが ACTIVE（5 分以内）で別ブランチを触っているなら worktree 採用、同一ブランチで動いているなら衝突回避のためユーザーに確認。

## プロジェクト固有ルール

以下のスキルは `/anytime-markdown/.claude/skills/` に配置されており、description のトリガに応じて該当作業時に Claude が参照する（旧 `.claude/rules/` から移行し、常時 memory ロードを progressive disclosure 化）。

| スキル | 適用タイミング |
| --- | --- |
| `i18n-naming` | i18n キーの追加・変更時 |
| `screen-design` | UI / 画面コンポーネントの実装・修正時 |
| `sqlite-table-definition-trail-core` | SQLite テーブル定義の新規作成・変更・マイグレーション時（trail-core 固有補足。汎用ルールは global スキル `sqlite-table-definition`） |
| `review-finding-format` | コードレビュー結果の出力時（trail memory-core ingest 対応書式） |
| `vanilla-ui-conventions` | 脱React vanilla UI（markdown-viewer）・エディタ状態購読の実装・修正時 |
