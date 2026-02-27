# Changelog

All notable changes to the "anytime-markdown" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.0.3] - 2026-02-27

### Added
- エディタ設定パネルにダークモード切替・言語切替 UI を追加

### Changed
- GitHub Actions の公開トリガーをタグ push から master マージに変更

### Fixed
- vscode-extension package.json に repository フィールドを追加（vsce 警告解消）

## [0.0.2] - 2026-02-26

### Added
- Mermaid/PlantUML ツールバーにダイアグラムキャプチャボタンを追加
- VS Code のカラーテーマとエディタのダーク/ライトモードを同期
- GitHub Actions による Marketplace 自動公開ワークフロー

### Changed
- バージョン管理を一元化し、バージョンダイアログのロゴを修正
- VS Code 拡張機能でヘルプ・バージョン情報メニューを非表示に変更

### Fixed
- ソースモードの行番号がクリップされる問題を修正

## [0.0.1] - 2026-02-26

### Added

- WYSIWYG Markdown エディタ (Tiptap ベース)
- ソースモード切替
- 比較（マージ）モード: 左右パネルでの差分比較、行単位マージ、ブロック単位差分ハイライト
- Compare with Markdown Editor: エクスプローラーのコンテキストメニューから外部ファイルを比較モードの右パネルに読み込み
- 比較モード中の Ctrl+S で右パネルの内容も元ファイルに保存
- テキスト書式: Bold, Italic, Underline, Strikethrough, Highlight
- 見出し: H1 - H5
- リスト: 箇条書き、番号付き、タスクリスト
- ブロック要素: 引用、コードブロック（シンタックスハイライト）、水平線
- テーブル: 挿入・行列の追加/削除
- 画像: 相対パス解決、ドラッグ&ドロップ、クリップボードからのペースト
- リンクダイアログ: 挿入/編集/削除 (Ctrl+K)
- Details (`<details>`) 折りたたみブロック
- Mermaid / PlantUML ダイアグラム: ライブプレビュー付きコードブロック
- 検索・置換 (Ctrl+F / Ctrl+H): 大文字小文字区別、単語一致、正規表現
- アウトラインパネル: 見出しのドラッグ&ドロップ並べ替え、折りたたみ
- テンプレート挿入
- バブルメニュー: テキスト選択時のフローティング書式メニュー
- ステータスバー: 行番号、文字数、行数
- キーボードショートカット一式
- VS Code 設定連携: fontSize, lineHeight, editorMaxWidth
- エラーハンドリング: 保存失敗時のメッセージ表示
- 大ファイル (100KB超) のデバウンス最適化
