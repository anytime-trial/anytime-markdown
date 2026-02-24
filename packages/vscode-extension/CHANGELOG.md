# Changelog

All notable changes to the "anytime-markdown-editor" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.0.1] - 2026-02-24

### Added

- WYSIWYG Markdown エディタ (Tiptap ベース)
- ソースモード切替
- テキスト書式: Bold, Italic, Underline, Strikethrough, Highlight
- 見出し: H1 / H2 / H3
- リスト: 箇条書き、番号付き、タスクリスト
- ブロック要素: 引用、コードブロック（シンタックスハイライト）、水平線
- テーブル: 挿入・行列の追加/削除
- 画像: 相対パス解決、ドラッグ&ドロップ、クリップボードからのペースト
- リンクダイアログ: 挿入/編集/削除 (Ctrl+K)
- Details (`<details>`) 折りたたみブロック
- 検索・置換 (Ctrl+F / Ctrl+H): 大文字小文字区別、単語一致、正規表現
- バブルメニュー: テキスト選択時のフローティング書式メニュー
- ステータスバー: 行番号、文字数、行数
- キーボードショートカット一式
- VS Code 設定連携: fontSize, lineHeight, editorMaxWidth
- エラーハンドリング: 保存失敗時のメッセージ表示
- 大ファイル (100KB超) のデバウンス最適化
