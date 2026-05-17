---
title: "コード品質評価"
date: "{{today}}"
updated: "{{today}}"
type: "spec"
lang: "ja"
author: "Claude Code v{{cliVersion}}"
category: "basic-design/quality"
c4Scope:
    - "{{systemId}}"
excerpt: "{{repoName}} のテスト構成・Lint / CI/CD 構成・技術的負債・観測されたパターン / アンチパターン。"
---


# コード品質評価

<!--
ガイダンス: 本章は aidlc-workflows reverse-engineering の code-quality-assessment.md に相当する。
- 「良い / 悪い」の主観評価は書かない。観測された数値・設定の存在のみを淡々と記述
- すべてのカウント値は集計コマンド（grep / find）で再現可能な形にする
- 「技術的負債」は TODO/FIXME/HACK コメント等の客観的指標のみ。設計判断の批評は避ける
-->


## 1. テスト構成

<!--
ガイダンス: テストフレームワークの存在を検出して列挙する。
検出元:
- jest.config.* / vitest.config.* / vite.config.ts (test 設定) / playwright.config.* / cypress.config.*
- pytest.ini / pyproject.toml [tool.pytest] / tox.ini
- Cargo.toml (test target は標準なので省略可) / go.mod （標準 go test）
- package.json scripts: test / test:e2e / test:unit
-->

| 用途 | フレームワーク | 設定ファイル | 検出スクリプト |
| --- | --- | --- | --- |
| {{ユニットテスト}} | {{Jest / Vitest 等}} | `{{path}}` | `{{npm script}}` |
| {{結合テスト}} | {{Playwright / Cypress 等}} | `{{path}}` | `{{npm script}}` |


### 1.1 テストファイル件数

<!--
ガイダンス: 検出ロジック例:
- find . -name '*.test.ts' -o -name '*.spec.ts' -o -name '*.test.tsx' -o -name '*.spec.tsx' | wc -l
- find . -path '*/__tests__/*' -name '*.ts' | wc -l
パッケージ別の件数も表で（fanIn 上位 10 パッケージのみ）
-->

| パッケージ | テストファイル数 | テスト種別の内訳 |
| --- | ---: | --- |
| `{{pkg-name}}` | {{N}} | {{unit: A, e2e: B}} |


## 2. テストカバレッジ

<!--
ガイダンス: カバレッジレポートが標準位置に存在すれば数値を引く。不能なら「未計測」と記す。
検出元:
- coverage/coverage-summary.json (Istanbul / Jest)
- coverage/lcov.info (汎用 lcov)
- .coverage / htmlcov/index.html (Python coverage.py)
- target/site/jacoco/jacoco.csv (JaCoCo)
NG: 推測でパーセンテージを書く
-->

| 指標 | 値 | 計測元 |
| --- | --- | --- |
| ライン | {{N%}} or 未計測 | `{{path}}` |
| 関数 | {{N%}} or 未計測 | `{{path}}` |
| ブランチ | {{N%}} or 未計測 | `{{path}}` |


## 3. Lint / Format 構成

<!--
ガイダンス: 静的解析・コード整形ツールの設定ファイルを検出して列挙する。
検出元:
- .eslintrc* / eslint.config.* / package.json [eslintConfig]
- biome.json / .biomeignore
- .prettierrc* / prettier.config.*
- pyproject.toml [tool.ruff] / [tool.black] / [tool.mypy]
- rustfmt.toml / .editorconfig
-->

| 種別 | ツール | 設定ファイル | 適用範囲 |
| --- | --- | --- | --- |
| Lint | {{ESLint / Biome / Ruff 等}} | `{{path}}` | {{src / packages/* 等}} |
| Format | {{Prettier / Biome / black 等}} | `{{path}}` | {{適用範囲}} |
| 型チェック | {{tsc / mypy 等}} | `{{path}}` | {{適用範囲}} |


## 4. CI/CD 構成

<!--
ガイダンス: CI 設定ファイルを検出して、ワークフロー名・トリガー・主要ジョブを表に展開する。
検出元:
- .github/workflows/*.yml
- .gitlab-ci.yml
- .circleci/config.yml
- bitbucket-pipelines.yml
- Jenkinsfile
-->

| プラットフォーム | ワークフロー | トリガー | 主要ジョブ |
| --- | --- | --- | --- |
| {{GitHub Actions 等}} | `{{workflow file}}` | {{push / pull_request 等}} | {{build / test / deploy}} |


### 4.1 観測される CI/CD フロー

<!--
ガイダンス: 検出された CI 設定から主要ジョブの依存関係を flowchart で描く。
- ノード = ジョブ、エッジ = needs / depends_on の関係
- トリガーは entry point として [*] から伸ばす
- ノード数 10 超なら主要パスのみ
-->

```mermaid
flowchart LR
    {{trigger}} --> {{job 1}} --> {{job 2}} --> {{deploy}}
```


## 5. 技術的負債（TODO / FIXME / HACK）

<!--
ガイダンス: コメント内の TODO / FIXME / HACK / XXX の件数を Grep で集計する。
コマンド例:
- grep -rn -E '(TODO|FIXME|HACK|XXX)[: ]' --include='*.ts' --include='*.tsx' . | wc -l
ファイル別の上位 20 件を表に展開
-->

### 5.1 集計サマリ

| ラベル | 件数 |
| --- | ---: |
| TODO | {{N}} |
| FIXME | {{N}} |
| HACK | {{N}} |
| XXX | {{N}} |


### 5.2 ファイル別 top 20

| ファイル | TODO | FIXME | HACK | XXX |
| --- | ---: | ---: | ---: | ---: |
| `{{path}}` | {{N}} | {{N}} | {{N}} | {{N}} |


## 6. 観測されたパターン / アンチパターン

<!--
ガイダンス: 静的解析で抽出可能な定量指標のみ列挙する。Pass / Fail 判定はしない。
検出例:
- TypeScript any 型: grep -rn ': any' --include='*.ts' --include='*.tsx' . | wc -l
- console.log: grep -rn 'console\.\(log\|debug\|warn\|error\)' --include='*.ts' --include='*.tsx' . | wc -l
- 非ヌルアサーション !.: grep -rn '!\.' --include='*.ts' . | wc -l
- silent catch: grep -rn 'catch\s*{' --include='*.ts' . | wc -l
- ハードコード色: grep -rnE "'#[0-9a-fA-F]{3,8}'" --include='*.ts' --include='*.tsx' . | wc -l
- マジックナンバー: 自動検出困難なため省略可
NG: 「悪い」「良くない」等の評価語 / 検出できない事項を推測で書く
-->

| 指標 | 件数 | 集計コマンド |
| --- | ---: | --- |
| `any` 型出現 | {{N}} | `{{コマンド}}` |
| `console.*` 呼び出し | {{N}} | `{{コマンド}}` |
| 非ヌルアサーション `!.` | {{N}} | `{{コマンド}}` |
| silent catch | {{N}} | `{{コマンド}}` |
| ハードコード色値 | {{N}} | `{{コマンド}}` |


## 7. 既知の制約

<!--
ガイダンス: 本章の自動生成上の制約を列挙する。
- カバレッジレポートが標準位置にない場合「未計測」表示
- TODO/FIXME の文脈は出力しない（行番号のみ）
- ライセンス情報は package.json `license` フィールドに依存
- 言語別の静的解析指標（Python 用の `any` 相当等）は現状未対応
-->

- {{制約 1}}
- {{制約 2}}
