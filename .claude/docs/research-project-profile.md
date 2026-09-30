# 調査系スキル向けプロジェクト概要（正本）

更新日: 2026-09-30

daily-research / weekly-research が「当プロジェクトへの影響度」「当プロジェクトへの示唆」を書くときに前提とするプロジェクト像。両スキルはこのファイルを参照し、スキル本文へ別の説明を書かない（2026-09 に両スキルの記述が「Tiptap ベース」「Tiptap は使っていない」と食い違い、レポートの影響度判定がぶれた）。構成が変わったらこのファイルだけを更新する。

## 構成

- anytime-markdown モノレポ（`packages/*` 約 60 パッケージ）。
- **エディタ**: `packages/markdown-core` に Tiptap v3.20.0 のソースと tiptap-markdown 0.9.0 を vendoring している（`package.json` の description 参照）。npm の `@tiptap/*` には依存しない。Tiptap upstream の更新は再 vendoring でしか入らないため、Tiptap の新リリースは「直接の依存更新」ではなく「再 vendoring の検討材料」として扱う。`prosemirror-*` には直接依存する。
- その上に脱 React の vanilla DOM エディタ `packages/markdown-editor` を載せ、VS Code 拡張（`vscode-markdown-extension` ほか）と Web アプリ（`web-app`: Next.js・MUI・Supabase）で提供する。
- **Trail**: 開発活動（セッション・コミット・コードグラフ・レビュー）を記録・分析する基盤。`trail-*`・`mcp-trail`・`vscode-trail-extension`（better-sqlite3 / SQLite）。
- **MCP サーバー**: `mcp-markdown` / `mcp-cms` / `mcp-cms-remote` / `mcp-trail` / `mcp-diagram` / `mcp-graph`（`@modelcontextprotocol/sdk`・zod）。

## 開発環境

- 主な開発環境は Claude Code。Codex CLI と ローカル ollama（`ollama-core`）は委譲先として使う（`anytime-dev-cycle` の委譲ルール）。
- Gemini CLI / Antigravity はコード・設定から使っていない（2026-09-30 時点の grep で利用なし）。これらの変更は原則「低」。

## 影響度判定での使い方

調査対象を当プロジェクトが実際に使っているかは、この概要だけで決めず、コード・設定・`package.json` を grep して確かめる。使っていなければ影響度は「低」とする。
