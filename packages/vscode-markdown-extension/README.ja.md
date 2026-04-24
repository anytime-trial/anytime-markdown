# Anytime Markdown Editor

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/anytime-trial.anytime-markdown?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=alert_status)![Bugs](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=bugs)![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=code_smells)![Coverage](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=coverage)![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=anytime-trial_anytime-markdown&metric=duplicated_lines_density)

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


## 2. はじめかた

`.md` / `.markdown` ファイルを右クリックし、「Open with Anytime Markdown」を選択すると表示されます。

エクスプローラのコンテキストメニューまたはエディタタイトルバーのコンテキストメニューから開けます。


## 3. AI が編集中はエディタを自動ロック（Claude Code 協調編集）

Claude Code がファイルを編集している間、エディタを読み取り専用にして競合を防ぎます。\
編集が終わると自動的にロック解除され、最新の内容に更新されます。

- [**Anytime Trail**](https://marketplace.visualstudio.com/items?itemName=anytime-trial.anytime-trail) **が必要** — Trail 拡張が Claude Code のフックを登録し、本拡張がステータスを読み取ってロックを制御
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


## 6. ショートカット

| キー | 動作 |
| --- | --- |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Markdown として貼り付け |


## 7. 設定

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | フォントサイズ（px）。0 = VS Code デフォルト |
| `anytimeMarkdown.editorMaxWidth` | `0` | エディタの最大幅（px）。0 = 制限なし |
| `anytimeMarkdown.language` | `auto` | エディタ UI の表示言語（auto / en / ja） |
| `anytimeMarkdown.themeMode` | `auto` | カラーモード（auto / light / dark） |
| `anytimeMarkdown.themePreset` | `handwritten` | テーマスタイル（handwritten / professional） |
| `anytimeMarkdown.storagePath` | `""` | 中間ファイルの保存パス（空 = VS Code ストレージ領域） |


## 8. ライセンス

MIT
