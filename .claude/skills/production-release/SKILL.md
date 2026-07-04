---
name: production-release
description: 本番リリース手順ガイド。「リリース」「本番リリース」「拡張機能をリリース」「vsixを作成」「Marketplaceに公開」「バージョンを上げてリリース」などの指示で使用する。
---

# VS Code 拡張機能リリース

更新日: 2026-07-04

anytime-markdown / anytime-graph / anytime-trail / anytime-database / anytime-sheet / anytime-agent / anytime-history / anytime-extension-pack VS Code 拡張機能および web-app のリリース手順。

## 手順

### Step 1: 事前確認

```bash
git branch --show-current   # develop ブランチであること
git status                  # 未コミット変更がないこと
git pull origin develop     # 最新化
```

未コミット変更がある場合はユーザーに確認する。develop 以外のブランチの場合は警告する。

**失敗時**: develop 以外のブランチにいる場合は `git checkout develop` で切り替え。未コミット変更がある場合はユーザーに stash / commit / discard のいずれかを確認してから続行。

### Step 2: バージョン更新

リリースの単位は **CI の publish ジョブ（タグで公開判定）** が定義する。**同一系統内の「同期セット」パッケージは常に同一バージョンを維持すること。** 各系統のバージョンは独立している。

> [!IMPORTANT]
> publish はそのジョブが参照する **拡張機能 package.json の version** で判定し、`<tag-prefix><version>` のタグが未作成なら公開する。同期セット外のパッケージ（vendored tiptap・各 core/server/viewer の独立バージョン）は bump 対象外で、webpack バンドルにそのまま同梱されるためバージョンを上げる必要はない。

| 系統 | publish ジョブ / タグ | 同期セット（手動 bump 対象） | 備考 |
| --- | --- | --- | --- |
| **markdown 系** | `publish-markdown` / `v<x>` | `package.json` (root), `packages/mcp-markdown`, `packages/markdown-viewer`, `packages/markdown-rich`, `packages/vscode-markdown-extension` | `markdown-core` は vendored tiptap で **0.0.0 固定**・bump 対象外。`version.ts` の `APP_VERSION` は root を動的参照 |
| **graph 系** | `publish-graph` / `graph-v<x>` | `packages/graph-core`, `packages/mcp-graph`, `packages/vscode-graph-extension` | `graph-viewer` は独立バージョン |
| **trail 系** | `publish-trail` / `trail-v<x>` | `packages/trail-core`, `packages/vscode-trail-extension` | `trail-server` / `trail-viewer` / `trail-db` / `mcp-trail` / `memory-core` / `agent-core` は独立・bump 対象外（webpack 同梱）。VSIX は **per-platform 4 種**（`build-trail` matrix: linux/win32 × x64/arm64） |
| **database 系** | `publish-database` / `database-v<x>` | `packages/database-core`, `packages/database-viewer`, `packages/vscode-database-extension` | VSIX は **per-platform 4 種**（`build-database` matrix: linux/win32 × x64/arm64。**darwin なし**） |
| **sheet 系** | `publish-sheet` / `sheet-v<x>` | `packages/spreadsheet-core`, `packages/spreadsheet-viewer`, `packages/vscode-sheet-extension` | — |
| **agent 系** | `publish-agent` / `agent-v<x>` | `packages/vscode-agent-extension` | `agent-core` は独立バージョン |
| **history 系** | `publish-history` / `history-v<x>` | `packages/vscode-history-extension` | `trace-core` / `trace-viewer` / `trace-agent-node` は独立バージョン |
| **extension pack 系** | `publish-extension-pack` / `pack-v<x>` | `packages/vscode-extension-pack` | メタパッケージ |
| **web-app 系** | （Marketplace 公開なし。master push で Netlify 自動デプロイ） | `packages/web-app` | タグなし。`markdown-*` / `graph-core` の変更を取り込む |
| **cms 系** | （Marketplace 公開なし。CI test のみ） | `packages/cms-core`, `packages/mcp-cms` | — |
| **cms-remote 系** | `deploy-mcp-cms-remote.yml`（Cloudflare Workers） | `packages/mcp-cms-remote` | `deploy-cms-remote` スキル参照 |

> [!NOTE]
> per-platform 系（trail / database）の VSIX（各 4 種）は CI（`ci.yml` の `build-trail` / `build-database` matrix → `publish-trail` / `publish-database`）が自動生成・自動公開する。旧 `build-anytime-database.yml` は `ci.yml` に統合済み。darwin ターゲットは現在ビルドしていない。

**バージョン管理ルール:**
- 系統間のバージョンは独立している（markdown 0.10.1 と graph 0.1.0 が共存可能）

- `npm run version:sync` **は使用禁止。** 全ワークスペースに影響し、意図しないパッケージのバージョンを書き換えるため

- バージョン更新は各 `package.json` の `version` フィールドを直接編集する

- バージョン更新後は全パッケージのバージョンを一覧表示して整合性を確認する:

  ```bash
  for dir in . packages/*/; do name=$(node -p "require('./$dir/package.json').name" 2>/dev/null) && ver=$(node -p "require('./$dir/package.json').version" 2>/dev/null) && printf "%-45s %s\n" "$name" "$ver"; done
  
  
  
  
  
  ```

**リリース対象の自動検出:**

前回リリース（master の HEAD）以降に変更があるパッケージを特定し、対応する系統を列挙する。

```bash
# master との差分でパッケージごとの変更ファイル数を表示
git diff --stat origin/master...HEAD -- packages/ | grep 'packages/' | sed 's|/.*||' | sort | uniq -c | sort -rn
```

変更が検出された系統のみをリリース対象とする。変更がない系統はスキップする。

**系統ごとのバージョンアップ確認:**

リリース対象の各系統について、変更内容を要約し、ユーザーに patch / minor / major を1系統ずつ確認する。

- **patch**: バグ修正、軽微な改善、依存更新
- **minor**: 新機能追加、後方互換性のある変更
- **major**: 破壊的変更、後方互換性のない変更

```plaintext
例:
[graph 系] 0.1.0 → 変更: useCanvasBase の型エラー修正、選択矩形カラー定数削除
  → patch (0.1.1) / minor / major ?

[web-app 系] 0.10.1 → 変更: C4 Viewer の GitHub 連携、/docs/view でのドキュメント表示
  → patch / minor (0.11.0) / major ?
```

ユーザーの回答に基づいて各系統のバージョンを更新する。

**markdown 系の更新:**
```bash
# 以下4つの package.json の version フィールドを手動で同一バージョンに更新
# - package.json (root)
# - packages/markdown-core/package.json
# - packages/mcp-markdown/package.json
# - packages/vscode-markdown-extension/package.json
```

更新後、上記4ファイルのバージョンが統一されていることを確認。\
`packages/markdown-viewer/src/version.ts` の `APP_VERSION` はルート package.json を動的参照するため手動更新不要。

**graph 系の更新:**
```bash
# 各 package.json の version を手動で更新
# graph-core, mcp-graph, vscode-graph-extension の3つを同一バージョンに統一
```

更新後、以下のファイルでバージョンが統一されていることを確認:
- `packages/graph-core/package.json`
- `packages/mcp-graph/package.json`
- `packages/vscode-graph-extension/package.json`

**trail 系の更新:**
```bash
# 各 package.json の version を手動で更新
# trail-core, vscode-trail-extension の2つを同一バージョンに統一
```

更新後、以下のファイルでバージョンが統一されていることを確認:
- `packages/trail-core/package.json`
- `packages/vscode-trail-extension/package.json`

**database 系の更新:**
```bash
# 各 package.json の version を手動で更新
# database-core, database-viewer, vscode-database-extension の3つを同一バージョンに統一
```

更新後、以下のファイルでバージョンが統一されていることを確認:
- `packages/database-core/package.json`
- `packages/database-viewer/package.json`
- `packages/vscode-database-extension/package.json`

**cms 系の更新:**
```bash
# 各 package.json の version を手動で更新
# cms-core, mcp-cms の2つを同一バージョンに統一
```

更新後、以下のファイルでバージョンが統一されていることを確認:
- `packages/cms-core/package.json`
- `packages/mcp-cms/package.json`

**sheet 系の更新:**
```bash
# spreadsheet-core, spreadsheet-viewer, vscode-sheet-extension の3つを同一バージョンに統一
```

**単独系統の更新（各 package.json の version を手動で更新）:**
- **agent 系**: `packages/vscode-agent-extension/package.json`
- **history 系**: `packages/vscode-history-extension/package.json`
- **cms-remote 系**: `packages/mcp-cms-remote/package.json`
- **web-app 系**: `packages/web-app/package.json`
- **extension pack 系**: `packages/vscode-extension-pack/package.json`

**注意**: 各系統のバージョンは独立している。`npm run version:sync` は使用禁止。すべて手動更新する。

### Step 3: CHANGELOG 更新

リリース対象に応じて CHANGELOG を更新する。**各パッケージには** `CHANGELOG.md`**（英語）と** `CHANGELOG.ja.md`**（日本語）の2ファイルが存在する。両方を同時に更新すること。** 形式は [Keep a Changelog](https://keepachangelog.com/)。

- `CHANGELOG.md`: 英語版（セクションヘッダー: Added / Changed / Fixed / Removed / Security）
- `CHANGELOG.ja.md`: 日本語版（セクションヘッダー: 追加 / 変更 / 修正 / 削除 / セキュリティ）

```markdown
## [x.y.z] - YYYY-MM-DD

### Added
- 新機能

### Changed
- 変更

### Fixed
- バグ修正
```

develop ブランチの最新コミットログを参照してエントリ内容を作成する。ユーザーに内容を確認してもらう。

**各モジュールの CHANGELOG 記載ルール:**

各パッケージの CHANGELOG にはそのパッケージ固有の変更のみを記載する。共通機能は担当パッケージに記載し、重複記載しない。

| CHANGELOG | 記載する内容 | 記載しない内容 |
| --- | --- | --- |
| `packages/markdown-viewer/CHANGELOG.md` | エディタコア機能（Tiptap、コンポーネント、拡張機能、スタイル、セキュリティ）。`markdown-rich` 固有変更も含む | VS Code 固有、web-app 固有、CI/CD。`markdown-core`（vendored tiptap）は CHANGELOG なし |
| `packages/vscode-markdown-extension/CHANGELOG.md` | VS Code 拡張固有（Custom Editor、treeview、webview、activationEvents、ステータスバー移行等）+ `### Editor Core (markdown-viewer / markdown-rich)` セクションにエディタコア更新の要約 | web-app 固有、CI/CD、git treeview、graph editor |
| `packages/web-app/CHANGELOG.md` | web-app 固有（ランディングページ、CMS、/docs、C4 Viewer、Next.js、SEO、Auth.js、PWA、Dockerfile）+ CI/CD（GitHub Actions、SonarCloud、e2e テスト） | VS Code 固有、エディタコア |
| `packages/graph-core/CHANGELOG.md` | グラフエンジンコア（ノード、エッジ、キャンバス、レイアウト、エクスポート、アクセシビリティ） | VS Code 固有 |
| `packages/vscode-graph-extension/CHANGELOG.md` | VS Code Graph 拡張固有（Custom Editor、テーマ、設定パネル）+ `### Graph Core (graph-core)` セクションに graph-core 更新の要約 | graph-core 詳細 |
| `packages/trail-viewer/CHANGELOG.md` | Trail / C4 ビューア UI コンポーネント（ツリー、グラフ、DSM、ツールバー、C4/C5 レベル） | VS Code 固有、サーバー固有 |
| `packages/trail-core/CHANGELOG.md` | Trail コア機能（タイムライン、アクティビティ追跡、C4 グラフフィルタ） | VS Code 固有 |
| `packages/vscode-trail-extension/CHANGELOG.md` | VS Code Trail 拡張固有 + `### Trail Core (trail-core / trail-server / trail-viewer)` セクションにコア・サーバー・ビューア更新の要約 | 各コア詳細 |
| `packages/database-core/CHANGELOG.md` | データベースアダプタ層（`DatabaseAdapter`, `SqlJsAdapter`, `BetterSqlite3Adapter`, `PaginatedSqlSheetAdapter`, FK 推定、識別子バリデーション） | VS Code 固有、UI 固有 |
| `packages/database-viewer/CHANGELOG.md` | データベース UI コンポーネント（`DatabaseEditor`, `ErdView`, `TableTree`, `ResultGrid`, `SqlEditorPanel`） | VS Code 固有、コア詳細 |
| `packages/vscode-database-extension/CHANGELOG.md` | VS Code Database 拡張固有（Custom Editor、Activity Bar パネル、l10n、per-platform VSIX）+ `### Database Core (database-core / database-viewer)` セクションに更新の要約 | コア詳細、UI 詳細 |
| `packages/cms-core/CHANGELOG.md` | CMS コア機能（S3 操作、ドキュメント管理、レポート管理） | web-app 固有、VS Code 固有 |
| `packages/mcp-cms/CHANGELOG.md` | MCP CMS サーバー固有（MCP ツール定義、サーバー設定） | CMS コア詳細 |
| `packages/mcp-cms-remote/CHANGELOG.md` | CMS Remote サーバー固有（Cloudflare Workers、リモート MCP） | CMS コア詳細 |
| `packages/vscode-extension-pack/CHANGELOG.md` | パック構成の変更（含まれる拡張機能の追加/削除） | 個別拡張機能の詳細 |

**VS Code 拡張での core パッケージ要約の書き方:**

VS Code 拡張の CHANGELOG には、各バージョンにコアパッケージの更新要約セクションを設ける。日本語で簡潔に要約する（1エントリ1行、主要機能のみ）。詳細は各 core パッケージの CHANGELOG を参照。

- `vscode-markdown-extension` → `### Editor Core (markdown-core)` セクション
- `vscode-graph-extension` → `### Graph Core (graph-core)` セクション
- `vscode-trail-extension` → `### Trail Core (trail-core)` セクション
- `vscode-database-extension` → `### Database Core (database-core / database-viewer)` セクション

```markdown
## [x.y.z] - YYYY-MM-DD

### Added
- VS Code 拡張固有の変更

### Editor Core (markdown-core)
- エディタコアの主要な変更の要約
```

```markdown
## [x.y.z] - YYYY-MM-DD

### Added
- VS Code Graph 拡張固有の変更

### Graph Core (graph-core)
- グラフコアの主要な変更の要約
```

### Step 4: セキュリティ監査

```bash
npm audit
```

critical / high の脆弱性がある場合は、該当パッケージを更新してから次のステップに進むこと（PR 作成前の必須ゲート）。更新時は型チェック・テストで互換性を確認する。

**失敗時**: 脆弱性パッケージの更新後は Step 5 のテスト・ビルド検証を再実行して互換性を確認。更新で破壊的変更が入る場合はユーザーに判断を仰ぐ。

### Step 5: テスト・ビルド検証

**ワークスペースごとに個別実行する。**`npm test --workspaces` **は使用しない。** 1コマンドで全ワークスペースを流すと、失敗箇所の特定が困難になり、途中停止で後続テストが未実行になるため。

```bash
# 5-1: 型チェック・lint
npx tsc --noEmit
npm run lint  # 注: root の lint 実体は `eslint packages/markdown-viewer/src packages/web-app/src` のみ。graph 系・trail 系・database 系等は lint 対象外

# 5-2: ユニットテスト（ワークスペースごとに個別実行）
cd packages/markdown-core && npx jest --coverage --maxWorkers=1
cd packages/mcp-markdown && npx jest --coverage --maxWorkers=1
cd packages/graph-core && npx jest --coverage --maxWorkers=1
cd packages/mcp-graph && npx jest --coverage --maxWorkers=1
cd packages/trail-core && npx jest --coverage --passWithNoTests --maxWorkers=1
cd packages/database-core && npx jest --coverage --maxWorkers=1
cd packages/database-viewer && npx jest --coverage --maxWorkers=1
cd packages/cms-core && npx jest --coverage --maxWorkers=1
cd packages/mcp-cms && npx jest --passWithNoTests --maxWorkers=1
cd packages/mcp-cms-remote && npx jest --coverage --passWithNoTests --maxWorkers=1
cd packages/web-app && npx jest --coverage --passWithNoTests --maxWorkers=1

# 5-3: E2E・カバレッジ・ビルド
cd packages/web-app && E2E_COVERAGE=1 npx playwright test --project=chromium
cd packages/web-app && npx next build
cd packages/vscode-markdown-extension && npx webpack --mode production
cd packages/vscode-graph-extension && npx webpack --mode production
cd packages/vscode-trail-extension && npx webpack --mode production
cd packages/vscode-database-extension && npx webpack --mode production
```

**各コマンドの結果を個別に確認し、全て通過してから次のステップに進む。** graph 系のみのリリースでも全テスト・全ビルドを実行する（依存関係の影響を検出するため）。

- **lint エラー**がある場合は修正してから次のステップに進むこと（CI の `npm run lint` と同じチェック）。root の lint 実体は `eslint packages/markdown-viewer/src packages/web-app/src` のみで、graph 系・trail 系・database 系等は lint 対象外。
- **e2e テスト**が失敗した場合は修正してから次のステップに進むこと（PR 作成前の必須ゲート）。
- **E2E カバレッジ**: `e2e:coverage` は Chromium のみで実行し、`coverage/coverage-final.json`（Istanbul 形式）を出力する。出力されたカバレッジファイルのファイル数をコンソールで確認する（`E2E coverage: N files →` のログ）。C4 モデルビューアでカバレッジを読み込み、対象ファイルのカバレッジ状況を視覚的に確認する。
- `next build` が失敗した場合は修正してから次のステップに進むこと（Netlify デプロイと同じビルドコマンド）。
- e2e テストは Playwright + Chromium で実行される（dev サーバーが自動起動する）。
- vscode-markdown-extension の `vscode-test` はコンテナ環境でネットワークエラーになる場合があるため無視してよい。

**失敗時**:
- `tsc --noEmit` 失敗 → 型エラーを修正してから再実行。
- `npm run lint` 失敗 → lint エラーを修正してから再実行。CI と同じ ESLint ルールが適用される。**lint 修正後は必ず** `npx tsc --noEmit` **と全ユニットテストを再実行すること。** lint の autofix や手動修正で型エラーやテスト失敗が発生する場合がある。
- ユニットテスト失敗 → 失敗テストのエラーメッセージを確認し、原因を特定して修正。「既存の問題」としてスキップしない。**どのワークスペースが失敗したかを明確に記録する。**
- `e2e:coverage` 失敗 → スクリーンショットやトレースを確認し、UI変更による期待値のずれか実際のバグかを切り分ける。カバレッジが出力されない場合は `.v8-coverage/` の生成状況と dev サーバーのソースマップ提供を確認する。
- `next build` 失敗 → Netlify デプロイで同じエラーが発生する。依存パッケージのバージョン不整合が主な原因。`npm ls <package>` で重複バージョンを確認し、`overrides` で統一する。
- `webpack` 失敗 → ビルドログの最初のエラーから対処。依存関係の問題なら `npm ci` を再実行。

### Step 6: VSIX パッケージ作成

リリース対象に応じて VSIX を生成する:

**markdown 系:**
```bash
cd packages/vscode-markdown-extension
npx vsce package --no-dependencies
```
`anytime-markdown-<version>.vsix` が生成されることを確認する。

**graph 系:**
```bash
cd packages/vscode-graph-extension
npx vsce package --no-dependencies
```
`anytime-graph-<version>.vsix` が生成されることを確認する。

**trail 系（per-platform、4 VSIX）:**

`anytime-trail` は `better-sqlite3` のネイティブバイナリを含むため per-platform 配布が必要。
`ci.yml` の `build-trail` matrix が develop / master push 時に 4 プラットフォーム
（linux/win32 × x64/arm64。darwin なし）の VSIX を自動生成する。

ローカル検証では単一プラットフォーム（実行環境）の VSIX のみ生成する:

```bash
cd packages/vscode-trail-extension
npx vsce package --no-dependencies
```
`anytime-trail-<version>.vsix` が生成されることを確認する。\
本番リリース時の per-platform VSIX 4 種は CI で自動生成・自動公開される。

**database 系（per-platform、4 VSIX）:**

`anytime-database` も `better-sqlite3` を含むため per-platform 配布が必要。
`ci.yml` の `build-database` matrix が develop / master push 時に 4 プラットフォーム
（linux/win32 × x64/arm64。darwin なし）の VSIX を自動生成する。

ローカル検証では単一プラットフォーム（実行環境）の VSIX のみ生成する:

```bash
cd packages/vscode-database-extension
npx @vscode/vsce package --no-dependencies
```

`anytime-database-<version>.vsix` が生成されることを確認する。\
本番リリース時の per-platform VSIX 4 種は CI で自動生成・自動公開される。

**sheet 系:**
```bash
cd packages/vscode-sheet-extension
npx vsce package --no-dependencies
```
`anytime-sheet-<version>.vsix` が生成されることを確認する。

**agent 系:**
```bash
cd packages/vscode-agent-extension
npx vsce package --no-dependencies
```
`anytime-agent-<version>.vsix` が生成されることを確認する。

**history 系:**
```bash
cd packages/vscode-history-extension
npx vsce package --no-dependencies
```
`anytime-history-<version>.vsix` が生成されることを確認する。

**extension pack 系:**
```bash
cd packages/vscode-extension-pack
npx vsce package
```
`anytime-extension-pack-<version>.vsix` が生成されることを確認する。

### Step 7: ローカルテスト

リリース対象の VSIX を自動インストールしてから、ユーザーに動作確認を依頼する。

```bash
# リリース対象の拡張機能を自動インストール（対象系統のみ実行）

# markdown 系
code --install-extension packages/vscode-markdown-extension/anytime-markdown-<version>.vsix

# graph 系
code --install-extension packages/vscode-graph-extension/anytime-graph-<version>.vsix

# trail 系
code --install-extension packages/vscode-trail-extension/anytime-trail-<version>.vsix

# database 系（ローカル単一プラットフォーム）
code --install-extension packages/vscode-database-extension/anytime-database-<version>.vsix

# extension pack 系
code --install-extension packages/vscode-extension-pack/anytime-extension-pack-<version>.vsix
```

### Step 8: コミット・push

本番リリース依頼を受けている状態のため、通常の push 操作時にユーザー確認は挟まない。リリース依頼自体が push の承認にあたる。

```bash
git add -A
git commit -m "release: v<version>"
git push origin develop
```

**失敗時**: push が rejected された場合は `git pull --rebase origin develop` で最新を取り込んでから再 push。コンフリクトが発生した場合はユーザーに確認。

### Step 8.5: CI 検証ゲート

push 後に GitHub Actions（CI / Publish VS Code Extension ワークフローの `ci` ジョブ）の完了を待つ。

develop push の CI は高速フィードバック用で、以下のみ実行される:
- 型チェック・lint

ユニットテスト・e2e・ビルド・VSIX 作成・audit は master PR で実行されるため、develop push では省略される。Step 5 でローカル実行済みのため、CI での再実行は不要。

- CI が全通過 → Step 9 へ進む
- CI が失敗 → 原因を修正し、**Step 5 に戻って全検証を再実行**する

**注意**: 修正の規模に関わらず、コード変更後は必ず Step 5 からやり直すこと。「軽微な修正だから lint だけ」という例外は認めない。

### ループバックルール

**Step 5 通過後、Step 9（PR マージ）までの間にコード修正が発生した場合は、修正規模に関わらず必ず Step 5 に戻って全検証を再実行する。** rebase や force push が発生した場合も同様。

### Step 9: PR 作成・マージ

develop → master の PR を作成してマージする。

```bash
gh pr create --base master --head develop --title "release: v<version>" --body "v<version> リリース"
```

**失敗時**: マージコンフリクトが発生した場合は、develop 上で `git merge master` してコンフリクトを解決 → 再 push → PR を再作成。

master PR の CI は品質ゲートとして全項目を実行する:
- 依存チェック・audit・型チェック・lint
- 全ユニットテスト
- web-app ビルド + バンドルレポート
- 拡張機能ビルド・VSIX 作成
- e2e テスト（3ブラウザ）

master PR の CI が全通過したらマージする。

master へのマージ後、GitHub Actions が自動で以下を実行する（markdown 系・graph 系・trail 系・database 系・sheet 系・agent 系・history 系・extension pack 系それぞれ独立した publish ジョブ）:
- `ci.yml` の CI ジョブで拡張機能ビルド・VSIX を作成（テスト等は master push ではスキップ）
- trail 系・database 系は `ci.yml` の `build-trail` / `build-database` matrix が per-platform で各 4 VSIX を生成し、続けて publish-trail / publish-database ジョブを実行
- Marketplace に公開（バージョンが変わっていない系統はタグが既存のためスキップ）
- git タグを自動作成・push（markdown 系: `v<version>`、graph 系: `graph-v<version>`、trail 系: `trail-v<version>`、database 系: `database-v<version>`、sheet 系: `sheet-v<version>`、agent 系: `agent-v<version>`、history 系: `history-v<version>`、extension pack 系: `pack-v<version>`）
- GitHub Release を自動作成（VSIX 添付 + リリースノート自動生成）

### Step 10: 公開確認

GitHub Actions の実行結果を確認する:
- `gh run list --repo anytime-trial/anytime-markdown --branch master --limit 1` で成功を確認
- 失敗した場合はログを確認して対処

**失敗時**: Actions が失敗した場合は `gh run view --log-failed` でエラーログを確認。VSCE_PAT の期限切れが多い。手動公開で対応する:

**手動公開が必要な場合:**

**A. CLI で公開:**
```bash
# markdown 系
cd packages/vscode-markdown-extension
npx vsce publish --no-dependencies --pat <token>

# graph 系
cd packages/vscode-graph-extension
npx vsce publish --no-dependencies --pat <token>

# trail 系（per-platform、4 VSIX を一括 publish）
cd packages/vscode-trail-extension
# 事前に ci.yml の build-trail artifact から 4 VSIX をダウンロードしておくこと
npx @vscode/vsce publish --packagePath \
  anytime-trail-linux-x64.vsix \
  anytime-trail-linux-arm64.vsix \
  anytime-trail-win32-x64.vsix \
  anytime-trail-win32-arm64.vsix \
  --pat <token>

# database 系（per-platform、4 VSIX を一括 publish）
cd packages/vscode-database-extension
# 事前に ci.yml の build-database artifact から 4 VSIX をダウンロードしておくこと
npx @vscode/vsce publish --packagePath \
  anytime-database-linux-x64.vsix \
  anytime-database-linux-arm64.vsix \
  anytime-database-win32-x64.vsix \
  anytime-database-win32-arm64.vsix \
  --pat <token>

# sheet / agent / history 系
cd packages/vscode-sheet-extension && npx vsce publish --no-dependencies --pat <token>
cd packages/vscode-agent-extension && npx vsce publish --no-dependencies --pat <token>
cd packages/vscode-history-extension && npx vsce publish --no-dependencies --pat <token>

# extension pack 系
cd packages/vscode-extension-pack
npx vsce publish --pat <token>
```

**B. 手動アップロード:**
1. [Publisher 管理ページ](https://marketplace.visualstudio.com/manage) にアクセス
2. New Extension → Visual Studio Code → `.vsix` ファイルをアップロード

publisher: `anytime-trial`

### master ビルド失敗時のロールバック手順

master の CI または publish が失敗し、Marketplace に公開されていない場合:

1. 失敗原因を特定（`gh run view --log-failed`）

2. develop で修正 → Step 5 からやり直し

3. 修正後、再度 develop → master PR を作成・マージ

4. 同一バージョンのタグが既存の場合は自動スキップされるため、タグを削除してから再マージ:

   ```bash
   # markdown 系
   git push origin --delete v<version>
   git tag -d v<version>
   # graph 系
   git push origin --delete graph-v<version>
   git tag -d graph-v<version>
   # trail 系
   git push origin --delete trail-v<version>
   git tag -d trail-v<version>
   # database 系
   git push origin --delete database-v<version>
   git tag -d database-v<version>
   ```

Marketplace に公開済みで問題が発覚した場合:
1. develop で修正 → パッチバージョンを上げて再リリース（revert より前進を優先）
2. 緊急時は Marketplace の管理画面から該当バージョンを非公開にできる

## 完了確認

```plaintext
[ ] develop ブランチが最新
[ ] バージョンが各系統内で統一（リリース対象の系統）
[ ] CHANGELOG 更新済み（リリース対象の系統）
[ ] npm audit で critical/high 脆弱性なし
[ ] tsc --noEmit 通過
[ ] npm run lint 通過
[ ] npm test 全ユニットテスト通過（markdown-core）
[ ] npm test 全ユニットテスト通過（mcp-markdown）
[ ] npm test 全ユニットテスト通過（graph-core）
[ ] npm test 全ユニットテスト通過（mcp-graph）
[ ] npm test 全ユニットテスト通過（trail-core）
[ ] npm test 全ユニットテスト通過（database-core）
[ ] npm test 全ユニットテスト通過（database-viewer）
[ ] npm test 全ユニットテスト通過（cms-core）
[ ] npm test 全ユニットテスト通過（mcp-cms）
[ ] npm test 全ユニットテスト通過（mcp-cms-remote）
[ ] npm test 全ユニットテスト通過（web-app）
[ ] e2e テスト通過（packages/web-app）
[ ] E2E カバレッジ出力確認（coverage/coverage-final.json）
[ ] next build 通過（packages/web-app）
[ ] webpack ビルド通過（packages/vscode-markdown-extension）
[ ] webpack ビルド通過（packages/vscode-graph-extension）
[ ] webpack ビルド通過（packages/vscode-trail-extension）
[ ] webpack ビルド通過（packages/vscode-database-extension）
[ ] VSIX 生成済み（リリース対象の拡張機能・extension pack。trail 系・database 系は ci.yml の build-trail / build-database で各 4 VSIX を CI 生成）
[ ] ローカルテスト完了
[ ] コミット・push 済み
[ ] CI 検証ゲート通過（GitHub Actions の ci ジョブが全通過）
[ ] develop → master PR マージ済み
[ ] GitHub Actions 成功（タグ自動作成・公開完了）
```

## GitHub Actions 自動公開

ワークフロー: `.github/workflows/ci.yml`（per-platform ビルドを含め一本化済み）

- **トリガー**: master ブランチへの push（PR マージ時）
- **処理**:
  - `ci.yml`: CI ジョブ（テスト + ビルド + 拡張機能の VSIX 作成）→ publish-markdown / publish-graph / publish-history / publish-trail / publish-sheet / publish-agent / publish-database / publish-extension-pack ジョブ（並行実行、各 CI の VSIX を取得 → vsce publish → タグ作成 → GitHub Release 作成）
  - per-platform 系（trail / database）: `build-trail` / `build-database` matrix（4 プラットフォーム = linux/win32 × x64/arm64、darwin なし）が各 4 VSIX を生成 → publish-trail / publish-database ジョブが一括 publish → タグ作成 → GitHub Release 作成
- **スキップ条件**: 同一バージョンのタグが既に存在する場合はスキップ（markdown 系: `v<version>`、graph 系: `graph-v<version>`、history 系: `history-v<version>`、trail 系: `trail-v<version>`、sheet 系: `sheet-v<version>`、agent 系: `agent-v<version>`、database 系: `database-v<version>`、extension pack 系: `pack-v<version>`）
- **必要な Secret**: `VSCE_PAT`（Azure DevOps Personal Access Token、全拡張機能で共有）

### VSCE_PAT の設定手順

1. [Azure DevOps](https://dev.azure.com/) にアクセス
2. User Settings → Personal Access Tokens → New Token
3. Organization: `All accessible organizations`、Scopes: `Marketplace > Manage`
4. トークンをコピー
5. GitHub リポジトリ → Settings → Secrets and variables → Actions → New repository secret
6. Name: `VSCE_PAT`、Value: コピーしたトークン

## 備考

- `packages/vscode-markdown-extension/.vscodeignore` でパッケージに含めないファイルを制御
- VSIX のみ作成してローカル配布する場合は Step 7 のタグ push をスキップ可
- hotfix の場合は main ブランチから作業し、main と develop の両方にマージする
