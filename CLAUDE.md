# CLAUDE.md（anytime-markdown プロジェクト固有）

更新日: 2026-05-24

> 汎用の作業スタイル・Git 哲学・サブエージェント方針・応答ルールは `~/.claude/CLAUDE.md`（global）に従う。\
> 本ファイルは anytime-markdown 固有のパス・モノレポ構造・Trail DB・並行セッション検知のみを定義する。

## リポジトリ構成

- プライマリリポジトリ: 本リポジトリ（`/anytime-markdown/`）。VS Code ワークスペースのメイン。
- `/Shared/anytime-markdown-docs/` — ドキュメント。Claude Code の出力先（`/anytime-markdown/` 内には出力しない）。独立 Git リポジトリのため完了時に `git status` で確認。Git ルールは両方に適用。

## ドキュメント出力先・参照パス

- プランファイル: `/Shared/anytime-markdown-docs/plan/*.md`（3 ファイル以上変更する機能で作成し、承認後に実装）。
- レビュー: `/Shared/anytime-markdown-docs/review/`。
- UI / 画面コンポーネントの実装・修正時は `/Shared/anytime-markdown-docs/spec/12.design/design.md` を必ず Read してから着手する（指針は `screen-design` スキル）。
- worktree とブランチ切替の詳細判断: `/Shared/anytime-markdown-docs/tech/branch/worktree-vs-branch.ja.md`。

## モノレポ構造

- `packages/*` の npm workspace 構成。
- VS Code 拡張と Web アプリは同一機能を提供することが多い。両者で使うロジック・UI は共通パッケージに配置し、確認なしに片側だけ実装・修正することは禁止。
- i18n キー（`packages/<viewer>/src/i18n/{ja,en}.ts` など）を追加・変更する場合は `i18n-naming` スキルに従う（階層構造・top namespace の選び方・サフィックス規則・新規追加チェックリスト）。
- 検証コマンドの実在確認: プランに書くビルド・テスト・型チェックコマンド（`npm run X` / `npx jest <path>` / `npm run build --workspace=...` 等）は、対象 `package.json` の `scripts` と `devDependencies` を事前確認する。確認手段:
  - `jq -r '.scripts | keys[]' packages/<pkg>/package.json`
  - `jq -r '.devDependencies | keys[]' packages/<pkg>/package.json`
  - `<pkg>/jest.config.js` の `testMatch` で `.tsx` 拡張子を含むか
  - workspace ルートに該当 script があるか（root の `package.json`）

## Trail DB

- **Trail DB** (`~/.claude/trail/trail.db`): セッション・コミット・コードグラフの調査は `git log` / `*.jsonl` grep より DB を優先。

  | 用途 | テーブル |
  | --- | --- |
  | セッション・メッセージ | `messages`（`session_id` / `type` / `timestamp` / `skill` / `tool_calls`） |
  | コミット調査 | `session_commits` / `commit_files` / `message_commits` |
  | コードグラフ構造探索 | `current_code_graphs.graph_json`（テキスト検索は Grep / Serena） |

  **注意**: Trail 拡張のインポートラグ（数十分〜VS Code リロード）のため直近データは未取込の場合あり。

## 並行セッション検知

- worktree 作成や長時間タスク開始前に `/anytime-markdown/.vscode/claude-code-status-*.json` の `timestamp` を確認。自身以外のセッションが ACTIVE（5 分以内）で別ブランチを触っているなら worktree 採用、同一ブランチで動いているなら衝突回避のためユーザーに確認。

## プロジェクト固有ルール

以下のスキルは `/anytime-markdown/.claude/skills/` に配置されており、description のトリガに応じて自動適用される（旧 `.claude/rules/` から移行し、常時 memory ロードを progressive disclosure 化）。

| スキル | 適用タイミング |
| --- | --- |
| `i18n-naming` | i18n キーの追加・変更時 |
| `screen-design` | UI / 画面コンポーネントの実装・修正時 |
| `sqlite-table-definition` | SQLite テーブル定義の新規作成・変更・マイグレーション時 |
| `review-finding-format` | コードレビュー結果の出力時（trail memory-core ingest 対応書式） |
| `vanilla-ui-conventions` | 脱React vanilla UI（markdown-viewer）・エディタ状態購読の実装・修正時 |
