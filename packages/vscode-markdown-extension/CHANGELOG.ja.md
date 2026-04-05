# 変更履歴

"anytime-markdown" VS Code 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.10.1] - 2026-04-05

### Editor Core (markdown-core)

- ツールバーのアプリアイコンをハンバーガーメニューに置換
- サイドツールバーの枠線・位置修正

## [0.10.0] - 2026-04-04

### Editor Core (markdown-core)

- PlantUML ソース (.puml) および Mermaid (.mmd) エクスポート
- ロゴ画像パス修正
- ESLint 警告の解消

## [0.9.3] - 2026-04-01

### Editor Core (markdown-core)

- 狭い画面での Mermaid 図の横スクロール対応
- エディタ設定に word-break 設定を追加
- 読み取り専用モードでの見出しクリック時のアウトラインパネル修正

## [0.9.2] - 2026-04-01

### セキュリティ

- ファイルシステム操作の TOCTOU 競合を排他作成フラグで修正
- 一時ファイル作成時のパーミッションを制限（mode 0o600）
- VS Code webview の postMessage ハンドラに origin 検証を追加
- ネットワークデータのファイル書き込みにパス走査防止を追加

### Editor Core (markdown-core)

- エディタモード状態管理用 EditorModeContext を追加
- アウトラインパネルの段階的展開と狭いビューポートでのオーバーレイ
- リファクタリング: エディタ DOM ハンドラ、クロップ、マージフック分離
- テーブルセル高さ、見出しセンタリング、インラインテーブルカーソルを修正

## [0.9.1] - 2026-03-30

### Editor Core (markdown-core)
- 狭い画面向けレスポンシブツールバー（900px以下）
- 全ブロック編集ダイアログにApplyボタンと破棄確認ダイアログ
- スプレッドシート: クリップボード、範囲選択、列フィルタ、グリッドサイズ設定

## [0.9.0] - 2026-03-29

### 追加
- Git treeview 機能を新規 Anytime Git 拡張に分離

### 変更
- VS Code 拡張ページのコピーとアイコン順序を改善
- 画像と埋め込みテンプレートを更新

### Editor Core (markdown-core)
- スプレッドシートモード: Canvas ベースのフルスクリーンテーブル編集（セルサイズ設定、セル単位アライメント、Undo/Redo、範囲選択、ドラッグ並べ替え、コンテキストメニュー）
- テーブルセルモード: クリップボード対応のキーボードナビゲーション
- JSXGraph/Plotly による数式グラフ可視化
- 手書き風テーマプリセット
- フォースレイアウト用物理エンジン

## [0.8.5] - 2026-03-28

### 追加
- 外部/base64 画像の貼り付け時にワークスペースフォルダへローカル保存

### Editor Core (markdown-core)
- ブロックノード（画像等）のコピー&ペーストを修正
- GIF 録画で data URL を使用するよう変更
- サイドパネルのボーダー表示を修正
- テンプレートファイルのリネームと未使用アセットの削除

## [0.8.4] - 2026-03-28

### 追加
- Claude Code 編集通知機能: ファイル編集検知 → エディタロック → 解除フロー
- VS Code 設定: `language`、`themeMode`、`themePreset`
- ツールバーコントロールを VS Code ネイティブ editor title bar に移動
- `mcp-cms` サーバーを `.mcp.json` に登録

### 変更
- Claude 編集ステータスバーアイテムを削除し、オーバーレイ方式に移行
- 未使用の `claudeLock` メッセージハンドラを除去
- AI ノートボタンラベルを「AI ノートを編集」→「ノート編集」に短縮
- jsxgraph と plotly を拡張バンドルから除外（バンドルサイズ削減）

### 修正
- Claude 編集通知のロック/アンロック信頼性問題を解消
- Claude Code hook の配列フォーマットを修正
- hook ファイルパス解析で stdin jq パーシングを使用
- ステータスファイル監視を安定化（fs.watch → fs.watchFile → setInterval ポーリング）
- タイムスタンプベースの重複排除がアンロックをブロックする問題を修正
- ロック検知後のアクティブアンロックポーリングを追加

### エディタコア (markdown-core)
- `showFrontmatter` prop: フロントマター表示制御
- エディタコンテキストメニューに「画面クリア」オプション
- Claude 編集インジケータ: 固定オーバーレイバー（レイアウトシフトなし）
- MUI Menu の Fragment children 警告を修正
- セキュリティ: NEXT_LOCALE cookie の Secure 属性追加、importDrawio サニタイズ修正

## [0.8.3] - 2026-03-27

### 追加
- Anytime Git との拡張機能間 diff 連携用 openCompareMode コマンド

### 変更
- Git treeview 機能（リポジトリ、変更、グラフ、タイムライン）を新しい Anytime Git 拡張機能に分離

### エディタコア (markdown-core)
- Math Graph: LaTeX 数式のグラフ可視化（JSXGraph, Plotly.js）
- Handwritten テーマプリセット（手描き風見出し・Admonition・ダイアグラム）
- デフォルトテーマを Handwritten に変更

## [0.8.2] - 2026-03-25

### エディタコア (markdown-core)
- Mermaid: テーマ変更時の古い SVG クリア修正
- ライトモードの配色・PDF エクスポート改善

## [0.8.0] - 2026-03-25

### 変更
- `vscode-extension` パッケージを `vscode-markdown-extension` に名称変更

## [0.7.7] - 2026-03-23

### 追加
- ツリービューエクスプローラに「ファイル名のコピー」コンテキストメニュー項目
- ファイルを開く際の自動再読み込みをデフォルト有効化

### 修正
- ツリービューのドラッグ&ドロップがコピーではなく移動するよう修正

## [0.7.6] - 2026-03-22

### エディタコア (markdown-core)
- スラッシュコマンド: ブロック編集ダイアログ自動起動、frontmatter/脚注改善
- blockquote の Tab/Shift+Tab ネスト（最大6階層）
- Admonition スラッシュコマンドのラベル修正

## [0.7.5] - 2026-03-22

### 変更
- 「AI Note」を「Agent Note」に名称変更（コマンド名・メッセージ・CLAUDE.md 自動追記）

## [0.7.1] - 2026-03-22

### エディタコア (markdown-core)
- ブロック要素アライメントの統一（text-align + inline-block）
- SonarQube 588件の CODE_SMELL 修正

## [0.7.0] - 2026-03-21

### エディタコア (markdown-core)
- GapCursor（ブロック要素左側のカーソル表示）
- スクリーンキャプチャ + ImageCropTool トリミング
- ソースモード base64 画像折りたたみ
- 外部変更の自動再読み込み + 変更ガターハイライト
- MarkdownViewer コンポーネント
- セキュリティ: ReDoS/Cognitive Complexity 修正

## [0.6.5] - 2026-03-20

### エディタコア (markdown-core)
- Admonition スタイルを GitHub 準拠に変更
- テーブル選択時の Ctrl+C/X 修正
- ReDoS 脆弱性修正

## [0.6.4] - 2026-03-20

### 追加
- ツールバーアイコンをアプリのラクダロゴに変更
- VS Code API 型スタブ（`vscode.d.ts`）を追加し型安全性を向上

### 変更
- ブロック移動・複製ショートカットを VS Code のみ有効に変更（Web の Chromium 競合回避）

### エディタコア (markdown-core)
- 用紙サイズ表示（A3/A4/B4/B5、余白調整）
- テンプレート挿入スラッシュコマンド
- スクロールバー・インラインコードの WCAG AA 準拠

## [0.6.3] - 2026-03-20

### エディタコア (markdown-core)
- テンプレートファイル名変更、見出しスタイル変更
- XSS/ReDoS セキュリティ修正

## [0.6.1] - 2026-03-20

### エディタコア (markdown-core)
- GIF レコーダーブロック（/gif スラッシュコマンド）
- ブロック要素キャプチャ保存（PNG/SVG/GIF）
- ブロック単位 Ctrl+C/X、右クリックメニュー対応
- スラッシュコマンド: /h4, /h5, /image, /frontmatter

## [0.6.0] - 2026-03-19

### 追加
- VS Code 拡張: クリップボード画像の自動ファイル保存（Ctrl+V / D&D で images/ に保存しリンク挿入）
- VS Code 拡張: activationEvents 最適化（onLanguage:markdown + onView）
- VS Code 拡張: Workspace Trust 対応（untrustedWorkspaces: limited）
- VS Code 拡張: Markdown リンク検証（ファイル存在・アンカー存在チェック、Diagnostics API）
- VS Code 拡張: パスのコピー・ファイルインポート・外部ファイル D&D をツリービューに追加

### 修正
- VS Code ソースモードで Ctrl+Z（Undo）が効かない問題を修正
- 貼り付け画像が VS Code webview で表示されない問題を修正（base href 動的設定）

### セキュリティ
- ウェブビューメッセージの実行時型ガードを追加（TypeScript 型アサーションから typeof チェックに変更）

### エディタコア (markdown-core)
- 画像アノテーション（SVG オーバーレイ + コメント）
- 画像トリム・リサイズ（プリセットボタン）
- セマンティック比較（見出しベース LCS マッチング）
- コンテキストメニュー、罫線テーブル自動変換、キーボードショートカット追加

## [0.5.2] - 2026-03-17

### エディタコア (markdown-core)
- 全画面テーブル比較: セル単位 diff ハイライト
- パネルヘッダー高さ統一、定数化

## [0.5.1] - 2026-03-15

### 追加
- ツールバーに再読込ボタンを追加（VS Code 拡張のみ）
- VS Code 拡張の多言語化（package.nls.json / package.nls.ja.json、README.ja.md）

### 変更
- customEditors の priority を `option` に変更（VS Code 標準テキストエディタがデフォルト）

### 修正
- Ctrl+S 保存時に外部変更通知が表示される問題を修正（onWillSaveTextDocument で抑制）

### エディタコア (markdown-core)
- セクション番号の挿入/削除機能
- Excel/Google Sheets テーブル貼り付け対応
- ハードブレイク自動付加
- Details/Summary・インライン数式の削除

## [0.5.0] - 2026-03-15

### 変更
- README.md を英語に翻訳

### エディタコア (markdown-core)
- 統一ブロック編集ダイアログ（全7ブロックタイプ）
- ライブプレビュー、ズーム/パン、サンプル挿入パネル
- 共通コンポーネント10件抽出、定数化

## [0.4.0] - 2026-03-11

### エディタコア (markdown-core)
- アウトラインパネル折りたたみ、セクション番号自動表示
- EditorToolbar/MergeEditorPanel 分割リファクタリング
- セキュリティ: SSRF/ReDoS 防止

## [0.3.0] - 2026-03-10

### エディタコア (markdown-core)
- YAML フロントマター対応（認識・保持・編集）
- ブラウザスペルチェック設定

## [0.2.8] - 2026-03-09

### エディタコア (markdown-core)
- 全画面コード比較: 行単位マージ
- Readonly/レビューモードでカーソル・テキスト選択有効化

## [0.2.4] - 2026-03-08

### 追加
- アクティビティバーにアウトラインパネルを追加（TreeView）
- アクティビティバーにコメントパネルを追加（TreeView）

### 変更
- ステータスバーを VS Code ネイティブに移行（カーソル位置・文字数・行数・改行コード・エンコーディング）
- アクティビティバーアイコンを Markdown 風 M 字アイコンに変更
- Open Markdown Editor コマンドを削除
- Compare with Git HEAD コマンドを削除

### 修正
- VS Code Undo/Redo 時の空行消失を修正
- エディタ高さ計算で DOM 実測値を使用し、ステータスバー非表示時の空白を解消

## [0.1.0] - 2026-03-06

### 追加
- FileSystemWatcher による外部変更通知（VS Code 拡張機能）

### 修正
- VS Code 拡張機能でのソースモードタブ切替時永続化

### エディタコア (markdown-core)
- ビューモード（読み取り専用ブラウジング）
- 行番号ナビゲーション (#L)

## [0.0.11] - 2026-03-04

### エディタコア (markdown-core)
- インラインコメント、コールアウト、脚注、セクション番号拡張
- コードブロック シンタックスハイライト（lowlight）
- スラッシュコマンドによるブロック挿入

## [0.0.9] - 2026-03-03

### エディタコア (markdown-core)
- KaTeX 数式レンダリング（インライン・ブロック）
- 目次自動生成、エンコーディング/改行コード変換

## [0.0.7] - 2026-03-01

### エディタコア (markdown-core)
- スラッシュコマンドメニュー、PDF エクスポート
- Mermaid/PlantUML リサイズハンドル、コードブロックコピーボタン

## [0.0.3] - 2026-02-27

### 修正
- vscode-markdown-extension package.json に repository フィールドを追加（vsce 警告解消）

## [0.0.2] - 2026-02-26

### 追加
- VS Code のカラーテーマとエディタのダーク/ライトモードを同期

### 変更
- VS Code 拡張機能でヘルプ・バージョン情報メニューを非表示に変更

### 修正
- ソースモードの行番号がクリップされる問題を修正

## [0.0.1] - 2026-02-26

### 追加
- VS Code Custom Editor（*.md / *.markdown ファイル対応）
- Compare with Markdown Editor: エクスプローラーのコンテキストメニューから外部ファイルを比較モードの右パネルに読み込み
- 比較モード中の Ctrl+S で右パネルの内容も元ファイルに保存
- VS Code 設定連携: fontSize, lineHeight, editorMaxWidth

### エディタコア (markdown-core)
- WYSIWYG Markdown エディタ（Tiptap ベース）
- ソースモード切替、比較（マージ）モード
- テキスト書式、見出し、リスト、ブロック要素、テーブル、画像
- Mermaid / PlantUML ダイアグラム
- 検索・置換、アウトラインパネル、テンプレート挿入
- バブルメニュー、ステータスバー、キーボードショートカット
