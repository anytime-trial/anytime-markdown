# 変更履歴

`@anytime-markdown/markdown-viewer` に関するすべての注目すべき変更をこのファイルに記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいており、
このプロジェクトは [Semantic Versioning](https://semver.org/) に準拠しています。

## [Unreleased]

## [1.13.4] - 2026-07-16

### 変更

- プライバシーポリシー文言（web アプリのプライバシーページで表示）を現行機能に追随させ、機能ごとの外部サービス（Google Drive・GitHub・ログイン・リンクプレビュー・Web ページ取り込み・画像）と実際のブラウザストレージ利用を明記した。

## [1.13.2] - 2026-07-13

### 修正

- コードフェンス内の markdown プレビューが本文幅設定に追従せず固定幅のままになる不具合を修正しました。

## [1.12.0] - 2026-07-11

### 追加

- ノート網パネルをエディタのサイドツールバーへ配線（閲覧専用）。

### 修正

- エディタのフロントマターを編集/レビューモードで表示。

## [1.11.0] - 2026-07-11

### 追加

- ツールバーの「開く」ボタンをメニュー化し、Google Drive をオプションとして統合。
- ツールバーに「新規」ボタンと「保存」メニューを追加し、新規文書作成時に未保存変更ガードを設けた。
- 「開く」メニューに「GitHub から開く」項目を追加。
- ステータスバーのファイル名の隣に保存先バッジ（ローカル / GitHub / Drive）を表示。
- フェンス付き `markdown` コードブロックをレンダリングプレビュー表示（markdown-rich）。

### 変更

- GitHub 連携文書の上書き保存を「GitHub にコミット」に改名し、右上の単独コミットボタンを廃止。
- 本文ドラフトの所有権を draftStorage に集約し externalFilePath を削除。
- 保存先判定を hasSaveTarget に統一。

### 修正

- Drive への新規保存でマルチパート境界が本文と衝突する不具合を修正。
- 外部保存の完了を await せず本文が破棄される不具合を修正。
- readOnly prop とユーザー選択の readonly モードを分離し、モード切替の固着を解消。
- DOMPurify によって Mermaid ラベルが削除される不具合を修正。
- コメントのみの変更を draft storage と onContentChange へ反映するよう修正。
- 保存先を discriminated union 化し、「名前を付けて保存」後の上書き保存がローカルへ書き込まれないよう修正。
- 外部由来の文書に同名ローカルファイルのネイティブハンドルを紐付けないよう修正。
- Drive で開いたファイル名がステータスバーで古いローカル名に戻る不具合を修正。
- Drive から開いた本文で上書き保存が無効化される不具合を修正。
- 保存のキーボードショートカットのヒントを、実際に発火するメニュー項目へ移設。
- explorer トグルをサイドツールバーへ配線。

### セキュリティ

- Mermaid ラベル領域からフォームとインラインスタイルを削除し、設定定数を凍結。

### アクセシビリティ

- 位置バッジを aria-hidden にし、位置のアナウンスを単一の aria-label に集約。
- プレビュー切替時に role/aria-label が残留しないよう修正（markdown-rich）。

## [1.10.0] - 2026-07-09

### 追加

- `DriveFileSystemProvider`: Google Drive 上の Markdown をファイル ID で開き、revision 突合で同時編集を検出し、注入された `confirmOverwrite` コールバックで上書き前に確認する。
- Google Drive API リクエストの構築と、表示中ページの Markdown 化キャプチャを行う共有純粋関数。

### 変更

- 常に空だった handle 配列と、その destroy ループを削除 (Sonar S4158)。

### セキュリティ

- コードスパン保護の正規表現を線形走査へ置換し、多項式 ReDoS を解消 (CodeQL js/polynomial-redos)。

## [1.9.1] - 2026-07-02

### 修正

- vanilla UI: 脱React 化で生じたロジック・エディタ状態購読・エラー可視化の回帰を修正。
- markdown-rich: PlantUML encoder を修正、KaTeX/印刷 SVG をサニタイズ、graph preview の i18n を完遂。
- diff 色をテーマトークン駆動に変更し、位置解決の silent catch を解消。
- 残存 i18n キーの補完、detached 判定の是正、dead code 削除の完遂（pre-merge review 指摘対応）。

### セキュリティ

- webImport のサニタイズを対称化し、origin 検証を追加、`vscodeApi` アクセス経路を統一。

### アクセシビリティ

- vanilla UI: キーボード操作・aria・i18n に対応。

## [1.9.0] - 2026-06-30

### 追加

- 思考法ダイアグラム: `structure-map` 図種を追加。
- プレビュー上で図のテキストをその場編集: ラベルをクリックして直接編集（構造操作は「…」ポップオーバーへ）。
- DSL 由来ラベル編集の網羅: structure-map のまとめラベル編集、causal-loop の極性（+/-）インライン編集。
- マインドマップを FreeMind 風レイアウトに変更（中央ルート＋葉数バランスの左右展開＋ベジェ曲線）。
- 本文の幅に `full`（画面幅いっぱい）プリセットを追加。
- 読み取り専用埋め込み: 軽量な読み取り専用 `<anytime-markdown-view>` カスタム要素と `view-element` パッケージ公開エクスポート。

### 修正

- マインドマップの子ノード重なりを解消（兄弟間隔を角度依存化）。
- インラインラベル編集で改行を禁止し、行ベースのダイアグラム DSL 破壊を防止。

## [1.8.0] - 2026-06-27

### 追加

- Web ページ取り込み: URL から Web ページを取得し、Readability で本文を抽出して Turndown(GFM) で Markdown 化。`/web` スラッシュでカーソル位置に挿入、ツールバーボタンで新規ドキュメント作成。変換はエディタ内で実行し、環境別に生 HTML を供給する注入式プロバイダを使用。フロントマター値はエスケープし YAML インジェクションを防止。

## [1.7.0] - 2026-06-27

### 追加

- mdEmbed トランスクルージョン: 段落内で単独の Markdown リンクを折りたたみ可能なインライン編集ブロックとして展開。リンク先 Markdown をネストしたエディタで描画し、編集内容を書き戻す（往復シリアライズ＋リンク先解決の singleton プロバイダ）。
- リンクを挿入する `link` スラッシュコマンドを追加。
- 比較モードで変更箇所をミニマップに表示。

### 修正

- スクロールバー横の変更オーバービュー（ミニマップ）を復元（vanilla 化で欠落していたもの）。
- 検索バーを本文スクロールに追従させず常時表示するように修正。
- mdEmbed: 保存整合性・編集競合の処理、プロバイダ後注入による「未設定」固着、fetch 中のプロバイダ差し替え時の pending 再取得、特殊文字リンクのエスケープを修正。
- ライブ更新を差分送信化し、同値の live patch 再適用時に gutter baseline を再取得しないことで変更 gutter マーカーの消失を防止。

## [1.6.0] - 2026-06-24

### 削除

- エディタのスペルチェック機能を全面削除。

### 変更

- ソースモードで幅を狭めても長い行が折り返すようにし、比較モードと同方式へ統一。
- 用紙モード中は本文幅(measure)を無効化し、設定の順序を用紙→本文幅へ変更。
- 表インラインツールバーの操作アイコンを編集画面へ集約。
- 図インラインツールバーのソース書き出しアイコンを撤去。
- `embed-all` テンプレートに Anytime Chart / Thinking Diagram の節を追加。
- 画像の編集(crop)画面を全画面表示に統一。

### 修正

- 画像アノテーション編集ツールバーを整備（crop 画面に閉じるボタンを追加・アノテーション閉じるボタンを左端へ統一・右上の undo ボタンを削除）。
- `markdown-rich`: コードブロック編集プレビューの構文ハイライト色とレイアウトを修復。
- `markdown-rich`: HTML 編集画面の右ペインに実プレビューを表示。

## [1.5.1] - 2026-06-23

### 修正

- `CustomTable` で table wrapper（`renderWrapper`）を既定で描画し、狭い表示幅でも幅広テーブルを横スクロールできるようにした。CSS の `.tableWrapper { overflow-x: auto }` だけでは効かなかった（`resizable: false` で wrapper を生成する native TableView が無効化されていたため）。

## [1.5.0] - 2026-06-22

### 変更

- vanilla UI プリミティブ（14 コンポーネント＋アイコン）を `graph-core` から共有パッケージ `@anytime-markdown/ui-core` へ抽出（内部リファクタ、描画挙動の変更なし）。
- `markdown-rich`: `anytime-chart` フェンスに combo-stacked / combo-area / markers のサンプルチャートを追加。
- `chart-core`: 凡例を下部レイアウト化し、カテゴリクリックによるドリルダウンイベントと円グラフの矩形中心配置に対応。

### 修正

- `chart-core`: 棒・面グラフで系列ラベルが同系色で不可視になる問題を、近接凡例の隣接振替で解消。

## [1.4.0] - 2026-06-20

### 追加

- 新パッケージ `chart-core` を同梱し、`anytime-chart` フェンスを `<anytime-chart>` Web Component で描画。折れ線/棒/横棒/積み上げ/面/円・ドーナツ/散布図/複合/左右2軸の第2Y軸に対応し、DPR 補正・hover ツールチップ・a11y を実装。パレットはデジタル庁ダッシュボードガイドブック準拠。
- `anytime-chart` 編集ダイアログに「表」タブを追加。表とチャート spec を相互変換し、右ペインでライブ描画。`chart` スラッシュコマンドとサンプル選択を追加。
- 設定パネルに本文幅切替 UI（**集中 / 標準 / 広い**）を追加。em 基準のプリセットで可読性を改善。
- mermaid サンプルギャラリーに新規 5 図種を追加。

### 修正

- mermaid サンプルの非推奨・不正構文を現行 Mermaid 11.15 向けに修正。
- マージ前レビュー指摘を反映: `chartLayer` の二重生成を解消、面グラフの欠損データ点除外、空ヘッダ列に対する系列名フォールバック、タブ選択状態の伝播を修正。

## [1.3.0] - 2026-06-17

### 追加

- フロントマター由来のノート網ビューア（ドキュメント中心ビュー＋バックリンク・`graph-core` で描画）を追加。
- 思考法ダイアグラム（`anytime-thinking-model`）のプレビュー上 WYSIWYG 編集を追加。
- ソースモードに行番号ガターを追加。
- 本文領域（および比較モード左ペイン）への `.md` ドロップでファイルを開けるよう対応。
- サイドツールバーに light/dark テーマ切替を追加（後に設定パネルへ集約）。

### 変更

- サイドツールバーを右端の全高レール化し、アクションを並べ替え。ダークモード切替は設定パネルへ移動。
- 上書き保存アイコンを未保存変更があるときのみ有効化（dirty ゲート）。
- 右クリックメニューからモード切替（レビュー/編集/ソース）を撤去。比較モード左ペインは readOnly（レビュー）メニューに。
- 比較モードのソース表示を `InlineMergeView` に一元化。
- エディタの余白・スクロールバー・フォーカス・フォントサイズをデザイン仕様に整合。

### 修正

- editor ルート背景とソースモード文字色をダークモードに追従。
- ソースモードから比較に入ると単一 WYSIWYG が一瞬見える回帰を修正。
- Web Component が chrome テーマトークンを自給し、素の consumer で背景が透ける不具合を修正。

## [1.2.0] - 2026-06-13

### 追加

- `anytime-markdown-view` Web Component を追加（read-only markdown ビューを埋め込む React 非依存のカスタム要素。web-app `/report` で使用）。
- read-only ビューに font/theme 直置きツールバー（`viewerToolbar`）を追加。

### 変更

- Web Component 基底クラスを SSR/Node 環境向けに安全化（`HTMLElement` 未定義時に class 定義が throw しないようガード）。
- 既定のエディタロゴを camel ブランディング（`camel_markdown.png`）に変更。

### 修正

- read-only ビューで狭幅時に本文が折り返されない不具合を修正。
- `anytime-markdown-view` を chromeless（ツールバー非表示）の read-only 表示に戻し、React 除去前と同一の見た目に修正。

## [1.1.0] - 2026-06-13

### 追加

- エディタ本文デザインをデザインシステム仕様へ整合（余白・measure・スクロールバー・focus リング統一）。
- 本文 measure（折返し幅）の既定値を 1000px へ変更。

### 変更

- TypeScript 6.0.3 へアップグレード（モノレポ全体のツールチェーン更新・bundle config の dedup）。

### 修正

- a11y 改善: タップターゲットを 44px 以上に引き上げ、focus リングを統一し、フォントサイズ上限を拡張。
- ダークモードで右サイドツールバーのアイコンが見えない回帰を修正（`style.color` を `""` でリセットすると UA 既定色の黒に戻る真因を特定し、同型のアイコン色リセット3箇所を `"inherit"` で修正）。
- ブロック編集ツールバーがブロック本体に重なる回帰を修正（不透明フロートへ変更）。
- `markdown-rich`: mermaid プレビューがダークモードでライト色になる回帰を修正。
- `markdown-rich`: 図ブロック編集ダイアログの白背景とタブ行レイアウト崩れをダークモードで修正。
- more メニューの「バージョン情報」がダイアログを開かない配線漏れを修正。

## [1.0.0] - 2026-06-12

### 変更

- **エディタコアから React を完全排除。** 全 NodeView（footnote・gif・image・table）とエディタ chrome（オーバーレイ・Dialog・設定パネル・UI プリミティブ）を React 非依存の native/vanilla 実装へ移行。エディタ本体と `markdown-rich` は React-free。
- ブロック編集オーバーレイを共通 vanilla scaffolding（`useBlockChrome` シェル・ポータル self-append 契約の統一）で再構築し、chrome シームを正式な vanilla host インストーラ/オーケストレータへ昇格。
- 自前 vanilla UI プリミティブキット（30 種超）を新設し、3 consumer の旧 React ラッパを全置換。
- `markdown-rich` のコードブロックを反転アーキテクチャの native content NodeView 化（string/embed/math-graph プレビュー + 全画面編集ダイアログ）。
- React island（embed/graph プレビュー）をレジストリ注入で別パッケージ `markdown-react-islands` へ分離し、viewer/rich コアを React-free 化。

### 削除

- 旧 React エディタ実装（136 ソース・27 CSS・148 テスト）を削除し、`markdown-react` パッケージを撤去。

### 修正

- vanilla 経路に `.tiptap` コンテンツ CSS を移植し、見出し装飾の消失を修正。
- vanilla 経路のスラッシュコマンドメニュー（テンプレート含む34コマンド）・検索/置換バー（Mod+F）・アウトライン折りたたみの editor 同期（段階展開）・サイド/トップツールバーのビュー切替排他を復元。
- 空コードブロックの可視性（block 化 contentDOM）とダークモードトグルの `role="switch"` を復元。
- vanilla host の beforeunload 警告・comment ダイアログ配線・readOnly 再チェックを復元。
- merge ソースモードの末尾改行欠落を修正し、compare モードのコードブロック編集を両エディタへ復元。
- ショートカット・ヘルプ導線・StatusBar 特定・mount エラーフォールバックを vanilla 経路で復元。
- `update(externalCompareContent)` の null クローズと遷移検知を修正。
- `ui/GlobalStyle` で MUI `sx` ショートハンドを展開し、見出し hover ラベル消失の回帰を修正。

## [0.18.0] - 2026-06-08

### 変更

- エディタ chrome から `@mui/material`・`@mui/icons-material` を全廃し、自前 `ui/` プリミティブキット（レイアウト・ボタン・フォーム・フィードバック・オーバーレイ・Dialog・Tooltip・Menu・Drawer・Popover・Select）と vendored アイコンへ置換（MUI 削減 Phase3a/3b）。
- MUI `GlobalStyles` を stylis ベースの `ui/GlobalStyle` へ、`useTheme`・`useMediaQuery` を自前 `ThemeModeContext`（`useIsDark`）・メディアクエリフックへ置換。
- peerDependencies から `@mui/*`・`@emotion/*` を削除し、テストからも `@mui` 依存を除去。

### 修正

- 比較モードで imageRow バッジが縦並びになる不具合を修正。

## [0.17.0] - 2026-06-03

### 変更

- フレームワーク非依存の `diffEngine` と sanitize クラスタを新パッケージ `@anytime-markdown/markdown-engine` へ抽出。`sanitizeMarkdown` を DOM 非依存化。
- 共有のエディタテーマ CSS 変数インジェクタ (`applyEditorThemeCssVars`) と Tiptap コンテンツスタイル合成を抽出し、比較モードのスタイルを通常エディタと統一。
- `Extension` の import を `@anytime-markdown/markdown-core` に向ける。

### パフォーマンス

- キーストロークパスから `onUpdate` の全文シリアライズを遅延。
- 図表集計をプラグイン状態にキャッシュしツールバーで再利用。

### 修正

- imageRow の flex レイアウトを比較ビューと共有 (リグレッション)。
- React ノードビューの `renderer` フィールドを宣言し、SWC のクラスフィールドリセットでも保持 (markdown-core リグレッション)。

## [0.16.0] - 2026-05-31

### 変更

- パッケージ名を `@anytime-markdown/markdown-core` から `@anytime-markdown/markdown-viewer` へ改名。
- vendored Tiptap v3.20.0 へ移行: `@tiptap/*` の import は npm パッケージではなく `@anytime-markdown/markdown-*` の vendored 名前空間に解決される。`prosemirror-tables` は `@tiptap/pm/tables` 経由で import。
- リッチコードブロッククラスタ（図表・PDF ダーク図表レンダリング）を `@anytime-markdown/markdown-rich` へ移設し、該当 re-export を公開 API から削除。`codeBlock` 拡張は `getBaseExtensions` で注入する。`markdown-rich` 向けに共有 API を公開。

## [0.15.6] - 2026-05-27

### 変更

- SonarCloud コード品質改善: 不要な型アサーションの除去 (S4325)、S4624 / S2004 / S4043 / S7744 / S3735 の修正。機能変更なし。

## [0.15.5] - 2026-05-24

### 追加

- ランディングフッターの mindmap viewer リンク用 i18n ラベルキーを追加（en.json / ja.json）

## [0.15.4] - 2026-05-21

### 変更

- `markdown-core` 全体の SonarCloud 指摘を解消（S7780 `String.raw`・S6582 オプショナルチェーン・S6653・S7776・S3358 ネスト三項演算子 ほか）

## [0.15.3] - 2026-05-20

### 変更

- `MarkdownEditorPage` のエディタ初期化 effect から `applyInitialFontSizeOnce` / `buildEditorPortalTarget` ヘルパーを抽出し、認知的複雑度を削減（S3776）

### セキュリティ

- Gantt DoS（GHSA-6m6c-36f7-fhxh）および CSS/HTML インジェクション CVE（GHSA-xcj9-5m2h-648r、GHSA-87f9-hvmw-gh4p、GHSA-ghcm-xqfw-q4vr）に対応するため `mermaid` を 11.15.0 へアップグレード

## [0.15.2] - 2026-05-17

### 変更

- クライアント専用コンポーネントを `next/dynamic` から `React.lazy` へ置き換え、`markdown-core` を非 Next ホスト (VS Code webview、VS Code 拡張バンドル) で利用しても Next.js ランタイム依存が混入しないように変更
- AI ノートに関するドキュメントリンクを新規 Anytime Agent 拡張に向け直し

## [0.15.1] - 2026-05-16

### 修正

- テーブルセル本文の `|` を `\|` にエスケープ（カラム区切り破壊を防止）
- `SourceModeEditor` の textarea 高さを mirror と同期させ、エディタ全体を埋めるよう修正
- 画像 URL シリアライズ時のバックスラッシュをエスケープし、生 markdown のラウンドトリップを保証
- silent な mode 切替失敗を握り潰さずログ出力

### 変更

- `markdown-core` から不要な `spreadsheet-core` 依存を削除

### セキュリティ

- 4 件の webview message listener でイベント処理前に message origin を検証

### 変更

- `markdown-core` を自己完結 i18n に移行 (`trail-viewer` 等の i18n を参照しない)
- パッケージ公開 API 経由でメッセージを公開し、サーバーバンドルから client-only 依存を排除

### 修正

- 非ブラウザバンドルでの `navigator` アクセスと動的 import 解決の不整合を修正
- `mcp-markdown` の `server.tool()` 呼び出しをラップして MCP SDK の TS2589 深さエラーを抑止
- `updateSection` のエッジケースと統合 sanitize のテストカバレッジを強化

## [0.14.1] - 2026-05-06

### 修正

- admonition の初期表示崩れと末尾改行累積を解消

### セキュリティ

- CodeQL 検出の remote-property-injection / log-injection を修正

### 変更

- `ssrfGuard`・`embedSeenStore`・`embedCache` のテストカバレッジを向上

## [0.14.0] - 2026-05-04

### 修正

- admonition シリアライザに未知ノード型へのフォールバックを追加
- React コンポーネントの props を `Readonly` でラップ（Sonar S6759）
- 不要な型アサーションを削除（Sonar S4325）
- グローバル `parseInt`/`parseFloat` を `Number.parseInt`/`Number.parseFloat` に置換（Sonar S7773）
- 否定条件の三項演算子を反転して可読性を向上（Sonar S7735）
- リテラルパターンの `replace` を `replaceAll` に置換（Sonar S7781）

### 変更

- `parseTagAttributes`・`classifyEmbedUrl`・`parseEmbedInfoString`・`isPrivateAddress` からヘルパー関数を抽出して認知的複雑度を削減（Sonar S3776）
- `TableNodeView`・`ImageNodeView` のアクション/ダイアログヘルパーを抽出（Sonar S3776）
- コードブロック拡張の図種・ツールバーヘルパーを抽出（Sonar S3776）
- プラグインの `applyDropAction` からドロップヘルパーを抽出（Sonar S3776）
- `MarkdownEditorPage` のハンドラ三項演算子を変数に抽出（Sonar S3776）
- `window.localStorage` を `globalThis.localStorage` に置換（Sonar S7764）
- 配列インデックスキーを安定した複合キーに置換（Sonar S6479）

## [0.13.4] - 2026-05-02

### 修正

- admonition の改行シリアライズをべき等（idempotent）に修正

### 変更

- Press ページ向け i18n 文字列（en/ja）を更新

## [0.13.3] - 2026-04-28

### 修正

- 埋め込み抜粋抽出と OGP/frontmatter 解析で、正規表現バックトラッキングによる Hotspot（`S5852`）を回避
- コメントシリアライズ時のエスケープ処理と正規表現リテラルを見直し、Sonar 指摘（`S7780`）を解消
- RSS 解析を `@xmldom/xmldom` の最新ハンドラ型に合わせ、フィード解析の互換性を維持

## [0.13.2] - 2026-04-26

### 修正

- admonition ブロック内でバックスラッシュが増幅するバグを修正

### 変更

- `ReadonlyToolbar` からダーク/ライトモード切り替えアイコンを削除

## [0.13.1] - 2026-04-25

### 変更

- Anytime Trail LP の利点テキストを「構造可視化 / 動作可視化 / 品質可視化」フレームで刷新

## [0.13.0] - 2026-04-24

### 追加

- 埋め込みブロック基盤: URL 判定、info string パーサー、SSRF ガード、`EmbedProvider` インターフェース
- `EmbedProviders` コンテキストと `useEmbedData` フック（LocalStorage キャッシュ、同一 URL リクエストの in-flight 重複排除）
- 埋め込みノードビュー: `OgpCardView`（card / compact）、`YouTubeEmbedView`、`FigmaEmbedView`、`SpotifyEmbedView`、`TwitterEmbedView`（widgets.js）、`DrawioEmbedView`
- `EmbedNodeView` ディスパッチャと codeBlock → `EmbedBlock` のルーティング
- `/embed` スラッシュコマンドと埋め込み編集ダイアログ
- 埋め込み更新検知: `embedSeenStore`、OGP / RSS フィンガープリントユーティリティ、`rssDiscovery`、`rssParser`、`fetchRss` プロバイダ IF、`embedUpdateCheck` エントリポイントとバッジ UI
- ツイート HTML サニタイザー、OGP HTML パーサー
- 埋め込みカードバリアントの image スタイル幅リサイズ（info string に幅を永続化）

### 修正

- 埋め込み info string を Markdown ラウンドトリップで保持するように修正
- 埋め込みブロックの幅指定を `inline-block` / `fit-content` から `block` に戻す
- `imageRow` を grid から flex に変更し、内側 Box に `fit-content` を適用して隙間を解消
- Web Crypto API を直接使用し、jsdom の `TextEncoder` / `crypto` をポリフィル

### 変更

- 埋め込み更新検知の内部実装を整理

## [0.12.0] - 2026-04-23

### 追加

- `MarkdownMinimap` コンポーネント: スクロール同期ビューポートインジケータ付きドキュメントミニマップ（クリックでジャンプ）
- `useMarkdownMinimap` フック: 見出し・diff マーカーの位置をスクロール比率リストとして計算

### 修正

- ミニマップのスクロールコンテナが `.tiptap` 要素を正しく追跡するよう修正
- ミニマップがスクロールバーに重ならないよう修正
- ミニマップのビューポートインジケータを削除

### 変更

- スプレッドシート機能を `@anytime-markdown/spreadsheet-core` / `@anytime-markdown/spreadsheet-viewer` の 2 パッケージに切り出し
- `TableNodeView` を `SheetAdapter` interface 経由に変更（`createTiptapSheetAdapter`）
- `components/spreadsheet/` と `utils/tableHelpers.ts` の tiptap table 操作ラッパー `useSpreadsheetSync` を削除
- viewer 専用 i18n キーを `spreadsheet-viewer` に移動し、`markdown-core/i18n/index.ts` でマージしてエクスポート
- デザインシステムテーマに sumi-e ライトパレットと violet warning カラーを適用
- `TableNodeView` スプレッドシートエディタで `showApply` / `showRange` を有効化

## [0.11.4] - 2026-04-19

### 追加

- Trail Viewer・Markdown Editor CTA リンクのラベル・説明文 i18n キーを追加（日本語・英語）

## [0.11.3] - 2026-04-18

### 追加

- ファイルオープン時にフロントマターをデフォルトで折りたたむ

### 変更

- Note treeview を削除（vscode-trail-extension へ移動）

## [0.11.2] - 2026-04-12

### 修正

- `trail-core/src/c4/coverage/` ソースファイルをバージョン管理から除外してしまう `.gitignore` パターンを修正

## [0.11.1] - 2026-04-12

### 変更

- E2E カバレッジ連携のため jest `coverageReporters` に `json-summary` を追加
- i18n 文字列の軽微な修正

## [0.11.0] - 2026-04-11

### 変更

- TableNodeView・MathBlock・MarkdownEditorPage・ImageNodeView・DiagramBlock の認知的複雑度を低減（SonarCloud S3776）
- tableCellModeKeymap・tableCellModeMouse・tableCellModeClipboard・handlePaste の認知的複雑度を低減（SonarCloud S3776）

## [0.10.4] - 2026-04-09

### 追加

- Trail ナビゲーションラベル用 i18n 翻訳キー

## [0.10.3] - 2026-04-08

- vscode-markdown-extension とのバージョン同期

## [0.10.2] - 2026-04-07

### 修正

- SonarCloud 指摘事項: ネストされた三項演算子（S3358）、オプショナルチェイニング（S6582）
- 外部コンテンツのペースト時 HTML サニタイズ（セキュリティ）
- C4Model ナビゲーション用 i18n ラベル更新

## [0.10.1] - 2026-04-05

### 修正

- サイドツールバーの枠線欠落を修正
- サイドツールバーとハンバーガーメニューの中心位置を修正

### 変更

- ツールバーのアプリアイコンをハンバーガーメニューに置換

## [0.10.0] - 2026-04-04

### 追加

- PlantUML ソース (.puml) エクスポート
- Mermaid (.mmd) エクスポートと SVG-to-PNG キャプチャ修正

### 修正

- ロゴ画像パスを /help/ から /images/ に更新

### 変更

- markdown-core 全体の ESLint 警告を解消
- 未使用コードの削除

## [0.9.3] - 2026-04-01

### 追加

- 狭い画面での Mermaid 図の横スクロール対応
- エディタ設定に word-break 設定を追加

### 修正

- 読み取り専用モードでの見出しクリック時にアウトラインパネルを閉じる動作とパネル幅を修正

## [0.9.2] - 2026-04-01

### 追加

- エディタモード状態管理用の EditorModeContext を追加
- アウトラインパネルの段階的展開と狭いビューポートでの自動閉じ
- 狭いビューポートでアウトライン/コメントパネルをオーバーレイ表示

### 変更

- リファクタリング: エディタ DOM ハンドラ、クロップユーティリティ、マージフック、PDF エクスポート、通知管理を分離
- リファクタリング: `(window as any).__vscode` を型付きプロトコルに置き換え

### 修正

- テーブルセルの高さを削減（パディング除去、行高さ低減）
- アウトラインパネルから見出し選択時にビューポート中央に表示
- テキストハイライトマークのスタイルをデザインシステムに統一
- インラインテーブルでのカーソル位置決めとセルハイライトを修正

### セキュリティ

- CodeQL コードスキャンアラートを解決（TOCTOU、origin チェック、不要な条件分岐、未使用変数）

## [0.9.1] - 2026-03-30

### 追加
- レスポンシブツールバー: 狭い画面（900px以下）での折りたたみレイアウト
- 全ブロック編集ダイアログにApplyボタンと破棄確認ダイアログを追加
- 全ブロックタイプでApply時にフルスクリーン編集を自動クローズ
- スプレッドシート: クリップボード対応、範囲選択、列フィルタ、グリッドサイズ設定
- スプレッドシート: Applyボタンと破棄確認ダイアログ

## [0.9.0] - 2026-03-29

### 追加
- スプレッドシートモード: Canvas ベースのグリッド描画によるフルスクリーンテーブル編集
- スプレッドシート: 固定/自動モード対応のセルサイズ設定ダイアログ
- スプレッドシート: ツールバー連携によるセル単位のアライメント
- スプレッドシート: ProseMirror 変更同期による Undo/Redo
- スプレッドシート: 複数行・複数列の範囲選択
- スプレッドシート: 行・列のドラッグ並べ替え
- スプレッドシート: データ範囲ボーダーのドラッグリサイズ
- スプレッドシート: 行・列操作のコンテキストメニュー
- テーブルセルモード: キーボードナビゲーション・編集モード・クリップボードハンドラ
- 数式グラフ可視化: LaTeX 式変換、JSXGraph/Plotly レンダリング
- 物理エンジン: フォースレイアウト、衝突検出、Fruchterman-Reingold アルゴリズム
- 手書き風テーマプリセット（見出し・アドモニション・ダイアグラムの手書きスタイル）

### 変更
- スプレッドシート: グリッド描画を DOM から Canvas に書き換え（パフォーマンス改善）
- デフォルトテーマプリセットを手書き風に変更
- 埋め込みテンプレートファイルを更新

### 修正
- スプレッドシート: Undo/Redo のキー転送（Ctrl+Z/Y）と同期タイミング
- スプレッドシート: Canvas 右クリック時のコンテキストメニュー抑制
- スプレッドシート: データ範囲初期化とセルグリッド線
- テーブル: ナビゲーションモードでの TextSelection 位置
- Mermaid SVG レンダリングの改善
- 言語未指定コードブロックの自動ハイライトを無効化
- SonarCloud 軽微な指摘を修正

## [0.8.5] - 2026-03-28

### 追加
- 外部/base64 画像の貼り付け時にローカル保存する機能（VS Code 連携）

### 変更
- テンプレートファイルのリネームと未使用アセットの削除

### 修正
- VS Code でブロックノード（画像等）のコピー&ペーストが正しく動作しない問題を修正
- GIF 録画で blob URL の代わりに data URL を使用するよう修正（Web アプリ互換性）
- サイドパネル（コメント、アウトライン、EditorSideToolbar）のボーダー表示を修正

## [0.8.4] - 2026-03-28

### 追加
- `showFrontmatter` prop: エディタでのフロントマター表示/非表示制御
- エディタコンテキストメニューに「画面クリア」オプション
- ReadonlyToolbar: ダーク/ライトモード切替・テーマスタイル切替アイコン
- EditorFeaturesContext: 機能フラグ（jsxgraph/plotly 除外対応）

### 変更
- Claude 編集インジケータをレイアウトシフトしない固定オーバーレイバーに変更
- Claude 編集オーバーレイを core から vscode-extension に移動（責務分離）
- Claude Code 編集ロック中は ReadonlyToolbar を非表示に変更

### 修正
- MUI Menu の Fragment children 警告を解消（EditorContextMenu、ToolbarFileActions、ToolbarMobileMenu）
- `latexToExpr` の sort() で localeCompare を使用するよう修正
- StatusBar の aria-label から不要な条件分岐を除去

### セキュリティ
- NEXT_LOCALE cookie に Secure 属性を追加
- `importDrawio` の多文字 HTML サニタイズの不完全性を修正

## [0.8.3] - 2026-03-27

### 追加
- Math Graph: LaTeX 数式のグラフ可視化（JSXGraph、Plotly.js）
- Math Graph: LaTeX から math.js 式への変換とグラフ種別の自動検出
- Math Graph: ResizeObserver を使用したフィルモードによるフルスクリーングラフプレビュー
- 手書き風テーマプリセット（手書き風見出し、アドモニション、ダイアグラム）

### 変更
- デフォルトテーマプリセットを手書き風に変更

## [0.8.2] - 2026-03-25

### 修正
- Mermaid: テーマ変更時に古い SVG をクリアしてから再レンダリングするよう修正
- ライトモードの配色と PDF エクスポートの改善

## [0.8.0] - 2026-03-25

### 変更
- パッケージ名を `editor-core` から `markdown-core` に変更

## [0.7.6] - 2026-03-22

### 追加
- スラッシュコマンド: mermaid、PlantUML、math、HTML、GIF ブロックでフルスクリーン編集ダイアログを自動表示
- スラッシュコマンド: frontmatter が yaml コードブロックではなく正しい `---` フェンス形式を出力するよう対応
- スラッシュコマンド: 脚注に連番を使用し、定義をドキュメント末尾に自動追加
- ブロック引用内の Tab/Shift+Tab でネスト/アンネスト（最大6階層）
- エディタからツールバーへの Tab キーフォーカス移動を抑制

### 変更
- アドモニションスラッシュコマンドのラベル: 「Callout」接尾辞を削除（日本語）、「Admonition」に置換（英語）

### 修正
- アドモニションスラッシュコマンドが admonitionType 属性を正しく設定するよう修正
- HTML ブロックのフルスクリーンプレビュー背景をエディタテーマに統一

## [0.7.1] - 2026-03-22

### 変更
- ブロック要素の配置を text-align + inline-block パターンに統一（画像、PlantUML、Mermaid、math）
- SonarQube 588件の CODE_SMELL 修正（Cognitive Complexity、readonly、optional chaining 等）

### 修正
- closest() の戻り値の型キャストによる dataset アクセスの修正

## [0.7.0] - 2026-03-21

### 追加
- ブロック要素の左側に GapCursor を表示（ArrowUp/Down/Left/Right + Enter）
- ImageCropTool によるトリミング付きスクリーンキャプチャ（Screen Capture API）
- ImageCropTool: トリム領域の移動とリサイズ（8方向ハンドル）、リアルタイムのサイズ・容量表示
- ソースモード: base64 画像データの折りたたみ
- 外部変更に対する自動リロードトグル
- Alt+F5 による順次ジャンプと ESC リセット付きの変更ガター強調表示
- MarkdownViewer コンポーネント（読み取り専用表示、ロケール切替、フォントサイズ切替）

### 変更
- ブロックハンドルバー: ラベルと編集アイコンの間にセパレータを追加
- 画像ハンドルバー: 編集アイコンをアノテーションの前に移動
- フォントサイズを constants/dimensions.ts に集約（28定数）

### 修正
- GapCursor がブロック要素の直左に配置されるよう修正
- 初期モードをレビューから編集に変更
- テーマをエディタ設定で排他的に制御するよう修正

### セキュリティ
- 正規表現バックトラッキング脆弱性の修正（SonarQube Hotspots MEDIUM 7件）
- SonarQube BLOCKER: 常に同じ値を返す関数の修正（7件）
- SonarQube CRITICAL: Cognitive Complexity の削減（34関数をリファクタリング）

## [0.6.5] - 2026-03-20

### 変更
- アドモニションスタイルを GitHub 準拠に変更
- MUI テーマカラー参照を定数ヘルパーに置換（253箇所）

### 修正
- テーブルテキスト選択時の Ctrl+C/X が選択範囲ではなくテーブル全体をコピーする問題を修正
- アドモニションの連続表示とテンプレート挿入の問題を修正

### セキュリティ
- ReDoS 脆弱性のある正規表現を線形時間パーサーに置換

## [0.6.4] - 2026-03-20

### 追加
- 用紙サイズ表示（A3/A4/B4/B5、余白調整、エディタ設定でのトグル）
- スラッシュコマンドによるテンプレート挿入（Welcome、Markdown All 等）
- サイドツールバーにエディタ設定ボタンを追加
- スラッシュコマンドメニューのスクリーンリーダー向け結果件数通知
- localStorage ラッパー（`safeSetItem`）による容量超過ハンドリング

### 変更
- ツールバーの高さを 44px に固定
- スクロールバーを細く丸みのあるスタイルに変更

### 修正
- スクロールバーとインラインコードの色コントラストを WCAG AA 準拠に修正
- ConfirmDialog の autoFocus をアラート/非アラートで分離
- 読み取り専用モード: 保存と名前を付けて保存を無効化

## [0.6.3] - 2026-03-20

### セキュリティ
- Base URI XSS 脆弱性の修正（URL オブジェクト正規化 + スキームホワイトリスト、CodeQL CWE-79）
- gif-settings 抽出の ReDoS 修正（正規表現 → indexOf 線形時間パーサー）
- 見出しパーサーの ReDoS 修正（`\s+` → 単一スペース）

### 変更
- テンプレートファイル名の変更（defaultContent → welcome）、markdownAll テンプレートを追加
- 見出しスタイルを左ボーダー + グラデーション背景に変更

## [0.6.1] - 2026-03-20

### 追加
- GIF レコーダーブロック: スクリーンキャプチャ → 矩形選択 → 録画 → アニメーション GIF（`/gif` スラッシュコマンド）
- ブロック要素のキャプチャ保存: ハンドルバーのカメラアイコンから PNG/SVG/GIF を保存
- ブロックレベル Ctrl+C/Ctrl+X: コードブロック、テーブル、GIF をブロック構造を保持したままコピー/カット
- 右クリックメニューのブロック対応: ブロック要素内でのカット/コピーを有効化
- スラッシュコマンド: `/h4`、`/h5`、`/image`、`/frontmatter`

### 変更
- クリップボード操作を `clipboardHelpers.ts` に集約
- ブロッククリップボード操作を `blockClipboard.ts` に集約

### 修正
- GIF エンコーダーをカスタム実装に置換（gif.js Web Worker CSP ブロック対策）
- ソースモード切替時の GIF ブロック/gif-settings 消失を修正
- HTML プレビューキャプチャを直接 SVG 保存に変更（foreignObject tainted canvas 回避策）

## [0.6.0] - 2026-03-19

### 追加
- 画像アノテーション: 矩形/円/線とコメントの SVG オーバーレイ（解決/削除、コメントパネル連携）
- 画像クロップ: ドラッグ選択によるトリミング（Base64/リンク画像の分岐保存）
- 画像リサイズ: プリセットボタン（25%-200%）
- 画像エディタ: ルーラー（ピクセルスケール）とグリッド線
- セマンティック比較: 見出しベースのセクション LCS マッチングと差分表示（トグル）
- コンテキストメニュー: カット/コピー/ペースト/Markdownとしてペースト/コードブロックとしてペースト（ショートカット表示付き）
- 罫線テーブル（Unicode）のペースト時 Markdown テーブル自動変換
- キーボードショートカット: Alt+Arrow（ブロック移動）、Shift+Alt+Arrow（ブロック複製）、Ctrl+Enter/Shift+Enter（空行）、Ctrl+L（行選択）、Ctrl+D（単語選択）、Tab/Shift+Tab（見出しレベル）
- React Error Boundary（role="alert"、リロードボタン）

### 変更
- EditorMainContent を EditorContentArea / EditorMergeContent / EditorSideToolbar に分割
- コンテキスト値を useMemo でメモ化、セクション番号ロジックをフックに抽出
- isEditable アクセスを統一（useCurrentEditor フック）
- 比較モード左側ブロック要素: レビューモードでツールバー非表示、編集モードで選択時ラベルのみ表示

### 修正
- セマンティック差分の行番号計算（パディング行の除外）
- ソースモード切替時の画像アノテーション消失（Markdown 末尾ブロック保存）
- Base64 画像アノテーション保存時のクラッシュ（indexOf ベースの検索）

### セキュリティ
- CSP base-uri ディレクティブの追加（javascript: スキームインジェクション防止）
- Webview メッセージのランタイム型ガード（TypeScript 型アサーション → typeof チェック）

## [0.5.2] - 2026-03-17

### 追加
- フルスクリーンテーブル比較: 左パネルでのセルレベル差分ハイライト
- 比較モード左側（ソース）ブロック要素: 編集アイコン非表示

### 変更
- パネルヘッダーの高さを統一（アウトライン、コメント、エクスプローラー）
- ハードコード値を定数に集約（PANEL_HEADER_MIN_HEIGHT 等）

### 修正
- フルスクリーンテーブル比較の左右判定をエディタインスタンス比較で修正

## [0.5.1] - 2026-03-15

### 追加
- セクション番号の挿入/削除（アウトラインパネルアイコン、H1-H5、ソース直接書き込み）
- 連続テキスト行への改行（ハードブレーク）自動付加
- Excel/Google Sheets テーブルペースト対応（セル内改行 → `<br>`）

### 変更
- セクション番号の自動表示を廃止し、明示的な挿入/削除操作に変更
- テキスト書式のキーボードショートカットを無効化（代わりにバブルメニューを使用）

### 修正
- 初回ロード時の Tiptap 正規化によるファイル書き戻しを抑制
- テーブルセルの改行 `\\` 出力がテーブル行を破壊する問題を修正（→ `<br>`）
- Excel ペーストがテーブルではなく画像として挿入される問題を修正（text/html 優先）
- テーブル外側の背景色不一致を修正

### 削除
- Details/Summary（折りたたみブロック）
- インライン数式（$...$）

### セキュリティ
- fetchFromCdn SSRF 緩和策（URL 再構築）

## [0.5.0] - 2026-03-15

### 追加
- 全ブロックタイプ対応の統一フルスクリーンブロック編集ダイアログ（コード/Mermaid/PlantUML/math/HTML/テーブル/画像）
- Mermaid/PlantUML: コード/設定タブによる設定編集の分離
- 全ブロック編集ダイアログでのライブプレビュー（シンタックスハイライト/SVG/画像/KaTeX/DOMPurify）
- 全ブロック編集ダイアログでのズームとパン（ボタン/ホイール/ドラッグ）
- サンプル挿入パネル（Mermaid 23種/PlantUML 12種/Math 7種/HTML 6種/コード 24言語）
- 全ブロック編集ダイアログでの行番号と Tab インデント
- ダイアグラム/数式/HTML インラインプレビューのリサイズグリップ
- テーブル編集ダイアログ: サイドバイサイド比較モード
- HTML ブロック編集ダイアログ: 比較モードでのコード差分
- ダイアグラム/数式/HTML のダブルクリックでブロック編集ダイアログを開く
- 編集ダイアログヘッダーにブロック固有アイコンを表示

### 変更
- 「フルスクリーンビュー」を「ブロック編集ダイアログ」に名称変更
- インラインツールバーアイコンをフルスクリーンから編集に変更
- テーブル操作アイコンをインラインからブロック編集ダイアログに移動
- コードコピーボタンをブロック編集ダイアログのコードツールバーに移動
- 閉じるボタンの位置をラベルの左側に統一
- シンタックスハイライトの配色を GitHub スタイルに統一
- マージ操作を右から左方向のみに制限
- 共通コンポーネントを抽出: EditDialogHeader、EditDialogWrapper、ZoomToolbar、SamplePanel、DraggableSplitLayout、ZoomablePreview、BlockInlineToolbar、ResizeGrip、useBlockResize、useBlockNodeState
- マジックナンバーとスタイルパターンを定数に集約（dimensions.ts、uiPatterns.ts）

### 修正
- 印刷: 2ページ以降の切れと PlantUML コードの折りたたみを修正
- ステータスバーを position:fixed で下部に固定
- Frontmatter 表示/非表示時のエディタ高さ再計算を修正
- コードブロックプレビューの highlightedHtml に DOMPurify サニタイゼーションを適用

## [0.4.0] - 2026-03-11

### 追加
- アウトラインパネルの折りたたみ/展開トグル
- アウトラインセクション番号の自動表示
- sanitizeMarkdown ユニットテスト（50テスト）
- BoundedMap ユーティリティ（サイズ制限付き FIFO エビクション Map）

### 変更
- パネル背景色を OutlinePanel、CommentPanel、LinePreviewPanel 間で統一
- EditorToolbar を分割（588→393行、ToolbarFileActions と ToolbarMobileMenu を抽出）
- MergeEditorPanel と InlineMergeView を500行以下に分割
- EditorToolbar の props を集約（48→17 props）
- ソース→WYSIWYG 同期ロジック: 3つの重複を共通関数に抽出

### 修正
- svgCache / urlCache の無制限増大を防止
- Frontmatter 表示時のエディタ高さの切れを修正

### セキュリティ
- PlantUML URL オリジン検証（SSRF 防止）
- HTML タグ除去を正規表現から DOMParser.textContent に変更
- commentHelpers の正規表現を indexOf に置換（ReDoS 防止）
- fetchFromCdn URL オリジン検証（SSRF 防止）

## [0.3.0] - 2026-03-10

### 追加
- YAML frontmatter の認識、保持、編集（WYSIWYG でのコードブロック風表示）
- 設定パネルでのブラウザスペルチェック設定
- Frontmatter 削除確認ダイアログ

## [0.2.8] - 2026-03-09

### 追加
- フルスクリーンコード比較: 行レベルマージ（Mermaid/PlantUML/コードブロック/Math）
- 比較モード: コードブロックフルスクリーンでサイドバイサイド比較を表示
- 比較モード: 左エディタのブロック展開/折りたたみを右エディタと同期
- 読み取り専用/レビューモード: カーソル表示とテキスト選択を有効化

### 修正
- テンプレート挿入: 連続する空行の圧縮
- 比較モード切替: NodeView（ダイアグラム、画像、テーブル）の消失を修正

## [0.1.0] - 2026-03-06

### 追加
- 表示モード（読み取り専用ブラウジング + アウトライン改善）
- `#L` 行番号ナビゲーション

### 修正
- ZWNJ タイトトランジションマーカーの間隔を修正
- 連続段落行のラウンドトリップマージを防止
- 見出し-リストおよびブロック-リストの間隔を保持

## [0.0.11] - 2026-03-04

### 追加
- インラインコメント（範囲選択 + ポイントコメント、解決/再開/削除）
- Callout 拡張（[!NOTE]、[!TIP]、[!IMPORTANT]、[!WARNING]、[!CAUTION]）
- 脚注参照拡張（[^id] 構文）
- セクション自動番号付け拡張
- コードブロックシンタックスハイライト（lowlight）
- スラッシュコマンドによるブロック挿入

## [0.0.9] - 2026-03-03

### 追加
- KaTeX 数式レンダリング（インラインおよびブロック）
- LaTeX テンプレート挿入用の数式サンプルポップオーバー
- 数式と日付のスラッシュコマンド
- 見出しからの目次自動生成
- エンコーディング変換メニュー
- 改行コード変換メニュー

## [0.0.7] - 2026-03-01

### 追加
- ブロック挿入用スラッシュコマンドメニュー
- PDF エクスポート（@media print スタイル）
- Mermaid/PlantUML ダイアグラムのリサイズハンドル
- ダイアグラムコードのデフォルト折りたたみ表示
- コードブロックコピーボタン
- HTML サンプルポップオーバーとツールバー挿入ボタン

## [0.0.1] - 2026-02-26

### 追加
- WYSIWYG Markdown エディタ（Tiptap ベース）
- ソースモードトグル
- 比較（マージ）モード: サイドバイサイド差分、行レベルマージ、ブロックレベル差分ハイライト
- テキスト書式: 太字、斜体、下線、取り消し線、ハイライト
- 見出し: H1-H5
- リスト: 箇条書き、番号付き、タスク
- ブロック要素: ブロック引用、コードブロック（シンタックスハイライト）、水平線
- テーブル: 挿入、行/列の追加・削除
- 画像: 相対パス解決、ドラッグ＆ドロップ、クリップボードペースト
- リンクダイアログ: 挿入/編集/削除（Ctrl+K）
- Mermaid / PlantUML ダイアグラム: ライブプレビューコードブロック
- 検索と置換（Ctrl+F / Ctrl+H）: 大文字小文字区別、単語一致、正規表現
- アウトラインパネル: 見出しのドラッグ＆ドロップ並べ替え、折りたたみ
- テンプレート挿入
- バブルメニュー: テキスト選択時のフローティング書式メニュー
- ステータスバー: 行番号、文字数、行数
- キーボードショートカット
- 大容量ファイル（100KB以上）のデバウンス最適化
