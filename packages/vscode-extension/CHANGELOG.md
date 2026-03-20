# Changelog

All notable changes to the "anytime-markdown" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.2] - 2026-03-20

### Changed
- SonarCloud CRITICAL 23件を解消: Cognitive Complexity 超過の関数をヘルパー関数・サブコンポーネントに分割
- lint warning 36件を解消（未使用 import 削除、non-null assertion 除去、console.log → warn）
- サイト URL を `www.anytime-trial.com` に変更
- GitHub ユーザー名を `anytime-trial` に変更

### Fixed
- SonarCloud BUG: `error.tsx` の関数名 `Error` → `ErrorPage`（予約語衝突回避）
- flatted Prototype Pollution 脆弱性を修正（npm audit fix）
- `renderTextToPngBlob` の return 型エラーを修正

### Security
- GitHub Actions の permissions をワークフローレベルからジョブレベルに移動（最小権限原則）

## [0.6.1] - 2026-03-20

### Added
- GIF レコーダーブロック: 画面キャプチャで矩形選択→録画→アニメーション GIF 生成（`/gif` スラッシュコマンド、再生/停止コントロール）
- ブロック要素のキャプチャ保存: ハンドルバーのカメラアイコンから PNG/SVG/GIF として保存（`showSaveFilePicker` でファイル名・保存先指定可能）
- ブロック要素の Ctrl+C/Ctrl+X: コードブロック・テーブル・GIF 等をブロック単位でコピー/カット（`data-pm-slice` でブロック構造を保持してペースト）
- 右クリックメニューのブロック対応: ブロック要素内でも切り取り・コピーを有効化、貼り付けでブロック構造を復元
- スラッシュコマンド追加: `/h4`, `/h5`（見出し H4/H5）、`/image`（ファイル選択から画像挿入）、`/frontmatter`（YAML フロントマター挿入）

### Changed
- GitHub ユーザー名を `kiyotaka-ueda` から `anytime-trial` に変更
- クリップボード操作を `clipboardHelpers.ts` に共通化（copyTextToClipboard / readTextFromClipboard / saveBlob）
- ブロッククリップボード操作を `blockClipboard.ts` に共通化（ショートカットとポップアップメニューで共用）

### Fixed
- GIF エンコーダーを自前実装に変更（gif.js の Web Worker が CSP でブロックされる問題を解消）
- blob: URL の GIF 再生再開でエラーになる問題を修正
- ソースモード切替で GIF ブロック・gif-settings が消える問題を修正
- 画像キャプチャで AnnotationOverlay（SVG）が取得される問題を修正
- HTMLプレビューキャプチャを SVG 直接保存方式に変更（foreignObject + Canvas の tainted canvas 問題を回避）

## [0.6.0] - 2026-03-19

### Added
- 画像コメント機能: SVG オーバーレイで矩形/円/線を描画しコメントを追加（解決/削除対応、コメントパネルに統合表示）
- 画像トリム機能: ドラッグで範囲選択しトリミング（Base64/リンク画像の分岐保存対応）
- 画像リサイズ: プリセットボタン（25%〜200%）による倍率変更
- 画像編集画面にルーラー（ピクセル目盛り）とグリッド線を表示
- セマンティック比較: 見出しベースのセクション単位で LCS マッチングし差分を表示（トグル切替）
- 右クリックコンテキストメニュー: 切り取り/コピー/貼り付け/Markdownで貼り付け/コードブロックで貼り付け（ショートカット表示付き）
- 罫線テーブル（Unicode Box Drawing）の Markdown テーブル自動変換（貼り付け時）
- キーボードショートカット追加: Alt+Arrow（ブロック移動）、Shift+Alt+Arrow（ブロック複製）、Ctrl+Enter/Shift+Enter（空行挿入）、Ctrl+L（行選択）、Ctrl+D（単語選択）、Tab/Shift+Tab（見出しレベル変更）
- VS Code 拡張: クリップボード画像の自動ファイル保存（Ctrl+V / D&D で images/ に保存しリンク挿入）
- VS Code 拡張: activationEvents 最適化（onLanguage:markdown + onView）
- VS Code 拡張: Workspace Trust 対応（untrustedWorkspaces: limited）
- VS Code 拡張: Markdown リンク検証（ファイル存在・アンカー存在チェック、Diagnostics API）
- VS Code 拡張: パスのコピー・ファイルインポート・外部ファイル D&D をツリービューに追加
- Playwright+Electron によるデモ GIF 作成ツール
- React Error Boundary（role="alert"、リロードボタン付き）
- キーボードショートカットのユニットテスト・E2E テストを追加

### Changed
- EditorMainContent を EditorContentArea / EditorMergeContent / EditorSideToolbar に分割
- Context 値を useMemo でメモ化、パネル重複排除、セクション番号ロジックを hook に抽出
- isEditable 取得方法を統一（useCurrentEditor フック）
- GitHub API ユーティリティを集約、ExplorerPanel を分割
- 比較モード左側ブロック要素: レビューモードではツールバー非表示、編集モードでは選択時にラベルのみ表示
- 比較モード左側のチェックボックスを DOM キャプチャフェーズで操作無効化
- README バッジを整理、文体をリライト

### Fixed
- VS Code ソースモードで Ctrl+Z（Undo）が効かない問題を修正
- 貼り付け画像が VS Code webview で表示されない問題を修正（base href 動的設定）
- GitHub エクスプローラのファイル選択で無限ループする問題を修正
- Service Worker の navigationPreload 警告を修正
- セマンティック diff の行番号計算を修正（パディング行の除外）
- 画像アノテーションのソースモード切替時消失を修正（Markdown 末尾ブロック保存方式）
- Base64 画像でアノテーション保存時にクラッシュする問題を修正（indexOf ベース検索）

### Security
- overwriteImage/saveClipboardImage のパストラバーサル脆弱性を修正（ディレクトリ境界チェック）
- CSP に base-uri ディレクティブを追加（javascript: スキーム注入防止）
- ウェブビューメッセージの実行時型ガードを追加（TypeScript 型アサーションから typeof チェックに変更）
- Canvas taint エラーの try-catch ハンドリングを追加

## [0.5.2] - 2026-03-17

### Added
- マークダウン管理の複数リポジトリ対応（フォルダー追加で2つ以上のルートを同時表示）
- 変更パネルの複数リポジトリ対応（リポジトリごとにグループ表示）
- Git グラフのカスタムアイコン（ローカル=青、リモート済み=赤で色分け表示）
- リポジトリノード右クリックメニューにブランチ切替・リポジトリを閉じる
- 全画面テーブル比較の左パネルにセル単位の差分ハイライト
- 比較モードの左側（比較元）ブロック要素で編集アイコンを非表示

### Changed
- モード切替アイコンをOutlinedバリアントに変更（VS Codeデザインに統一）
- パネルヘッダー高さを統一（アウトライン・コメント・エクスプローラ）
- 縦ツールバーに固定幅・罫線を追加しハンバーガーメニューと中心位置を合わせ
- ハードコーディング値を定数化（PANEL_HEADER_MIN_HEIGHT等）
- leftEditor/rightEditorの変数名を入れ替え（左=比較、右=編集の意味に統一）

### Fixed
- 全画面テーブル比較の左右判定をeditorインスタンス比較に修正
- 比較モードトグルをVS Code拡張のみ非表示にする（webアプリでは表示）
- git cloneのコマンドインジェクション防止（exec→execFile）
- グラフの分岐なし行から先頭の*を除去

## [0.5.1] - 2026-03-15

### Added
- セクション番号の挿入/削除機能（アウトラインパネル・VS Code ツリービューにアイコン追加、H1〜H5 対応、ソースに直接書き込み）
- 外部変更検知を VS Code 通知に変更（右下通知 + 再読込ボタン）
- ツールバーに再読込ボタンを追加（VS Code 拡張のみ）
- ファイル読込時にフォーマット整形が発生する場合の通知
- 連続テキスト行にハードブレイク（\）を自動付加（改行の保持）
- Excel/Google Sheets からの表の貼り付け対応（セル内改行は `<br>` に変換）
- VS Code 拡張の多言語化（package.nls.json / package.nls.ja.json、README.ja.md）
- feature-matrix.md に不足機能を追加（Excel/Sheets 貼り付け等）
- ソース管理 diff 時にランディング画面を表示（GIT HISTORY パネルへの誘導メッセージ付き）

### Changed
- セクション番号の自動表示機能を削除し、明示的な挿入/削除操作のみに変更
- テキスト書式（Bold/Italic/Underline/Strikethrough/Highlight/InlineCode）のキーボードショートカットを無効化（バブルメニューから操作）
- リスト（Ctrl+Shift+7/8/9）、リンク（Ctrl+K）、コメント（Ctrl+Shift+M）、アウトライン（Ctrl+Alt+O）のショートカットを無効化
- customEditors の priority を `option` に変更（VS Code 標準テキストエディタがデフォルト）

### Fixed
- Ctrl+S 保存時に外部変更通知が表示される問題を修正（onWillSaveTextDocument で抑制）
- 初回ロード時の TipTap 正規化によるファイル書き戻しを抑制
- セクション番号挿入後に dirty 表示（●）されるよう初回ロード判定を改善
- テーブルセル内のハードブレイクが `\\` で出力されテーブル行が壊れる問題を修正（`<br>` に変換）
- Excel ペースト時に画像として貼り付けられる問題を修正（text/html 優先）
- テーブル外側の背景色がテーブルセル内と異なる問題を修正（インライン・全画面・比較モード）

### Removed
- Details/Summary（折りたたみブロック）機能を削除
- HelpDialog（キーボードショートカットダイアログ）を削除
- /features ランディングページを削除
- インライン数式（$...$）機能を削除
- 未使用のヘルプ画像を削除

### Security
- fetchFromCdn の SSRF 対策を強化（URL 再構築方式）

## [0.5.0] - 2026-03-15

### Added
- ブロック要素編集画面の統一強化: 全ブロック（コード/Mermaid/PlantUML/数式/HTML/テーブル/画像）に専用編集ダイアログを導入
- Mermaid/PlantUML: Code / Config タブで設定を分離編集（`%%{init:...}%%` / `skinparam`）
- 全ブロック編集画面にライブプレビュー追加（コード: シンタックスハイライト / Mermaid: SVG / PlantUML: 画像 / 数式: KaTeX / HTML: DOMPurify ライブレンダリング）
- 全ブロック編集画面にズーム・パン機能追加（ボタン / ホイール / ドラッグ）
- 全ブロック編集画面にサンプル挿入パネル追加（Mermaid 23種 / PlantUML 12種 / 数式 7種 / HTML 6種 / コード 24言語 Hello World）
- 全ブロック編集画面に行番号表示・Tab インデント追加
- ダイアグラム/数式/HTML のインラインプレビューにリサイズグリップ追加
- テーブル編集画面で比較モード時に左右並列テーブル表示
- HTML ブロック編集画面で比較モードのコード差分表示
- ダイアグラム/数式/HTML のダブルクリックで編集画面を開く機能
- ブロック要素編集画面のヘッダーにブロック固有アイコン表示
- defaultContent の英語版を作成し言語に応じて使い分け
- ランディングページにテーブル編集・数式・GitHub連携の機能カードを追加
- defaultContent に HTML ブロックのサンプルを追加

### Changed
- 「全画面表示」を「ブロック要素編集画面」に名称変更
- インラインツールバーのアイコンを全画面表示アイコンから編集アイコンに変更
- テーブル操作アイコンをインラインからブロック要素編集画面に移動
- キャプチャアイコンをインラインからブロック要素編集画面のプレビュー側に移動
- コードコピーボタンをブロック要素編集画面のコード側ツールバーに移動
- 閉じるボタンをラベル左側に統一
- シンタックスハイライト色を GitHub 風に統一
- マージ操作を右→左のみに制限
- ブロック移動機能（Alt+Up/Down）を削除
- README.md を英語に翻訳
- 共通コンポーネント10件を抽出: EditDialogHeader, EditDialogWrapper, ZoomToolbar, SamplePanel, DraggableSplitLayout, ZoomablePreview, BlockInlineToolbar, ResizeGrip, useBlockResize, useBlockNodeState
- マジックナンバーとスタイルパターンを定数化（dimensions.ts, uiPatterns.ts）
- 不要コードの一括クリーンアップ（孤立コンポーネント削除、未使用エクスポート/i18n キー削除）

### Fixed
- 印刷時の2ページ目以降クリップと PlantUML コード崩れを修正
- ステータスバーを position:fixed で画面下端に固定
- エディタページのブラウザ全体のスクロールバーを非表示に修正
- フロントマター表示/非表示時のエディタ高さ再計算
- コードブロックプレビューの highlightedHtml に DOMPurify サニタイズを追加

## [0.4.1] - 2026-03-12

### Added
- ファイルハンドルの永続化（IndexedDB）によりリロード後も上書き保存とファイル名表示を維持
- ドラッグ&ドロップ時に FileSystemFileHandle を取得し直接上書き保存に対応
- ファイルドラッグ時のエディタ領域の背景色変更による視覚フィードバック
- PlantUML コンテナに role="img" と aria-label を追加（アクセシビリティ改善）

### Changed
- 図ブロック（Mermaid/PlantUML）の選択時にツールバー・コード展開・リサイズハンドルを非表示に変更
- 図ブロックのダブルクリックで常に全画面表示を有効化（モード問わず）
- saveFile/saveAsFile の戻り値を boolean に変更しキャンセル時の通知を抑制
- 比較モード右パネルのドラッグオーバースタイルをオーバーレイ方式に統一

### Fixed
- PDF エクスポート時の KaTeX 数式・SVG 図形の体裁崩れを修正
- PDF エクスポート時に見出し背景色・セクション番号・ステータスバーを非表示に修正
- PDF エクスポート時に通常コードブロックが非表示になる問題を修正
- PDF エクスポート時の本文文字色を黒に統一
- PDF エクスポート時に PlantUML のソースコードが縦表示される問題を修正
- モード切替時の末尾改行消失を修正（editor.storage フラグ方式）
- 比較モードのソースビューで末尾改行が表示されない問題を修正
- ソースモードから戻った時にフロントマター高さが反映されない問題を修正

## [0.4.0] - 2026-03-11

### Added
- アウトラインパネルの折りたたみ/展開トグルボタン
- アウトラインにセクション番号の自動表示（web アプリと同じ自動判定ロジック）
- sanitizeMarkdown のユニットテスト（50テスト）
- BoundedMap ユーティリティ（FIFO eviction 付きサイズ上限 Map）
- ESLint ルール追加（型アサーション制限、非ヌルアサーション警告、console 制限、import 整列）
- WCAG2.2 AA 監査レポートとフルコードレビューレポート
- CHANGELOG（editor-core、web-app）

### Changed
- パネル背景色を全体で統一（OutlinePanel, CommentPanel, LinePreviewPanel 等）
- アウトラインからセクション番号トグルアイコンを削除（自動表示に統合）
- ソースモード・全画面ダイアログの背景色をコードブロックと統一
- EditorToolbar を 588→393 行に分割（ToolbarFileActions、ToolbarMobileMenu を抽出）
- MergeEditorPanel・InlineMergeView を 500 行以下に分割
- EditorToolbar の Props を 4 つのオブジェクトに集約（48→17 props）
- ソース→WYSIWYG 同期ロジックの 3 重複を共通関数に抽出
- editor.storage キャストを型安全ヘルパーに集約
- MarkdownEditorPage を 361 行に縮小
- package.json の依存バージョンを exact 固定に変更
- aria-label の英語固定を i18n 対応
- global-error.tsx のダークモード対応

### Fixed
- 外部通信に AbortController タイムアウトを追加
- svgCache / urlCache のメモリ無制限成長を防止
- 空の catch ブロックにエラーログを追加
- useLayoutEditor の useEffect にキャンセル処理を追加
- 未使用変数・import を 21 件削除
- Frontmatter 表示時にエディタ下部が切れる問題を修正
- useSourceMode の不要な `as any` キャストを削除

### Security
- tar パッケージの Symlink Path Traversal 脆弱性を修正
- PlantUML URL 構築にオリジン検証を追加（SSRF 対策）
- HTML タグ除去を正規表現から DOMParser.textContent に変更
- commentHelpers の正規表現を indexOf ベースに置換（ReDoS 対策）
- fetchFromCdn で構築 URL のオリジン検証を追加（SSRF 対策）

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

### Changed
- スキップリンク、キーボードアクセシビリティ改善
- main ランドマーク追加（WCAG 1.3.1）
- aria-label / aria-pressed / role 属性を全コンポーネントに追加
- SearchReplaceBar に role="search" / autoComplete="off"
- HtmlPreviewBlock に role="document"
- ブロックタイプラベルの focus-within 表示
- FullPageLoader に role="status" + ブランドテキスト
- LandingHeader の h1 要素化
- VersionDialog ロゴの alt テキスト追加
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

[Unreleased]: https://github.com/anytime-trial/anytime-markdown/compare/v0.6.2...HEAD
[0.6.2]: https://github.com/anytime-trial/anytime-markdown/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/anytime-trial/anytime-markdown/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/anytime-trial/anytime-markdown/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/anytime-trial/anytime-markdown/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/anytime-trial/anytime-markdown/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/anytime-trial/anytime-markdown/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/anytime-trial/anytime-markdown/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/anytime-trial/anytime-markdown/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/anytime-trial/anytime-markdown/compare/v0.2.9...v0.3.0
[0.2.9]: https://github.com/anytime-trial/anytime-markdown/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/anytime-trial/anytime-markdown/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/anytime-trial/anytime-markdown/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/anytime-trial/anytime-markdown/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/anytime-trial/anytime-markdown/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/anytime-trial/anytime-markdown/compare/v0.2.1...v0.2.4
[0.2.1]: https://github.com/anytime-trial/anytime-markdown/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/anytime-trial/anytime-markdown/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/anytime-trial/anytime-markdown/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/anytime-trial/anytime-markdown/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/anytime-trial/anytime-markdown/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/anytime-trial/anytime-markdown/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.11...v0.1.0
[0.0.11]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.10...v0.0.11
[0.0.10]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.9...v0.0.10
[0.0.9]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/anytime-trial/anytime-markdown/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/anytime-trial/anytime-markdown/releases/tag/v0.0.1
