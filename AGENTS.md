# AGENTS.md（anytime-markdown ツール中立規約）

更新日: 2026-09-26

> Claude Code・Codex など、どのエージェントも従うツール中立な規約の単一の正。Claude 固有の補足は `CLAUDE.md`。**Codex を単独で起動した場合に読まれる指示は本ファイルだけである**。根拠・経緯・実測値は `.claude/docs/claude-md-rationale.md`（常時ロードしない）。

## リポジトリ構成

- プライマリリポジトリ: 本リポジトリ（`/anytime-markdown/`）。
- docs リポジトリ（`<docsRoot>`）: ドキュメント出力先。実パスは `CLAUDE.md` の `- docsRoot: <path>` 行が単一の正で、本ファイル・各スキル内の `<docsRoot>` はその値に読み替える。独立 Git リポジトリのため完了時に `git status` で確認する。Git ルールは両リポジトリに適用。
- 知識の正本は `<docsRoot>/` 配下の Markdown。Trail DB（`activity.db` / `caravan-book.db` / `catalog.db`）・各種 memory はそこから導出される検索インデックス。知識をチャットや DB に閉じ込めず、可搬な Markdown へ外部化する。

## 設計原則

- 定常処理・運用ループは決定論ロジックで構成し、LLM 推論は真に意味的判断が要る局面に限定する（doctrine `<docsRoot>/spec/92.doctrine/principles.ja.md`）。

## 開発プロセス（Claude Code / Codex 共通）

正本は `<docsRoot>/spec/01.process/anytime-development-process.ja.md` と `anytime-dev-cycle` 規約 `packages/vscode-agent-extension/skills/anytime-dev-cycle/SKILL.md`（Claude Code では `.claude/skills/anytime-dev-cycle/` へ複製される）。実装・修正・リファクタの指示を受けたら同規約 §0〜§6 を読んでから着手する。

### 承認の対象（What を承認し、How は AI に委ねる）

- 人の承認を取るのは「要件書・設計書（What）」と「受け入れ試験の合否」の 2 点のみ。実装計画（How）と実施内容に承認ゲートを置かない。
- 都度承認が要る例外: パッケージの追加・更新、破壊的操作（`git reset --hard` / `clean -f` / `branch -D` / force push 系・永続データ書込）、リモート push・本番リリース。
- 承認を求めるときは判断材料（根拠・却下した代替案と理由・想定される失敗シナリオ）を添える。

### 工程（段 0〜7）

| 段 | 内容 | ゲート・要点 |
| --- | --- | --- |
| 0 | ブランチ確認 | `git branch --show-current`。永続ブランチ（`master` / `main` / `develop`）なら `develop` から `feature/` `fix/` `refactor/` を切る。`.git/anytime/claims/*.json` に同一 worktree の生存セッション（`pid` 実在）があれば `git worktree add .worktrees/<name> -b <branch> develop` で分離する |
| 1 | 提案書 | 明示指示時のみ。`<docsRoot>/proposal/` |
| 2 | 要件書・設計書（What 承認） | 新機能・振る舞い変更で必須。`<docsRoot>/spec/` を作成・改訂し人の承認を得る。UI・振る舞いを持つ機能は component spec・E2E シナリオ・試験設計書も更新する |
| 3 | 実装計画（承認不要） | 3 ファイル以上の変更で `<docsRoot>/plan/` にプランファイルを作る。範囲が重なる未完了プランがあれば継続・差分更新。検証コマンドは対象 `package.json` の `scripts` / `devDependencies` で実在確認。検証手段を決められないタスクは実装に入らず分解し直す |
| 4 | 実装 | 着手前にループ形状（固定手順 / 反復 / 探索）・1 ターンの定義・終了条件・進捗指標を 1 行で宣言。純粋関数の新規作成は TDD。不具合修正は fail するリグレッションテストを先に書き修正後も残す。変更後はテスト・ビルド・`git diff --stat` でスコープ確認 |
| 5 | 設計書更新・ドリフト検知 | 振る舞い・I/F・画面・データモデルが変わったら `<docsRoot>/spec/` を更新。enum・設定値・プリセットの変更は兄弟値リテラルで横断 grep し、TS union・i18n・schema・nls・設計書のミラーを同時更新 |
| 6 | マージ前レビュー | error / warn を対処してからマージ（`~/.claude/docs/pre-merge-review.md`）。共有パッケージ（`packages/*-core` 等）に触れた変更は `npm run build -w @anytime-markdown/web-app` と `npm run compile -w anytime-graph` の両方を回す。高重大度（永続データ・セキュリティ・公開経路・破壊的操作）は実装と別系統モデルの独立レビュー必須 |
| 7 | マージ | `develop` へローカルマージのみ。push・本番リリースは明示指示時だけ |

種別（新機能 / リファクタ / 不具合修正 / typo・deps・docs）ごとの実施・省略工程は同規約 §1.2 のルート表に従う。着手時に「判定種別・実施工程・省略工程と理由・段4 の実行手段」を 1 ブロックで宣言し、黙って省略しない。

### 不具合修正

- 修正方針の既定は**ベストプラクティス案**（根本構造を整える）。人へ選択を仰がず実装まで進め、採った方針・却下した安定性優先案と理由・想定される失敗シナリオを応答またはコミット本文に残す。既定が明らかに割に合わない場合だけ理由を添えて人へ聞く。
- 出力ファイル・レンダリング結果を直接編集せず、ソースを修正する。エラー時は同じ操作をリトライせず原因調査へ切り替える。詳細は `~/.claude/docs/bugfix-workflow.md`。

### 参照する規約ファイル（ツール中立）

- Git 手続き: `~/.claude/rules/git-workflow.md`
- コード品質: `~/.claude/rules/code-quality.md`、`.claude/skills/anytime-coding-conventions/SKILL.md`
- マージ前レビュー: `~/.claude/docs/pre-merge-review.md`、レビュー観点: `~/.claude/skills/code-review-checklist/SKILL.md`
- 外部取得コンテンツ: `~/.claude/rules/untrusted-content.md`
- 委譲契約 6 点・中断規則: `packages/vscode-agent-extension/skills/anytime-dev-cycle/references/delegation.md` / `stopping-rules-playbook.md`
- 作業別のプロジェクト規約: `.claude/skills/<name>/SKILL.md`（UI: `screen-design`、i18n: `i18n-naming`、ProseMirror: `prosemirror-conventions`、SQLite: `sqlite-table-definition-trail-activity`、Supabase: `supabase-schema-sync`、vanilla UI: `vanilla-ui-conventions`、レビュー書式: `anytime-trail-review`、リリース: `production-release`）。90 日発火ゼロの `prosemirror-conventions` / `supabase-schema-sync` / `deploy-cms-remote` / `weekly-research` / `daily-research` は `.claude/skills-archive/<name>/SKILL.md` に退避してあり自動発火しない。該当作業ではパス指定で Read する。ドキュメント執筆は `packages/vscode-markdown-extension/skills/` の `anytime-doc-authoring` / `anytime-markdown-output` / `anytime-markdown-usage`。

### 応答・報告

- 日本語・結論ファースト・簡潔。挨拶・前置き・段階報告・絵文字を置かない。区切りで「何をしたか / 何が分かったか / 次に何をするか」を各 1 行で述べる。
- 完了時は `anytime-dev-cycle` 規約 §6 の完了通知テンプレで報告する。未実施の工程は理由付きで書く。
- 委譲先・レビュアーの「完了しました」「指摘なし」を根拠にしない。受けた側が実測（テスト実行・`git diff`・対象ファイルの実在と内容確認）で裏取りしてから統合する。

## Codex 単独実行時の読み替え

`codex exec` で委譲された場合は委譲プロンプト（契約 6 点）が工程を担う。単独起動時は本ファイルだけが入口になるため、Claude 固有の機構を次のとおり読み替える。代替できないものは完了報告に「縮退」として明記する。

| Claude Code の機構 | Codex 単独での読み替え |
| --- | --- |
| Skill 起動 | 該当 `SKILL.md` を読んで手順に従う。プリフライトは `node packages/vscode-agent-extension/skills/anytime-dev-cycle/preflight.cjs` |
| AskUserQuestion（What 承認・種別確認） | 対話モードでは人に質問して回答を待つ。headless では段2 の成果物を書いた時点で止めて「承認待ち」を報告する。承認を自分で代行しない |
| 段6 `pr-review-toolkit:code-reviewer` | `codex review --base develop` で自己レビューし、`anytime-trail-review` 書式（指摘ごとに `- **対象**: <相対パス>:<行番号>`）で `<docsRoot>/review/<YYYYMMDD>-<topic>.ja.md` に出力する。高重大度は `claude -p` による独立レビューを取るか、「Claude 側レビュー未実施」と報告してマージを止める |
| 段5 ドリフト検知（mcp-trail） | 未設定。変更ファイルと `c4Scope` を持つ設計書の突合を手動で行い、縮退を報告に明記する |
| Flight Record・ドクトリン接地判断 | 未設定。代行承認は成立しないので What 承認は必ず人へ聞く |
| フック（`destructive-guard.sh`・airspace ゲート・衝突検知） | 発火しない。永続ブランチ直コミット・破壊的 git・広域 add を自分で禁じ、`.git/anytime/claims/` の生存クレーム（`/proc/<pid>` 実在）を着手前に確認する |
| サブエージェント委譲 | 委譲契約 6 点と `stopping-rules-playbook.md` を同梱し、返り値は実測で裏取りする |
| メモリ（`~/.claude/projects/*/memory/`） | 読まない。横断制約は本ファイルと上記規約ファイルの範囲で適用する |

## ドキュメント出力先

- プランファイル: `<docsRoot>/plan/*.md`。レビュー: `<docsRoot>/review/`。提案: `<docsRoot>/proposal/`。
- マニュアル（type: manual）は例外的に本リポジトリの `docs/manual/` に置く。索引は `npm run manual:index` で再生成する。マニュアル同士のリンクは相対パス、設計書への参照は `/spec/...` 表記のまま残す。
- 構文・フロントマター・整形は `anytime-markdown-output` 規約、type 別の記載内容・component spec は `anytime-doc-authoring` 規約（いずれも `packages/vscode-markdown-extension/skills/`）に従う。
- 各フォルダに予約索引 `index.[lang].md` を置き、`scripts/gen-spec-index.mjs` で frontmatter から自動生成する（手書き禁止）。運用詳細は `anytime-doc-authoring` 規約 §1.2。

## モノレポ構造

- `packages/*` の npm workspace 構成。
- VS Code 拡張と Web アプリで使うロジック・UI は共通パッケージに配置し、確認なしに片側だけ実装・修正しない。
- i18n キーの追加・変更は `.claude/skills/i18n-naming/SKILL.md` に従う。
- 検証コマンドの実在確認: `jq -r '.scripts | keys[]' packages/<pkg>/package.json`、`jq -r '.devDependencies | keys[]' packages/<pkg>/package.json`、`<pkg>/jest.config.js` の `testMatch` が `.tsx` を含むか、root `package.json` に該当 script があるか。

## Git 基本ルール

- 永続ブランチ: `master`（本番）・`develop`（開発統合）。作業ブランチは `develop` から `feature/` `fix/` `refactor/` で作成し、完了後マージして削除する。
- 永続ブランチでは作業しない。着手前に `git branch --show-current` で確認し、必要なら `develop` から作業ブランチを作る。例外はドキュメント専用コミットと hotfix のみ（`~/.claude/rules/git-workflow.md`）。
- コミット前の 3 点確認（ブランチ / `git status` / `git diff --cached`）を必ず行い、身に覚えのない差分があれば中断する。
- 広域 add 禁止（`git add .` / `-A` / `--all` / `commit -a`）。ファイル名を明示する。
- コミットメッセージは Conventional Commits（`build` / `chore` / `ci` / `docs` / `feat` / `fix` / `perf` / `refactor` / `revert` / `style` / `test` ＋固有型 `a11y` / `security`。一覧外の型は使わない）。
- リモート push・本番リリース・破壊的操作（`reset --hard` / `checkout`（作業ツリー上書き）/ `clean -f` / `branch -D` / `push --force` 系）はユーザーの明示指示があるまで行わない。
