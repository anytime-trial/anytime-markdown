# 変更履歴

"anytime-markdown" VS Code 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [1.9.0] - 2026-06-30

### 追加

- VS Code の measure 設定に `full`（画面幅いっぱい）プリセットを追加。

### 修正

- 「Claude 編集中」バナーが解除されない問題を修正（stale 状態の安全網＋ファイル単位ロック配信）。

### Editor Core (markdown-viewer / markdown-rich)

- 思考法ダイアグラム: structure-map 図種、プレビュー上でのインラインラベル編集、DSL 由来ラベル編集（structure-map まとめ／causal-loop 極性）。
- マインドマップを FreeMind 風レイアウトへ変更、子ノード重なりを修正。
- 埋め込み用の読み取り専用 `<anytime-markdown-view>` 要素を追加。

## [1.8.0] - 2026-06-27

### 追加

- Web ページ取り込み: 拡張ホストで SSRF ガード付き fetch（リダイレクト各ホップ再検証・content-type/サイズ/タイムアウト制限）により URL を取得し Markdown 化。カーソル位置へ挿入（`/web`）または無題ドキュメントとして新規作成（ツールバー）。

### Editor Core (markdown-viewer)

- スラッシュコマンド/ツールバーから Web ページ取り込み（Readability + Turndown）。フロントマターは YAML 安全化。

## [1.7.0] - 2026-06-27

### 追加

- リンク先 Markdown ファイルを Markdown エディタで開く: 内部リンクのクリックで対象をエディタで開き、リンク先ファイルの取得・保存を host 経由で行う。

### 修正

- 内部リンクを window capture フェーズで横取りし、`vscode-resource` URL でブラウザへ遷移しないように修正。ワークスペースルート（先頭 `/`）相対リンクをワークスペースルートで解決。
- webview の `Ctrl+S` を host の保存ハンドラに配線（「名前を付けて保存」ダウンロードダイアログにフォールバックしていた問題を修正）。
- webview mount に `vscodeApi` を配線。

### Editor Core (markdown-viewer / markdown-rich)

- mdEmbed トランスクルージョン（インライン編集可能な埋め込み Markdown リンク）、`link` スラッシュコマンド、比較モードのミニマップ差分マーカー、変更オーバービューミニマップの復元、変更 gutter／検索バー／mdEmbed 保存整合性の各種修正。

## [1.6.0] - 2026-06-24

### 追加

- 本文幅(measure)を VS Code 設定 `anytimeMarkdown.measure` で変更可能にし、`fontSize` の配線を復活。

### 変更（破壊的 — 設定）

- ドキュメントルートの設定をトップレベルの `anytimeMarkdown.docsRoot` 1 つに統一。ドキュメント検索の索引とノート網パネルの双方で使用します。旧キー `anytimeMarkdown.noteGraph.repositoryPath` と `anytimeMarkdown.docSearch.docsRoot` は削除したため、いずれかを設定していた場合は `anytimeMarkdown.docsRoot` に再設定してください。
- ドキュメント検索が `docsRoot` 配下全体を索引対象にするよう変更（従来はサブディレクトリ限定）。`anytimeMarkdown.docSearch.subDir` 設定を削除。

### 削除

- 未使用だった `anytimeMarkdown.editorMaxWidth` 設定を削除（エディタ側で適用されていませんでした）。
- `anytimeMarkdown.claudeStatus.directory` 設定を削除。Claude Code の編集ステータスは agent-status ワーカー（DB）から取得するようになり、旧 `claude-code-status.json` ファイルパスは不要になりました。

### Editor Core (markdown-viewer / markdown-rich)

- スペルチェック機能を削除。ソースモードが狭幅で折り返すように。画像 crop 編集を全画面化。表インラインツールバーの操作を編集画面へ集約。`embed-all` テンプレートに Anytime Chart / Thinking Diagram 節を追加。HTML 編集の実プレビューとコードブロックプレビューのハイライトを修復。

## [1.5.1] - 2026-06-23

### Editor Core (markdown-viewer / markdown-rich)

- 狭い表示幅でも幅広テーブルを横スクロールできるようにした（table wrapper を既定で描画）。

## [1.5.0] - 2026-06-22

### 追加

- `mcp-markdown` MCP サーバーを拡張に同梱し自動登録。拡張のインストールのみで Markdown MCP ツールが利用可能に。
- `doc-core` ドキュメント検索パイプラインを同梱（node:sqlite ベースの ingest ＋ `search_docs` / `doc_backlinks` / `doc_neighbors`）。
- Markdown スキル群を同梱し、起動時にワークスペースの `.claude/skills/` へ自動配置。

### セキュリティ

- 同梱スキル名のパストラバーサルを防止（`isSafeSkillName`）。

### MCP (mcp-markdown)

- `format_markdown` を追加。markdown-check 規約に沿って in-place 整形し、差分サマリのみ返してトークンを削減。
- `search_sections` / `get_frontmatter` / `update_frontmatter` / `grep_markdown` を追加。
- `search_docs` の抜粋・`get_section` の `maxChars` に対応し、節単位の FTS を追加。
- 見出し上の空行を 2 → 1 に変更（整形規約の更新）。

### Editor Core (markdown-viewer / markdown-rich)

- vanilla UI プリミティブを `@anytime-markdown/ui-core` へ抽出。
- `anytime-chart` に combo-stacked / combo-area / markers サンプルを追加。chart-core の下部凡例・ドリルダウン・円グラフ中心配置。

## [1.4.0] - 2026-06-20

### 追加

- ノート網パネルに型付きノート関連付け（depends-on / implements / part-of / supersedes / refines）の関係タイプピッカーと凡例を追加し、i18n に対応。フロントマター `related` を gray-matter で型付き解析・書き込み。
- spec 索引ジェネレータ（`spec:index` スクリプト）と `spec-lookup` スキルを追加。

### 修正

- `related` フロントマターの読み書きパスを堅牢化（マージ前レビュー指摘対処）。

### Editor Core (markdown-viewer / markdown-rich)

- `chart-core` を同梱。`anytime-chart` フェンスを `<anytime-chart>` Web Component（9 図種・DPR 補正・hover ツールチップ・a11y）で描画。編集ダイアログに「表」タブと `chart` スラッシュコマンドを追加。
- 設定パネルに本文幅切替 UI（集中 / 標準 / 広い）を em 基準プリセットで追加し、可読性を改善。
- mermaid サンプルに新規 5 図種を追加し、既存サンプルの Mermaid 11.15 非推奨構文を修正。
- マージ前レビュー指摘を反映（chartLayer 二重生成・面グラフ欠損点・ヘッダ列フォールバック・タブ状態）。

## [1.3.0] - 2026-06-17

### 追加

- エディタ右レール（Outline 風）にノート網パネルを追加。ドキュメント中心ビュー＋バックリンク、マウスドラッグでの幅変更、ピン留め（自動で閉じない・別ファイルでも初期表示で開く）に対応。

### Editor Core (markdown-viewer / markdown-rich)

- フロントマター由来のノート網ビューア、思考法ダイアグラムのプレビュー上 WYSIWYG 編集。
- ソースモードの行番号ガター、本文・比較左ペインへの `.md` ドロップで開く。
- 右端全高サイドレール、未保存時のみ有効な保存アイコン、デザイン仕様への整合。
- editor ルート背景/ソース文字色のダークモード追従と Web Component の chrome トークン自給。

## [1.2.0] - 2026-06-13

### 変更

- 拡張機能のアイコンを camel ブランディングに変更。

### Editor Core (markdown-viewer / markdown-rich)

- `anytime-markdown-view` Web Component（React 非依存の read-only カスタム要素）と read-only ビューの font/theme 直置きツールバーを追加。
- Web Component 基底クラスを SSR/Node 安全化。
- read-only 狭幅折り返しの修正と chromeless read-only 表示の復元。

## [1.1.0] - 2026-06-13

### 変更

- TypeScript 6.0.3 へアップグレード（ビルドツールチェーン更新）。

### Editor Core (markdown-viewer / markdown-rich)

- エディタ本文デザインをデザイン仕様へ整合し、本文 measure 既定を 1000px へ変更。
- a11y 改善（タップ 44px・focus リング統一・フォント上限拡張）。
- ダークモードのサイドツールバーアイコン消失・ブロックツールバー重なり・mermaid/図ブロックダイアログのダークモード回帰を修正。

## [1.0.0] - 2026-06-12

### 変更

- React-free 化したエディタコアを同梱。webview を vanilla bootstrap 化し、拡張バンドルから React を完全除去（バンドル軽量化）。
- VS Code の言語変更を `editorKey` の remount で反映。

### Editor Core (markdown-viewer / markdown-rich)

- エディタコアから React を完全排除。全 NodeView と chrome を native/vanilla 化し、旧 React 実装（136 src / 27 css / 148 テスト）と `markdown-react` パッケージを撤去。
- React island（embed/graph プレビュー）を別パッケージ `markdown-react-islands` へ分離。viewer/rich コアは React-free。
- 多数の回帰修正（コンテンツ CSS・ショートカット・beforeunload・merge モード・compare コードブロック編集・StatusBar）。

## [0.18.0] - 2026-06-08

### 変更

- MUI を全廃し自前 UI プリミティブキットへ書き換えたエディタコアを同梱（拡張からの挙動変化なし）。

### Editor Core (markdown-viewer / markdown-rich)

- エディタ chrome と `markdown-rich` から `@mui/material`・`@mui/icons-material` を全廃し、自前 `ui/` プリミティブキットと vendored アイコンへ置換（MUI 削減 Phase3a/3b）。
- MUI `GlobalStyles`・`useTheme`・`useMediaQuery` を stylis ベース `ui/GlobalStyle`・`ThemeModeContext`（`useIsDark`）・自前メディアクエリフックへ置換。peerDependencies から `@mui/*`・`@emotion/*` を削除。
- 比較モードの imageRow バッジレイアウトを修正。

## [0.17.0] - 2026-06-03

### 追加

- 編集中ステータスを agent-status ワーカーから読み取るようにした。

### 修正

- 見出しボーダーをデザイン仕様準拠の墨色に統一。

### Editor Core (markdown-viewer / markdown-rich)

- フレームワーク非依存の `diffEngine` / sanitize クラスタを新パッケージ `@anytime-markdown/markdown-engine` へ抽出し、`sanitizeMarkdown` を DOM 非依存化。
- 共有のエディタテーマ CSS 変数インジェクタと Tiptap コンテンツスタイル合成を抽出し、比較モードのスタイルを通常エディタと統一。
- `onUpdate` シリアライズをキーストロークパスから遅延し、図表集計をツールバー向けにキャッシュ。
- 比較ビューの imageRow flex レイアウトとノードビュー renderer の SWC クラスフィールドリセットを修正。

## [0.16.0] - 2026-05-31

### Editor Core (markdown-viewer / markdown-rich)

- `@tiptap/*` npm 依存を vendored な Tiptap v3.20.0 ソース（`@anytime-markdown/markdown-*` 名前空間）へ全面置換し、外部 Tiptap サプライチェーンを排除。
- リッチコードブロッククラスタ（図表・ダークモード PDF レンダリング）を新パッケージ `@anytime-markdown/markdown-rich` へ分離。`markdown-viewer` は利用側の共有 API を公開。
- エディタコアパッケージを `@anytime-markdown/markdown-viewer` へ改名（旧 `markdown-core` 名は vendored Tiptap ソースを保持）。

## [0.15.6] - 2026-05-27

### Editor Core (markdown-core)

- SonarCloud コード品質改善（型アサーション除去・機械的安全修正）。

## [0.15.5] - 2026-05-24

### Editor Core (markdown-core)

- ランディングフッターの mindmap viewer リンク用 i18n ラベルを追加

## [0.15.4] - 2026-05-21

### 変更

- `markdown-core` 0.15.4 に合わせたバージョン更新（拡張固有のソース変更なし）

### Editor Core (markdown-core)

- SonarCloud 指摘を解消（S7780/S6582/S6653/S7776/S3358 ほか）
- `mcp-markdown`: SonarCloud 指摘を解消（S7772/S6594）。`sanitizeMarkdown` の未カバー分岐を検証するテストを追加（branch 88→100%）

## [0.15.3] - 2026-05-20

### セキュリティ

- `claudeHookSetup` の末尾スラッシュ正規表現 `/\/+$/` を O(n) の `charCodeAt` スキャンに置き換え、多項式 ReDoS を修正（CodeQL #818、`vscode-common`）
- Gantt DoS および CSS/HTML インジェクション CVE に対応するため `mermaid` を 11.15.0 へアップグレード

### Editor Core (markdown-core)

- `MarkdownEditorPage` のエディタ初期化 effect から `applyInitialFontSizeOnce` / `buildEditorPortalTarget` ヘルパーを抽出し、認知的複雑度を削減（S3776）
- セキュリティ: `mermaid` 依存をアップグレード（上記参照）

## [0.15.2] - 2026-05-17

### 変更

- AI ノートに関するドキュメントリンクを新規 Anytime Agent 拡張に向け直し

### Editor Core (markdown-core)

- `markdown-core` が `next/dynamic` から `React.lazy` へ移行し、Next.js ランタイム依存を排除

## [0.15.1] - 2026-05-16

### Editor Core (markdown-core)

- テーブルセル本文の `|` を `\|` にエスケープ（カラム区切り破壊を防止）
- `SourceModeEditor` の textarea 高さを mirror と同期させ、エディタ全体を埋めるよう修正
- 画像 URL シリアライズ時のバックスラッシュをエスケープし、ラウンドトリップを保証
- 不要な `spreadsheet-core` 依存を削除
- セキュリティ: 4 件の webview message listener で origin 検証を追加

## [0.15.0] - 2026-05-15

### 変更

- **Breaking:** `anytimeMarkdown.claudeStatus.directory` の空既定値を `.vscode` から `.anytime` に変更。既存環境では設定上書きまたは手動移動が必要
- 既定の `.vscode` ストレージパスを `.anytime` 配下に統一
- Timeline `OutputChannel` 名を `Anytime Markdown` に統一

### Editor Core (markdown-core)

- `markdown-core` を自己完結 i18n に移行 (公開 API 経由でメッセージを export)
- 非ブラウザバンドルでの `navigator` アクセスと動的 import 解決の不整合を修正
- `mcp-markdown` の `server.tool()` 呼び出しをラップして MCP SDK の TS2589 深さエラーを抑止
- `updateSection` と `ssrfGuard` 周辺のテストカバレッジを強化

## [0.14.1] - 2026-05-06

### 変更

- README から廃止された VS Marketplace バッジを削除

### Editor Core (markdown-core)

- admonition の初期表示崩れと末尾改行累積を解消
- セキュリティ: CodeQL 検出の remote-property-injection / log-injection を修正
- `ssrfGuard`・`embedSeenStore`・`embedCache` のテストカバレッジを向上

## [0.14.0] - 2026-05-04

### 追加

- Anytime Markdown アクティビティバーと Timeline ビューを追加
- Timeline ビューと `compareWithCommit` コマンドで git 履歴の閲覧が可能に

### 変更

- 未使用コマンド 5 件を削除

### Editor Core (markdown-core)

- admonition シリアライザに未知ノード型へのフォールバックを追加
- Sonar 修正: Readonly props（S6759）・型アサーション削除（S4325）・否定三項反転（S7735）・Number グローバル（S7773）・replaceAll（S7781）・globalThis（S7764）・安定キー（S6479）
- 複数コンポーネントにわたるヘルパー抽出で認知的複雑度を削減（S3776）

## [0.13.4] - 2026-05-02

### Editor Core (markdown-core)

- admonition の改行シリアライズをべき等（idempotent）に修正
- Press ページ向け i18n 文字列を更新

## [0.13.3] - 2026-04-28

### Editor Core (markdown-core)

- 埋め込み抜粋抽出と OGP/frontmatter 解析を見直し、正規表現バックトラッキング由来の Hotspot（`S5852`）を回避
- コメントのエスケープ処理と正規表現文字列を調整し、Sonar 指摘（`S7780`）に対応

## [0.13.2] - 2026-04-26

### Editor Core (markdown-core)

- admonition ブロック内バックスラッシュ増幅バグを修正
- `ReadonlyToolbar` からダーク/ライトモード切り替えアイコンを削除

## [0.13.1] - 2026-04-25

### Editor Core (markdown-core)

- Anytime Trail LP の利点テキストを「構造可視化 / 動作可視化 / 品質可視化」フレームで刷新

## [0.13.0] - 2026-04-24

### 追加

- 拡張機能メッセージング経由で Webview に埋め込みプロバイダを注入（`fetchOgp` / `fetchOembed` / `fetchRss` プロキシ）
- OGP / SSRF ヘルパーと `rssFetch` の実装を拡張内にインライン化し `rootDir` 制約を満たす
- 拡張アイコンと Marketplace ロゴを `anytime-markdown-128` に刷新
- README を言語リンクと AI ガターハイライトセクション付きに更新

### Editor Core (markdown-core)

- URL 判定・SSRF ガード・プロバイダ IF を含む埋め込みブロック基盤を追加
- OGP カード・YouTube・Figma・Spotify・Twitter・Drawio の埋め込みノードビューを追加
- `/embed` スラッシュコマンドと埋め込み編集ダイアログを追加
- 埋め込み更新検知とバッジ UI を追加（RSS 発見・OGP / RSS フィンガープリント・既読ストア）
- カードバリアントの image スタイル幅リサイズと Markdown ラウンドトリップでの幅永続化に対応
- `imageRow` を grid から flex に切り替え、`block` 表示に戻して埋め込みの隙間を解消

## [0.12.0] - 2026-04-23

### Editor Core (markdown-core)

- スクロール同期ビューポートインジケータ付き `MarkdownMinimap` コンポーネントを追加（クリックでジャンプ）
- 見出し・diff マーカーの位置計算を行う `useMarkdownMinimap` フックを追加
- sumi-e ライトパレットと violet warning カラーを適用
- `TableNodeView` でスプレッドシートの `showApply`/`showRange` を有効化
- スプレッドシート機能を `spreadsheet-core`/`spreadsheet-viewer` パッケージに切り出し

## [0.11.4] - 2026-04-19

### Editor Core (markdown-core)

- Trail Viewer・Markdown Editor CTA リンク文言の i18n キーを追加

## [0.11.3] - 2026-04-18

### 追加

- 中間ファイルの保存パスを指定する `anytimeMarkdown.storagePath` 設定を追加

### 変更

- `ClaudeStatusWatcher` を `vscode-common` 共通パッケージへ移行
- `storagePath` を `database.storagePath` と `claudeStatus.directory` に分割
- Note treeview を削除（vscode-trail-extension へ移動）

### Editor Core (markdown-core)

- ファイルオープン時にフロントマターをデフォルトで折りたたむ

## [0.11.2] - 2026-04-12

### 修正

- `trail-core/src/c4/coverage/` ソースファイルをバージョン管理から除外してしまう `.gitignore` パターンを修正

## [0.11.0] - 2026-04-11

### 追加

- Note パネルを複数ページ対応（`anytime-note-N` ファイル命名）
- FileSystemWatcher によるノートファイルの自動更新
- エディタ編集後の自動保存
- anytime-note スキル: ページ番号引数・要約モード・引継ぎモード追加
- Note ビューにスキル表示ボタンを追加
- ノートページ一覧にフロントマターのタイトルを表示
- 新規ノートページをクリア状態で作成

### 変更

- ツリービューの表示名変更: Agent Note → Note、Agent Memory → Memory

### 削除

- Memory パネルを Anytime Trail 拡張に移動

### 修正

- ノートファイルを開く際の破損キャッシュを回避
- スキル自動生成を復元しパスを `anytime-note-1.md` に更新
- PreToolUse イベントを見逃した場合も Claude ロックを発火するよう修正

### Editor Core (markdown-core)

- エディタ主要コンポーネントの認知的複雑度を低減（SonarCloud S3776）

## [0.10.4] - 2026-04-09

### Editor Core (markdown-core)

- Trail ナビゲーションラベル用 i18n 翻訳キー

## [0.10.3] - 2026-04-08

### 追加

- サイドバーの Agent Note ビューを復元

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
