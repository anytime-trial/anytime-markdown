---
title: "コード構造"
date: "{{today}}"
updated: "{{today}}"
type: "spec"
lang: "ja"
author: "Claude Code v{{cliVersion}}"
category: "basic-design/code-structure"
c4Scope:
    - "{{systemId}}"
excerpt: "{{repoName}} のビルドシステム・モジュール階層・デザインパターン・主要ファイル・外部依存。"
---


# コード構造

<!--
ガイダンス: 本章は aidlc-workflows reverse-engineering の code-structure.md に相当する。
- 章 1 がコンテナ（パッケージ）粒度の構造、本章は「ビルド構成」「モジュール階層」「パターン」「ファイル」「外部依存」のレイヤー横断視点
- すべて機械的検出可能な情報のみ。設計意図の推測は禁止
- パッケージ命名・ファイル数・fanIn 値はそのまま事実として記述
-->


## 1. ビルドシステム

<!--
ガイダンス: ルートおよび主要パッケージのビルドツールを検出して表に展開する。
検出元の優先順:
1. ルート package.json: `workspaces` フィールドがあれば npm workspaces / yarn workspaces / pnpm workspaces
2. ルート pyproject.toml: poetry / hatch / setuptools / uv
3. ルート Cargo.toml + `[workspace]`: cargo workspaces
4. pom.xml: Maven / Gradle build.gradle: Gradle
5. Makefile / Justfile / Taskfile: 任意のタスクランナー
-->

| 項目 | 検出値 |
| --- | --- |
| ビルドシステム種別 | {{npm workspaces / Maven / Cargo workspaces 等}} |
| バージョン | {{ツールバージョン}} |
| ルート設定ファイル | `{{path}}` |
| ワークスペース定義 | {{glob または明示パス}} |
| 主要スクリプト | {{build / test / lint 等を抜粋}} |


### 1.1 パッケージ別ビルド設定

| パッケージ | ビルドツール | 出力先 | 備考 |
| --- | --- | --- | --- |
| `{{pkg-name}}` | {{tsc / webpack / esbuild 等}} | `{{dist path}}` | {{備考}} |


## 2. 主要モジュール階層

<!--
ガイダンス: Trail DB current_code_graphs.graph_json の fanIn 上位ファイルをパッケージ別にグルーピングして flowchart で描画する。
- ノードはファイル（label = ファイル名）、パッケージは subgraph
- エッジは fanIn ≥ {{threshold}} の依存のみ表示
- ノード数 15 超なら fanIn 上位のみに絞る
- ファイル名は basename（ディレクトリ階層は表で別途記載）
-->

```mermaid
flowchart TB
    {{subgraph 定義（パッケージ別）}}
    {{ノード定義（fanIn 上位ファイル）}}
    {{エッジ定義（モジュール間依存）}}
```


## 3. デザインパターン

<!--
ガイダンス: 静的解析で検出可能なパターンのみ列挙する。
検出パターン例:
- Repository: `interface .*Repository` / `class .*Repository`
- Factory: `class .*Factory` / `create.*\(`
- Strategy: `interface .*Strategy` + 複数実装
- Observer / Event: `EventEmitter` / `addEventListener` / `on\(.*,` の集中点
- Singleton: `static getInstance` / `export const \w+ = new`
- Adapter: `class .*Adapter` / `*-adapter` パッケージ名
- Plugin: `register.*Plugin` / `interface .*Plugin`
NG: 検出できないパターンを「実装されているはず」で書く
-->

| パターン | 検出箇所 | 検出根拠 |
| --- | --- | --- |
| {{パターン名}} | `{{file:line}}` | {{マッチした構文断片}} |


## 4. 主要ファイル一覧（fanIn 上位）

<!--
ガイダンス: Trail DB の fanIn 上位 30 ファイルを表に展開する。
- パッケージ別にグルーピング（パッケージ列で sort）
- fanIn は数値そのまま、責務は 1 行（ファイル冒頭コメント / export 名から推測）
- 30 件超のリストは省略し「他 N 件」と末尾に記載
-->

| パッケージ | ファイル | fanIn | 責務（1 行） |
| --- | --- | ---: | --- |
| `{{pkg}}` | `{{path}}` | {{N}} | {{役割}} |


## 5. 主要依存（外部 npm / PyPI / crates パッケージ）

<!--
ガイダンス: ルート and 各パッケージの package.json の dependencies / devDependencies を集約。
- 同一パッケージが複数バージョンに分散している場合は版を併記
- ライセンスは package.json `license` フィールドから取得。`npx license-checker` が利用可能なら正確な値を取得（オプション）、不能なら空欄
- 用途は description から導出、不明なら「依存元: pkg-a, pkg-b」で代替
- 上位 30 件まで（dependencies 優先、devDependencies は build / test 用のみ）
-->

| パッケージ | バージョン | ライセンス | 用途 / 依存元 |
| --- | --- | --- | --- |
| `{{pkg-name}}` | `{{version}}` | {{MIT / Apache-2.0 等}} | {{purpose}} |


## 6. ディレクトリ規約

<!--
ガイダンス: モノレポ / 単一パッケージ問わず、検出されたディレクトリ構造の規約を箇条書きで列挙する。
- packages/ 配下の命名規則（*-core / *-viewer / *-extension / mcp-* など）
- src 配下の階層（components / hooks / lib / utils 等）
- テスト配置（__tests__ / *.test.ts / tests/ 配下 等）
- ドキュメント配置（docs/ / spec/ / 別リポジトリ）
NG: 規約として存在しないものを「あるべき」で書く
-->

- {{規約 1}}: {{検出されたパス例}}
- {{規約 2}}: {{検出されたパス例}}
