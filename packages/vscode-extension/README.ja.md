# Anytime Markdown Editor

VS Code 上で動作する WYSIWYG Markdown エディタ拡張機能です。\
Tiptap ベースのリッチエディタにより、Markdown ファイルをリアルタイムにプレビューしながら編集できます。

## エディタモード

ツールバーの pill 型トグルでモードを切り替えます。

### 編集モード（`Ctrl+Alt+S`）

| モード | 説明 |
|---|---|
| **WYSIWYG** | リッチテキスト編集。書式設定やブロック挿入を視覚的に操作 |
| **ソース** | 生の Markdown テキストを直接編集 |
| **レビュー** | 閲覧専用。コメント追加とチェックボックス操作のみ可能 |

### 比較モード（`Ctrl+Alt+M`）

| モード | 説明 |
|---|---|
| **通常** | 単一パネルでの編集 |
| **比較** | 左右パネルで差分比較・マージ操作 |

## 機能

### 対応 Markdown 要素

| カテゴリ | 要素 |
|---|---|
| テキスト書式 | Bold, Italic, Underline, Strikethrough, Highlight, インラインコード, リンク |
| 見出し | H1 〜 H5（折りたたみ・自動番号付き） |
| リスト | 箇条書き, 番号付きリスト, タスクリスト（チェックボックス） |
| ブロック | 引用, アドモニション（NOTE / TIP / IMPORTANT / WARNING / CAUTION）, 水平線 |
| コードブロック | シンタックスハイライト（37言語対応） |
| テーブル | 行列の追加/削除, セル配置, 行列移動, Excel/Google Sheets からの貼り付け |
| ダイアグラム | Mermaid（23種）, PlantUML（12種）— ライブプレビュー付き |
| 数式 | KaTeX によるブロック数式 |
| HTML | DOMPurify サニタイズ付きライブプレビュー |
| 画像 | 相対パス解決, ドラッグ&ドロップ, クリップボード貼り付け |
| その他 | 目次（TOC）, 脚注, YAML フロントマター, コメント |

### スラッシュコマンド

エディタ上で `/` を入力するとコマンドメニューが表示されます。

| コマンド | 説明 |
|---|---|
| `/heading1` 〜 `/heading3` | 見出し H1 〜 H3 |
| `/bulletList` | 箇条書きリスト |
| `/orderedList` | 番号付きリスト |
| `/taskList` | タスクリスト（チェックボックス） |
| `/blockquote` | 引用 |
| `/codeBlock` | コードブロック |
| `/table` | テーブル（3×3） |
| `/horizontalRule` | 水平線 |
| `/mermaid` | Mermaid ダイアグラム |
| `/plantuml` | PlantUML ダイアグラム |
| `/math` | 数式（KaTeX） |
| `/html` | HTML ブロック |
| `/toc` | 目次（見出しから自動生成） |
| `/date` | 今日の日付（YYYY-MM-DD） |
| `/footnote` | 脚注 |
| `/note` `/tip` `/important` `/warning` `/caution` | アドモニション |
| `/comment` | コメント追加 |

### 比較（マージ）モード

- 左右パネルでの差分比較、ブロック単位の差分ハイライト
- 行単位のマージ操作
- **Compare with Markdown Editor**: エクスプローラーのコンテキストメニューから外部ファイルを右パネルに読み込み
- **Git History 比較**: コミット選択で右パネルに過去のバージョンを表示

### アウトラインパネル

- VS Code サイドバーに見出しの一覧を表示
- クリックで該当位置へスクロール

### コメントパネル

- VS Code サイドバーにドキュメント内のコメント一覧を表示
- コメントの解決・フィルター（未解決/解決済み）

### キーボードショートカット

| ショートカット | 機能 |
|---|---|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |
| `Ctrl+Shift+X` | Strikethrough |
| `Ctrl+Shift+H` | Highlight |
| `Ctrl+E` | インラインコード |
| `Ctrl+K` | リンク挿入/編集 |
| `Ctrl+Shift+M` | コメント追加 |
| `Ctrl+Shift+8` | 箇条書きリスト |
| `Ctrl+Shift+7` | 番号付きリスト |
| `Ctrl+Shift+9` | タスクリスト |
| `Ctrl+Alt+S` | モード切替（レビュー / WYSIWYG / ソース） |
| `Ctrl+Alt+M` | 比較モード切替 |
| `Ctrl+Alt+O` | アウトライン切替 |
| `Ctrl+S` | 保存 |

> Mac の場合、`Ctrl` は `Cmd` に読み替えてください。

## 拡張機能の設定

| 設定 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `anytimeMarkdown.fontSize` | number | `0` | フォントサイズ（px）。0 で VS Code デフォルト |
| `anytimeMarkdown.editorMaxWidth` | number | `0` | エディタの最大幅（px）。0 で制限なし |

## 使い方

`.md` / `.markdown` ファイルを開くと、自動的に Anytime Markdown エディタで表示されます。

VS Code 標準のテキストエディタで開きたい場合は、ファイルを右クリック → **「Open With...」** から **「Text Editor」** を選択してください。

## 動作要件

- VS Code 1.109.0 以上

## 既知の問題

- 画像のドラッグ&ドロップは base64 としてファイルに埋め込まれます。大きな画像は Markdown ファイルのサイズが増大するため注意してください。
- TipTap の Markdown ラウンドトリップにより、読み込み時にフォーマット整形が発生する場合があります。初回読み込み時に通知でお知らせします。

## ライセンス

MIT License
