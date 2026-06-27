# AGENTS.md（anytime-markdown ツール中立規約）

更新日: 2026-06-27

> このファイルは Claude Code・Codex など、どのエージェントも従うツール中立な規約の単一の正（source of truth）である。\
> Claude 固有の補足（discovery 手順・Trail DB・並行セッション検知・スキル参照）は `CLAUDE.md` を、Codex 固有設定は各自のルールを参照する。

## リポジトリ構成

- プライマリリポジトリ: 本リポジトリ（`/anytime-markdown/`）。VS Code ワークスペースのメイン。
- `/Shared/anytime-markdown-docs/` — ドキュメント出力先（`/anytime-markdown/` 内には出力しない）。独立 Git リポジトリのため完了時に `git status` で確認。Git ルールは両リポジトリに適用。

> [!NOTE]
> 知識の正本（source of truth）は `/Shared/anytime-markdown-docs/` 配下の Markdown（ベンダー中立な可搬形式）である。Trail DB（`trail.db` / `memory-core.db` / `doc-core.db`）・各種 memory は、その正本から導出される検索インデックスと位置づける（Open Knowledge Format の「プラットフォームでなく形式」原則）。知識をチャットや DB に閉じ込めず、可搬な Markdown へ外部化することを優先する。

## ドキュメント出力先

- プランファイル: `/Shared/anytime-markdown-docs/plan/*.md`（3 ファイル以上変更する機能で作成し、承認後に実装）。
- レビュー: `/Shared/anytime-markdown-docs/review/`。
- 提案: `/Shared/anytime-markdown-docs/proposal/`。
- ドキュメントの構文・フロントマター・整形は `anytime-markdown-output` 規約（`packages/vscode-markdown-extension/skills/anytime-markdown-output/SKILL.md`）に従う。

## モノレポ構造

- `packages/*` の npm workspace 構成。
- VS Code 拡張と Web アプリは同一機能を提供することが多い。両者で使うロジック・UI は共通パッケージに配置し、確認なしに片側だけ実装・修正することは禁止。
- i18n キー（`packages/<viewer>/src/i18n/{ja,en}.ts` など）を追加・変更する場合は階層構造・top namespace・サフィックス規則に従う（Claude は `i18n-naming` スキル参照）。
- 検証コマンドの実在確認: ビルド・テスト・型チェックコマンド（`npm run X` / `npx jest <path>` / `npm run build --workspace=...` 等）は、対象 `package.json` の `scripts` と `devDependencies` を事前確認する。確認手段:
  - `jq -r '.scripts | keys[]' packages/<pkg>/package.json`
  - `jq -r '.devDependencies | keys[]' packages/<pkg>/package.json`
  - `<pkg>/jest.config.js` の `testMatch` で `.tsx` 拡張子を含むか
  - workspace ルートに該当 script があるか（root の `package.json`）

## Git 基本ルール

- 永続ブランチ: `master`（本番）・`develop`（開発統合）。作業ブランチは `develop` から `feature/` `fix/` `refactor/` で作成し、完了後マージして削除する。
- `master` / `main` では作業しない。プラン実行前に `git branch --show-current` で確認し、必要なら `develop` から作業ブランチを作る。
- 広域 add 禁止（`git add .` / `-A` / `--all` / `commit -a` 禁止）。ファイル名を明示する。
- コミットメッセージは Conventional Commits（`feat` / `fix` / `refactor` / `test` / `docs` / `perf` / `security` / `ci`）。
- リモート push・本番リリース・破壊的操作（`reset --hard` / `checkout`（作業ツリー上書き）/ `clean -f` / `branch -D` / `push --force` 系）はユーザーの明示指示があるまで行わない。
