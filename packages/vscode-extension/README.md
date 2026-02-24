# Anytime Markdown Editor

VS Code 上で動作する WYSIWYG Markdown エディタ拡張機能です。Tiptap ベースのリッチエディタにより、Markdown ファイルをリアルタイムにプレビューしながら編集できます。

## Features

### WYSIWYG 編集

- **リッチテキスト編集**: Bold, Italic, Underline, Strikethrough, Highlight
- **見出し**: H1 / H2 / H3
- **リスト**: 箇条書き、番号付きリスト、タスクリスト（チェックボックス）
- **ブロック要素**: 引用、コードブロック（シンタックスハイライト対応）、水平線
- **テーブル**: 挿入・行列の追加/削除
- **画像**: 相対パス解決、ドラッグ&ドロップ、クリップボードからのペースト
- **リンク**: ダイアログによる挿入/編集/削除
- **Details**: HTML `<details>` の折りたたみブロック

### ソースモード

- WYSIWYG とソース（生 Markdown）をワンクリックで切り替え
- ソースモードでも行番号・文字数・行数をステータスバーに表示

### 検索・置換

- `Ctrl+F` で検索、`Ctrl+H` で検索＆置換
- 大文字/小文字区別、単語一致、正規表現オプション対応

### キーボードショートカット

| ショートカット | 機能 |
|---|---|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |
| `Ctrl+Shift+X` | Strikethrough |
| `Ctrl+Shift+H` | Highlight |
| `Ctrl+K` | リンク挿入/編集 |
| `Ctrl+Shift+8` | 箇条書きリスト |
| `Ctrl+Shift+7` | 番号付きリスト |
| `Ctrl+Shift+9` | タスクリスト |
| `Ctrl+Alt+T` | テーブル挿入 |
| `Ctrl+Alt+R` | 水平線挿入 |
| `Ctrl+Alt+S` | ソースモード切替 |
| `Ctrl+S` | 保存 |

> Mac の場合、`Ctrl` は `Cmd` に読み替えてください。

### バブルメニュー

テキストを選択すると、書式設定用のフローティングメニューが表示されます。

### VS Code 設定連携

エディタの表示を VS Code の設定からカスタマイズできます。

## Extension Settings

| 設定 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `anytimeMarkdownEditor.fontSize` | number | `0` | フォントサイズ（px）。0 で VS Code デフォルト |
| `anytimeMarkdownEditor.lineHeight` | number | `1.6` | 行の高さ |
| `anytimeMarkdownEditor.editorMaxWidth` | number | `0` | エディタの最大幅（px）。0 で制限なし |

## Usage

1. `.md` ファイルを右クリック → **"Open with Markdown Editor"** を選択
2. または、コマンドパレット（`Ctrl+Shift+P`）から **"Open Markdown Editor"** を実行

## Requirements

- VS Code 1.109.0 以上

## Known Issues

- 画像のドラッグ&ドロップは base64 としてファイルに埋め込まれます。大きな画像は Markdown ファイルのサイズが増大するため注意してください。

## Release Notes

### 0.0.1

Initial release.

## License

MIT License
