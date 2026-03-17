# Anytime Markdown Editor

![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/kiytaka-ueda.anytime-markdown?label=VS%20Marketplace&logo=visual-studio-code)![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)**AIが書いたドキュメントを、コーディングしながらレビュー — VS Code だけで完結。**

AIアシスタントは仕様書や設計書をMarkdownで書いてくれますが、プレーンテキストでのレビューは読みにくく、GitクライアントとエディタのVS Code との行き来で集中が途切れがちです。

Anytime Markdown なら、リッチエディタとGit機能が一体になっているので、**ドキュメント用のリポジトリをコードの隣で開いて**、すべてひとつのウィンドウで済ませられます。

## 1. できること

- **複数のドキュメントリポジトリ**をサイドバーでソースコードと並べて表示
- **AIの出力**をテーブル・ダイアグラム（Mermaid / PlantUML）・数式付きでプレビュー
- **バージョン比較**を差分ハイライト付きで横並び表示
- **コミット・プッシュ**をVS Code から直接実行
- **履歴追跡**をビジュアルなGitグラフとファイル単位のタイムラインで

## 2. 使い方の流れ

1. AIがMarkdownドキュメントを生成
2. **マークダウン管理**パネルでドキュメントリポジトリを開く
3. **WYSIWYG** または **レビュー** モードで内容を確認
4. 以前のバージョンと比較
5. 編集・コミット・プッシュ — 完了

## 3. エディタモード

| モード | 内容 |
| --- | --- |
| **WYSIWYG** | 書式・ダイアグラム・テーブル付きのビジュアル編集 |
| **ソース** | 生のMarkdownを直接編集 |
| **レビュー** | 読み取り専用。AI出力のレビューに最適 |

ツールバーのトグルまたは `Ctrl+Alt+S`（Macは `Cmd+Alt+S`）で切り替え。

## 4. サイドバーパネル

- **マークダウン管理** — 複数リポジトリ対応のファイルツリー、ブランチ切替、Markdownフィルター
- **変更** — ステージ・コミット・プッシュ（リポジトリごと）
- **グラフ** — ビジュアルなコミット履歴（青=ローカル、赤=リモート）
- **タイムライン** — ファイル単位の履歴、クリックで比較

## 5. スラッシュコマンド

`/` を入力して挿入: 見出し、リスト、テーブル、コードブロック、Mermaid / PlantUML ダイアグラム、数式（KaTeX）、HTML、目次、脚注、アドモニション、コメントなど。

## 6. 設定

| 設定 | デフォルト | 説明 |
| --- | --- | --- |
| `anytimeMarkdown.fontSize` | `0` | フォントサイズ（px）。0 = VS Code デフォルト |
| `anytimeMarkdown.editorMaxWidth` | `0` | エディタの最大幅（px）。0 = 制限なし |

## 7. はじめかた

`.md` / `.markdown` ファイルを開くと自動的に Anytime Markdown で表示されます。VS Code 標準エディタで開きたい場合は、右クリック → **「Open With...」** → **「Text Editor」** を選択。

VS Code 1.109.0 以上が必要です。

## 8. ライセンス

MIT
