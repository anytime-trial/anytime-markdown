# Changelog

All notable changes to the "anytime-markdown" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.3.0] - 2026-03-10

### Added
- YAML フロントマターの認識・保持・編集に対応（WYSIWYG モードでコードブロック風表示）
- ブラウザスペルチェック設定を設定パネルに追加
- フロントマター削除時の確認ダイアログ
- SEO 改善: OG 画像動的生成、Twitter Card、JSON-LD 構造化データ、各ページ個別 meta
- VS Code Marketplace 向け keywords フィールド追加

### Changed
- description をキーワード充実（Mermaid, PlantUML, diff, merge, 設計書等）

## [0.2.9] - 2026-03-09

### Fixed
- ImageNodeView テストから存在しない fold/unfold ボタンのテストを削除

## [0.2.8] - 2026-03-09

### Added
- 全画面コード比較に行単位マージ機能を追加（Mermaid/PlantUML/コードブロック/Math）
- 比較モードでコードブロック全画面表示時に左右コード比較を表示
- 比較モードで左エディタのブロック展開/折りたたみを右エディタに同期
- readonly/レビューモードでカーソル表示・テキスト選択を可能に

### Fixed
- 編集モードでのテンプレート挿入時に連続空行が圧縮される問題を修正
- Netlify CDN キャッシュにより API レスポンスが同一データを返す問題を修正
- 比較モード切替時に NodeViews（図表・画像・テーブル）が消失する問題を修正
- 比較モードの左右パネル幅の統一
- 比較モードのソースモード textarea フォーカス時の青枠を非表示
- ソースモードの行番号折り返し対応・flushSync 警告抑制
- readonly/レビューモードでコードブロックのツールバー・リサイズハンドル・図操作を無効化
- 比較モードの左→右マージボタンと差分記号列を削除
- 比較モードのレビュー/readonly モードで hover label を非表示
- 比較モードの左右パネル表示差異・数式非表示・mermaid 競合を修正
- 比較モードの右エディタでカーソル表示とファイルドロップを有効化
- OUTLINE のセクション番号・ブロック要素の初期値を OFF に変更
- 見出し間の空行でスラッシュコマンドが動作しない問題を修正

## [0.2.7] - 2026-03-08

### Fixed
- /api/docs/content の本番環境キャッシュ問題を修正（force-dynamic 追加）
- Dockerfile の重複・不要な記述を整理（Playwright ブラウザインストールを node ユーザーで実行）

## [0.2.6] - 2026-03-08

### Changed
- 比較モードの右側エディタを常に readonly に変更
- 比較モードの右側エディタでコメント入力を無効化
- ツールバーからすべて折りたたむ/展開するボタンを削除
- 比較モードでの mermaid/plantuml ブロック自動折りたたみを廃止（常に展開）
- 比較モードの右ファイルエクスポートボタンを削除
- 比較モード・readonly・review モードで行頭ホバーラベルを非表示に変更（左側編集エディタは表示維持）

### Fixed
- /docs/view ページの本番環境キャッシュ問題を修正（force-dynamic 追加）

## [0.2.5] - 2026-03-08

### Added
- devcontainer に GitHub MCP サーバー自動設定を追加
- README に GitHub Personal Access Token の設定手順を追加

### Fixed
- /docs/view で別ドキュメントが表示されるキャッシュ問題を修正（Next.js Data Cache 無効化、Vary ヘッダー追加）
- /docs ページのサーバーキャッシュを無効化（revalidate → force-dynamic）
- _layout.json を CDN キャッシュではなく S3 から直接取得するよう変更
- /privacy ページの言語切替が反映されない問題を修正（クライアントコンポーネントに分離）

## [0.2.4] - 2026-03-08

### Added
- アクティビティバーにアウトラインパネルを追加（TreeView）
- アクティビティバーにコメントパネルを追加（TreeView）
- Git 履歴パネルを追加
- 比較モード右パネルへのドラッグ&ドロップによるファイル読み込みを追加
- レビューモードで比較モード切替を有効化

### Changed
- ステータスバーを VS Code ネイティブに移行（カーソル位置・文字数・行数・改行コード・エンコーディング）
- アクティビティバーアイコンを Markdown 風 M 字アイコンに変更
- Open Markdown Editor コマンドを削除
- Compare with Git HEAD コマンドを削除

### Fixed
- VS Code Undo/Redo 時の空行消失を修正
- Mermaid レンダリングの並行実行による firstChild null エラーを修正
- エディタ高さ計算で DOM 実測値を使用し、ステータスバー非表示時の空白を解消
- Git 履歴パネルのアクティビティバーアイコンを常時表示に変更

## [0.2.1] - 2026-03-08

### Added
- システム設計書を docs/design/ に追加（全6ファイル）
- モード別・プラットフォーム別機能一覧とインフラ構成図を追加
- 毎日のビルドチェックと週次キャッシュクリーンアップの CI ワークフローを追加

### Fixed
- Mermaid レンダリング時の "Cannot read properties of null (reading 'firstChild')" エラーを修正
- ドキュメント削除後に一覧が更新されない問題を修正
- ドキュメント一覧 API の Next.js サーバー側キャッシュを無効化
- ドキュメント API のキャッシュ制御を改善（Cache-Control ヘッダー追加）

### Security
- HSTS ヘッダーをセキュリティヘッダーに追加

## [0.2.0] - 2026-03-08

### Added
- /docs ページを GitHub Docs 風カテゴリレイアウトにリデザイン（ヒーローセクション、フラットカードデザイン）
- カテゴリ内アイテムのラベル編集・ツールチップ表示・ドラッグ並べ替え機能
- URL リンクアイテムのカテゴリ追加機能（外部URL・相対パス対応）
- /privacy ページに LandingHeader を追加
- readonly モードを追加（環境変数で表示制御）

### Changed
- レイアウトデータ構造を LayoutCard から LayoutCategory に変更
- AWS 環境変数に ANYTIME_ プレフィックスを追加（SDK 自動認識から明示的 credentials 設定に変更）
- ヘッダーロゴクリックでトップページに遷移するように変更
- ランディングヘッダから機能一覧リンクを削除
- features ページからホームへ戻るリンクを削除

### Fixed
- docs/view で異なるドキュメントの内容が表示される問題を修正（localStorage キャッシュ競合）
- ソースモードのテキストエリアのフォーカス時の青い枠線を除去
- HMR 時のローディングフラッシュを防止
- 新規作成後に HMR でデフォルトコンテンツに戻る問題を修正
- blockquote 空行・リスト/テーブル内ハードブレイクのラウンドトリップ修正

## [0.1.4] - 2026-03-07

### Changed
- ページ区切りガイド機能を削除

### Fixed
- テーブルセル内コードスパンの `&lt;` `&gt;` エンティティがラウンドトリップで消失する問題を修正
- テーブルセル内コードスパンのパイプエスケープを `&#124;` から `\|` に変更
- マルチバッククォートのコードスパンがテーブルセル区切りを誤エスケープする問題を修正
- 保存時にファイル末尾の改行を保証するよう修正

## [0.1.3] - 2026-03-07

### Added
- 外部変更時に確認ダイアログを表示してから更新する（Claude Code、git 操作等）

### Fixed
- openLink のパストラバーサル検証をワークスペースルート基準に変更
- ハードブレークのシリアライズをバックスラッシュ形式に変更
- テーブルセル内コードスパンのラウンドトリップ安定化

## [0.1.2] - 2026-03-06

### Fixed
- ビューモードから WYSIWYG モードへの切替時にデータが消失する問題を修正
- useSourceMode テストの localStorage 汚染による偽陽性を修正

### Security
- 検索パターンの正規表現エスケープ関数を分離し、パターン長上限（1000文字）を追加（CodeQL #9）
- openLink のパストラバーサル防止: 絶対パスおよび親ディレクトリ参照を拒否（CodeQL #5-#8）

## [0.1.1] - 2026-03-06

### Fixed
- ビューモードから WYSIWYG モードへの切替時にデータが消失する問題を修正

### Security
- tar を 7.5.10 に更新（パストラバーサル脆弱性対応）
- HTML エンティティ復元を単一パス置換に変更（CodeQL #11: 不完全な多文字サニタイゼーション）
- 検索正規表現の ReDoS 検出パターン強化とマッチ回数上限追加（CodeQL #10）

## [0.1.0] - 2026-03-06

### Added
- ビューモード（読み取り専用ブラウジング + アウトライン改善）
- /features ページ（ヘルプコンテンツ + TOC ナビゲーション）
- `#L` 行番号ナビゲーション
- デフォルト改ページオフ設定
- FileSystemWatcher による外部変更通知（VS Code 拡張機能）
- ヘルプメニューに features ページリンク追加

### Changed
- HelpDialog をキーボードショートカットのみに簡素化
- ランディングページの機能説明・デザイン更新
- モード切替ボタンをピル型セグメントにリデザイン

### Fixed
- ZWNJ タイトトランジションマーカーによるスペーシング修正
- 連続段落行のラウンドトリップ時マージ防止
- 見出し-リスト間スペーシング保持
- ブロック-リスト間汎用スペーシング保持
- VS Code 拡張機能でのソースモードタブ切替時永続化
- ツールバー e2e テストのスラッシュコマンド対応

## [0.0.11] - 2026-03-04

### Added
- インラインコメント機能（範囲選択コメント + ポイントコメント、解決/再開/削除）
- コールアウト拡張（[!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]）
- 脚注参照拡張（[^id] 構文）
- セクション自動番号付け拡張
- 設計書テンプレート（基本設計書、API仕様書、ADR）
- コードブロックのシンタックスハイライト（lowlight）
- スラッシュコマンドによるブロック挿入（ツールバー簡素化）
- robots.ts / sitemap.ts による SEO 対応
- loading.tsx によるルート遷移ローディング
- @next/bundle-analyzer 導入
- ヘルプページに数式・TOC・スラッシュコマンド・エンコーディングの説明追加

### Changed
- ランディングページを Server Component 化（パフォーマンス改善）
- ランディングページの img を next/Image に置換
- MUI icons のバレルインポートを深いパスインポートに変更
- CI パイプラインに lint / next build ステップを追加
- ESLint に React hooks / Next.js ルールを追加

### Fixed
- PDF エクスポートのタイムアウト・エラー処理改善
- テンプレート挿入時の Markdown 前処理
- リスト直列化の改善（タイトリスト、ネスト対応）
- コードブロック折りたたみ時の余分な余白除去
- ソースモード切替時のコメント保持・DOMPurify NUL バイト対策
- 数式ブロックの左揃え表示
- 水平線選択時のキャレット表示
- Providers の useEffect 依存配列修正

### Improved (a11y)
- スキップリンク、キーボードアクセシビリティ改善
- main ランドマーク追加（WCAG 1.3.1）
- aria-label / aria-pressed / role 属性を全コンポーネントに追加
- SearchReplaceBar に role="search" / autoComplete="off"
- HtmlPreviewBlock に role="document"
- ブロックタイプラベルの focus-within 表示
- FullPageLoader に role="status" + ブランドテキスト
- LandingHeader の h1 要素化
- VersionDialog ロゴの alt テキスト追加

### Improved (UX)
- StatusBar レスポンシブ対応（xs で一部項目非表示）
- HelpDialog TOC のモバイル非表示
- Privacy ページに戻りナビゲーション追加
- 404 ページ / CommentPanel / RightEditorBlockMenu の i18n 対応
- エラー通知（PDF エクスポート、保存、エンコーディング変更）
- native prompt/confirm を MUI Dialog に置換

### Security
- CSP の unsafe-eval を開発環境のみに制限

## [0.0.10] - 2026-03-03

### Fixed
- GitHub Actions ワークフローにトップレベル permissions ブロックを追加
- e2e テストの dark mode switch セレクタを修正（複数 switch の曖昧性解消）
- HelpDialog の DOMPurify 型注釈を修正（tsc / webpack ビルドエラー解消）

## [0.0.9] - 2026-03-03

### Added
- KaTeX 数式レンダリング（インライン・ブロック対応）
- 数式サンプルポップオーバーによる LaTeX テンプレート挿入
- 数式・日付のスラッシュコマンド
- 見出しからの目次（TOC）自動生成
- エンコーディング変換メニュー（ステータスバー）
- 改行コード変換メニュー（ステータスバー）
- 改ページガイド表示設定
- Google Analytics（GA4）対応（nonce ベース CSP）
- エンコーディング変更時の確認ダイアログ (M6)
- ドラッグハンドルのキーボード操作対応 (H3)
- 図のアクセシブルな代替テキスト改善 (H4)
- CodeBlock サブコンポーネントのユニットテスト (M10)

### Changed
- MermaidNodeView を4つのサブコンポーネントに分割 (M3)
- ドラッグハンドルのコントラスト改善（opacity 0.5→0.7）(M5)
- 図リサイズの useEffect/useCallback 依存関係最適化 (M4)
- ウェルカムコンテンツのデザインリニューアル
- ブランドカラーをテーマ secondary パレットに統一 (L2)
- webpack alias を削除し tsconfig paths に統一 (L6)

### Fixed
- aria-valuenow の NaN 対策（画像・図リサイズ）(L5)
- ConfirmDialog に aria-describedby 追加 (L3)
- OutlinePanel トランジションに prefers-reduced-motion 追加 (L4)
- 図コード切替ボタンに aria-pressed 追加 (M8)
- HelpDialog に DOMPurify 設定を明示化 (H6)
- PDF エクスポート時の Mermaid 図ダーク表示修正
- Mermaid 図 SVG 幅のエディタフォントサイズ連動
- 数式ブロック初期表示時の sanitizeMarkdown 適用
- テンプレート挿入時の flushSync 競合回避
- ReDoS 脆弱性のある正規表現を線形時間パーサーに置換

## [0.0.8] - 2026-03-01

### Added
- ランディングページを `/` に新設（Hero、Features、エディタプレビュー、Footer）
- エディタを `/markdown` ルートに移動
- ランディングページの EN/JA 言語切替
- フッターに VS Code Marketplace リンクを追加
- Welcome コンテンツに Mermaid ワークフロー図を追加
- エディタプレビュー画像（ダークモード）をランディングページに表示

### Changed
- PWA の start_url を `/markdown` に変更（PWA 起動時にエディタ直接表示）

## [0.0.7] - 2026-03-01

### Added
- nonce ベースの CSP を middleware で実装し、script-src から unsafe-inline を除去 (H-3)
- CSP に worker-src 'self' ディレクティブを追加
- PDF エクスポート中のローディングインジケーター表示
- ESLint + typescript-eslint の設定を追加
- スラッシュコマンドメニューによるブロック挿入機能
- ツールバーボタンを ToggleButtonGroup に統一
- Playwright による E2E テスト（エディタ基本操作、モード切替、ツールバー、ファイル操作、検索置換、アウトライン、設定、キーボードショートカット）
- PDF エクスポート機能（@media print スタイル対応）
- Mermaid/PlantUML ダイアグラムのリサイズハンドル
- ダイアグラムコードのデフォルト折りたたみ表示
- コードブロックのコピーボタン
- HTML サンプルポップオーバーとツールバー挿入ボタン
- OpenGraph メタデータ
- フォーカストラップとキーボード操作の改善（フルスクリーン NodeView）
- ファイル操作の Snackbar 通知
- 差分・エラー状態の非カラー視覚インジケーター
- MIT LICENSE ファイル

### Changed
- any 型を ProseMirror / Tiptap の適切な型に置換
- ESLint の孤立した disable コメントを除去
- ダイアグラムをエディタのフォントサイズに連動して CSS zoom でスケーリング
- PDF エクスポート時にダイアグラムをライトテーマでレンダリング
- PDF デフォルト用紙サイズを A4 に設定
- コードブロック背景をダイアグラム背景と統一
- PlantUML ダークモード背景を Mermaid と統一
- フルスクリーンダイアログ背景を background.paper に統一
- ダイアグラムコード切替ボタンをツールバーから削除

### Fixed
- Mermaid SVG のフルスクリーンダイアログ内でのコンテナ幅スケーリング
- PDF エクスポート時に Mermaid/PlantUML コードブロックを非表示

### Security
- HTML サニタイズ設定を許可リスト方式に変更
- PlantUML img 要素に referrerPolicy を追加
- Mermaid の securityLevel を strict に設定
- CSP の script-src から unsafe-inline を除去し nonce ベースに移行

## [0.0.6] - 2026-03-01

### Added
- NodeView コンポーネント・MergeView hooks のユニットテスト 50 件追加 (L-08)
- ルート jest.config.js によるモノレポテスト検出対応

### Changed
- InlineMergeView.tsx を hooks とコンポーネントに分割 (M-11)
- MermaidNodeView.tsx を hooks とコンポーネントに分割 (M-10)
- MarkdownEditorPage.tsx を hooks とコンポーネントに分割 (M-09)
- OutlinePanel の JSX 重複除去とマージモードブレークポイント改善 (M-07, M-12)
- React.memo を 6 コンポーネントに適用、TranslationFn 型統一 (M-13, M-14)
- File System Access API の any キャストを型付きインターフェースに置換 (L-06)

### Fixed
- デフォルト値の改善と未使用 i18n キーの削除 (L-01, L-02, L-04, L-05)
- global-error ページの i18n 対応とスタイリング (M-15)
- not-found / error ページの追加 (L-07)
- npm test --workspaces のエラー解消 (mobile-app, vscode-extension)
- providers.test.tsx の window.matchMedia モック追加

## [0.0.5] - 2026-02-28

### Added
- 初回アクセス時にウェルカムコンテンツを表示するオンボーディング機能 (H-08)
- アウトラインパネルの折りたたみ/展開アニメーション (L-04)
- 検索バーをツールバーからフローティングオーバーレイに移動（VS Code スタイル）
- スマホサイズでファイル操作ボタンをメニューに集約
- ブラウザ/OS の言語設定による初回言語自動検出
- ツールバーの全ボタンにキーボードショートカットをツールチップ表示
- ヘルプダイアログにファイル操作・表示切替のショートカットカテゴリを追加

### Changed
- EditorToolbar / MarkdownEditorPage のリファクタリング: hooks・styles を分離 (M-09)

### Fixed
- 日本語翻訳の統一（文体の一貫性修正） (L-03)
- UX・アクセシビリティの改善 (M-01〜M-05, M-08, M-10, M-12)

## [0.0.4] - 2026-02-28

### Changed
- タイトル表示と showTitle 設定を削除し、エディタ領域を拡大
- ヘッダーの空ボックスを除去

### Added
- editor-core / web-app / vscode-extension のテストスイートを追加

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
