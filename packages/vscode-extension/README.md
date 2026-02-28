# Anytime Markdown Editor

VS Code 上で動作する WYSIWYG Markdown エディタ拡張機能です。Tiptap ベースのリッチエディタにより、Markdown ファイルをリアルタイムにプレビューしながら編集できます。

## Features

### WYSIWYG 編集

- **リッチテキスト編集**: Bold, Italic, Underline, Strikethrough, Highlight
- **見出し**: H1 - H5
- **リスト**: 箇条書き、番号付きリスト、タスクリスト（チェックボックス）
- **ブロック要素**: 引用、コードブロック（シンタックスハイライト対応）、水平線
- **テーブル**: 挿入・行列の追加/削除
- **画像**: 相対パス解決、ドラッグ&ドロップ、クリップボードからのペースト
- **リンク**: ダイアログによる挿入/編集/削除 (`Ctrl+K`)
- **Details**: HTML `<details>` の折りたたみブロック
- **Mermaid / PlantUML ダイアグラム**: ライブプレビュー付きコードブロック

### 比較（マージ）モード

- 左右パネルでの差分比較、ブロック単位の差分ハイライト
- 行単位のマージ操作
- **Compare with Markdown Editor**: エクスプローラーのコンテキストメニューから外部ファイルを右パネルに読み込み
- 比較モード中の `Ctrl+S` で右パネルの内容も元ファイルに保存

### ソースモード

- WYSIWYG とソース（生 Markdown）をワンクリックで切り替え
- ソースモードでも行番号・文字数・行数をステータスバーに表示

### アウトラインパネル

- 見出しの一覧表示・折りたたみ
- ドラッグ&ドロップによる見出しの並べ替え

### テンプレート挿入

- 定型テンプレートをワンクリックで挿入

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

### ステータスバー

行番号、文字数、行数をリアルタイム表示します。

### VS Code 設定連携

エディタの表示を VS Code の設定からカスタマイズできます。

## Extension Settings

| 設定 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `anytimeMarkdown.fontSize` | number | `0` | フォントサイズ（px）。0 で VS Code デフォルト |
| `anytimeMarkdown.lineHeight` | number | `1.6` | 行の高さ |
| `anytimeMarkdown.editorMaxWidth` | number | `0` | エディタの最大幅（px）。0 で制限なし |

## Testing

```bash
cd packages/vscode-extension
npm test
```

`@vscode/test-electron` により実際の VS Code インスタンスが起動し、`src/test/` 配下のテストが実行されます。

- テストは `pretest` スクリプトで自動的にコンパイル・lint された後に実行されます
- ヘッドレス CI 環境（Linux）では `xvfb-run npm test` が必要な場合があります

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
