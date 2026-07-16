# CLAUDE.md（anytime-markdown プロジェクト固有）

更新日: 2026-07-16

> 汎用の作業スタイル・Git 哲学・サブエージェント方針・応答ルールは `~/.claude/CLAUDE.md`（global）に従う。\
> ツール中立な規約（リポジトリ構成・ドキュメント正本の位置づけ・出力先・モノレポ構造・Git 基本）は `AGENTS.md`（Claude / Codex 共通）に従う。\
> 本ファイルは Claude 固有の補足（discovery 手順・Trail DB・並行セッション検知・スキル参照）のみを定義する。

## ツール中立規約は AGENTS.md を参照

- リポジトリ構成・ドキュメント正本の位置づけ（OKF 形式優先）・出力先・モノレポ構造・検証コマンド実在確認・Git 基本ルールは `AGENTS.md`（ツール中立規約の単一の正。Claude / Codex 双方が従う）に集約した。重複時は `AGENTS.md` を優先する。本ファイルは Claude 固有の補足のみを定義する。

## ドキュメント保存先（docsRoot）

- docsRoot: /Shared/anytime-markdown-docs
- 設計書（spec）・提案（proposal）・プラン（plan）・レビュー（review）・レポート（report）等のドキュメントは docsRoot 配下へ出力する（コード repo 内に置かない）。
- スキル・ドキュメント内の `<docsRoot>` プレースホルダは本節の値に読み替える。スキル本文へ docs リポジトリの絶対パスを直接記載しない（保存先は本節が単一の正）。
- `anytime-dev-cycle` の preflight.cjs は本節の `- docsRoot:` 行を自動解決する（`--docs-root` 指定時はそちらを優先）。

## Claude 固有のドキュメント参照

- UI / 画面コンポーネントの実装・修正時は `<docsRoot>/spec/10.web-app/design.md` を必ず Read してから着手する（指針は `screen-design` スキル）。
- worktree とブランチ切替の詳細判断: `<docsRoot>/tech/branch/worktree-vs-branch.ja.md`。

## Trail DB

- **Trail DB** (`~/.claude/trail/trail.db`): セッション・コミット・コードグラフの調査は `git log` / `*.jsonl` grep より DB を優先。

  | 用途 | テーブル |
  | --- | --- |
  | セッション・メッセージ | `messages`（`session_id` / `type` / `timestamp` / `skill` / `tool_calls`） |
  | コミット調査 | `session_commits` / `commit_files` / `message_commits` |
  | コードグラフ構造探索 | `current_code_graphs.graph_json`（テキスト検索は Grep / Serena） |

  **注意**: Trail 拡張のインポートラグ（数十分〜VS Code リロード）のため直近データは未取込の場合あり。

- **discovery 順序（mcp-trail discovery ツール優先）**: 構造・依存・所在の探索は (1) どこから読むか＝`get_important_files`（filter: central/dead/barrel/risky）→ (2) 影響範囲＝`get_code_dependencies`（filePath 可・incoming/outgoing）/ シンボル所在＝`query_code_graph`（検索専用・既定 summary）/ 接続経路＝`find_code_path` / 共変更＝`get_cochange_partners` → Serena（本文）→ Read（編集箇所）の順（原則は global `~/.claude/CLAUDE.md`「discovery の順序」）。`current_code_graphs.graph_json` の丸読み（約43万トークン）と `list_relationships` の影響範囲用途は禁止（後者は手動 C4 専用。影響範囲は `get_code_dependencies` を使う）。TrailDataServer 稼働が前提（未起動時はエラー）。

## 並行セッション検知

- worktree 作成や長時間タスク開始前に `/anytime-markdown/.vscode/claude-code-status-*.json` の `timestamp` を確認。自身以外のセッションが ACTIVE（5 分以内）で別ブランチを触っているなら worktree 採用、同一ブランチで動いているなら衝突回避のためユーザーに確認。

## プロジェクト固有ルール

下表は `/anytime-markdown/.claude/skills/` 配下のうち、旧 `.claude/rules/` から移行したルール系スキルの抜粋（同ディレクトリには他のタスク用スキルも多数あり、網羅列挙はしない）。いずれも description のトリガに応じて該当作業時に Claude が参照する（常時 memory ロードの progressive disclosure 化）。

| スキル | 適用タイミング |
| --- | --- |
| `anytime-doc-authoring` | ドキュメント新規作成・執筆時（type 別の記載内容・component spec・索引 index.[lang].md 運用） |
| `i18n-naming` | i18n キーの追加・変更時 |
| `screen-design` | UI / 画面コンポーネントの実装・修正時 |
| `sqlite-table-definition-trail-core` | SQLite テーブル定義の新規作成・変更・マイグレーション時（trail-core 固有補足。汎用ルールは global スキル `sqlite-table-definition`） |
| `anytime-trail-review` | コードレビュー結果の出力時（trail memory-core ingest 対応書式） |
| `vanilla-ui-conventions` | 脱React vanilla UI（markdown-viewer）・エディタ状態購読の実装・修正時 |
| `production-release` | 本番リリース（拡張機能の vsix 作成・Marketplace 公開・バージョン bump）時。anytime-markdown 固有のパッケージ系統・CI 配線に特化（global から移設） |
| `deploy-cms-remote` | `packages/mcp-cms-remote`（Cloudflare Workers）のデプロイ時。当該パッケージ専用（global から移設） |

<!-- anytime-agent:dev-cycle-guidance v1 -->
## 開発基本スキル（anytime-agent 拡張が管理・手動編集しない）

- 開発指示（実装・修正・リファクタ・一気通貫、Codex / ollama への委譲、サブエージェント回転）は `anytime-dev-cycle` スキル（`.claude/skills/anytime-dev-cycle/`）を基本として実行する。入口 3 モード・工程ルート・ゲートは同スキルを参照する。
- 初回またはスキル更新後は、本編前にプリフライト（`node .claude/skills/anytime-dev-cycle/preflight.cjs`）を必ず実行する。
<!-- /anytime-agent:dev-cycle-guidance -->
