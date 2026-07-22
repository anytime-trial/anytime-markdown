# Anytime Markdown Editor

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

[日本語](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-markdown-extension/README.ja.md) | [English](https://github.com/anytime-trial/anytime-markdown/blob/master/packages/vscode-markdown-extension/README.md)

**AI が書いた Markdown を、コーディングしながらリッチにプレビュー — VS Code だけで完結。**

AI アシスタントは仕様書や設計書を Markdown で書いてくれますが、プレーンテキストでのレビューは読みにくく、外部ツールとの行き来で集中が途切れがちです。

Anytime Markdown なら、WYSIWYG エディタで Markdown をリッチに表示・編集でき、**AI との協調編集機能**でファイルの競合も防げます。


[**オンラインエディタで試す**](https://www.anytime-trial.com/markdown)

![Anytime Markdown Editor の画面](images/markdown-editor-screen.png)


## 1. できること

- **Markdown をリッチに表示・編集** — テーブル・Mermaid・PlantUML・KaTeX をそのまま表示
- **AI の編集中はエディタが自動ロック** — Claude Code がファイルを書き換えている間、誤操作を防止
- **AI 更新箇所をガターでハイライト** — Claude Code が編集した箇所をガターにマーカーを表示して視覚的に通知
- **3つのモードをワンクリック切り替え** — WYSIWYG・ソース・レビュー
- **ドキュメント検索とノート網** — ドキュメントリポジトリ全体を横断検索し、文書同士のつながりをグラフで表示
- **履歴とコミット比較** — Timeline ビューから過去のコミット時点の内容と差分比較


## 2. はじめかた

`.md` / `.markdown` ファイルを右クリックし、「Open with Anytime Markdown」を選択すると表示されます。

エクスプローラのコンテキストメニューまたはエディタタイトルバーのコンテキストメニューから開けます。


## 3. AI が編集中はエディタを自動ロック（Claude Code 協調編集）

Claude Code がファイルを編集している間、エディタを読み取り専用にして競合を防ぎます。\
編集が終わると自動的にロック解除され、最新の内容に更新されます。

- [**Anytime Agent**](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-agent) **が必要** — Agent 拡張が Claude Code のフックを登録し、本拡張がステータスを読み取ってロックを制御
- **連続編集に対応** — 最後の編集から 3 秒後にまとめてロック解除
- **クラッシュ対策** — 30 秒後にタイムアウトで自動解除


## 4. AI 更新箇所のハイライト確認

Claude Code がファイルを編集して自動再読み込みされた際、変更・追加されたブロックをエディタ左端のガターにマークして表示します。\
どこが書き換わったかを一目で確認でき、確認後は `Escape` キーでマーカーをクリアできます。

- **追加・変更ブロック** — ガターに変更マーカーを表示
- **削除箇所** — 削除が発生した位置に削除インジケータを表示
- **自動再読み込みが有効な場合のみ動作**


## 5. エディタモード

| モード | 内容 |
| --- | --- |
| **WYSIWYG** | 書式・ダイアグラム・テーブル付きのビジュアル編集 |
| **ソース** | 生の Markdown を直接編集 |
| **レビュー** | 読み取り専用。AI 出力のレビューに最適 |

ツールバーのモードメニューから切り替え。


## 6. ドキュメント検索とノート網

`anytimeMarkdown.docsRoot` にドキュメントリポジトリのルートを設定すると、リポジトリ全体を索引してエディタから横断検索できます。

- **全文検索** — 索引は `doc-core.db` に保存され、`anytimeMarkdown.docSearch.intervalMinutes`（既定 30 分）ごとに自動更新。手動更新はコマンドパレットの `Anytime Markdown: ドキュメント検索インデックスを再構築`
- **ノート網** — フロントマターの `related` ・ `tags` ・ `c4Scope` と本文中の `.md` リンクから文書同士の関係グラフを構築し、サイドツールバーに表示。関連文書をたどって設計書間を移動できる
- `docsRoot` が空の場合、索引は無効になり、ノート網は現在のドキュメントが属する git リポジトリにフォールバックします


## 7. 履歴とコミット比較

Markdown ファイルを開くと、**Anytime Markdown** サイドバーの **Timeline** ビューにそのファイルのコミット履歴が表示されます。\
コミットを右クリックして **このコミットと比較** を選ぶと、その時点の内容と現在の内容を差分表示できます。

エディタタイトルバーの **Compare with Anytime Markdown** からは、通常の差分ビューを Anytime Markdown の表示で開けます。


## 8. ショートカット

| キー | 動作 |
| --- | --- |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Markdown として貼り付け |


## 9. 同梱スキル

拡張は有効化時にワークスペースの `.claude/skills/` へ Claude Code スキルを配置します。\
配置し直す場合はコマンドパレットで `Anytime Markdown: Markdown スキルを再配置` を実行します。

| スキル | 用途 |
| --- | --- |
| `anytime-doc-authoring` | type（spec / tech / proposal 等）別に何を書くかと索引運用を定義する執筆ガイド |
| `anytime-markdown-output` | 構文・フロントマター・整形の出力規約 |
| `anytime-markdown-check` | 出力後の検証（自動整形できない意味判断の確認） |
| `anytime-markdown-usage` | `mcp-markdown` を使った低トークンな検索・調査・編集の手順 |
| `anytime-spec-lookup` | 索引から関連を辿って必要な設計書だけを読む手順 |
| `anytime-mermaid` | Mermaid 図の可読性ガイドライン |


## 10. 設定

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | エディタのフォントサイズ（px）。0 = VS Code デフォルト |
| `anytimeMarkdown.measure` | `standard` | 本文カラム幅（行長）（focus / standard / wide / full） |
| `anytimeMarkdown.language` | `auto` | エディタ UI の表示言語（auto / en / ja） |
| `anytimeMarkdown.themeMode` | `auto` | カラーモード（auto / light / dark） |
| `anytimeMarkdown.themePreset` | `handwritten` | テーマスタイル（handwritten / professional） |
| `anytimeMarkdown.docsRoot` | `""` | ドキュメントリポジトリのルート（絶対パス）。ドキュメント検索の索引とノート網パネルで使用（空 = 索引無効・git リポジトリにフォールバック） |
| `anytimeMarkdown.docSearch.dbPath` | `""` | ドキュメント検索 DB（doc-core.db）のパス（空 = `<workspace>/.anytime/markdown/doc-core.db`） |
| `anytimeMarkdown.docSearch.intervalMinutes` | `30` | 自動再索引の間隔（分）。0 = 定期再索引を無効化 |


## 11. ライセンス

MIT
