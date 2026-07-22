# 変更履歴

この拡張機能に対するすべての重要な変更はこのファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.12.0] - 2026-07-22

### 追加

- ワークスペース内の `.cooc.json` 共起ネットワークを一覧するアクティビティバービューを追加。項目を選択すると共起ネットワークエディタで開く。ワークスペースに 1 件も無い場合は「新規作成」の viewsWelcome を表示し、FileSystemWatcher（作成・削除）で一覧を追随させる。
- `anytime-graph.refreshNetworks` コマンドと、新ビューのタイトルバーの更新ボタンを追加。

### 変更

- **破壊的変更:** `.graph` の汎用グラフエディタを廃止し、`.cooc.json` の共起ネットワーク専用エディタへ置き換え。
- **破壊的変更:** `.graph` ファイルを開くと、無言で開けなくなるのではなく移行案内を表示するようにした。汎用グラフエディタは引き続き Web アプリの `/graph` で利用可能。
- **破壊的変更:** 作成コマンドを `anytime-graph.newGraph` から `anytime-graph.newCooccurrence` へ改名。旧 ID を参照するカスタムキーバインドは更新が必要。
- エディタの webview を vanilla JS へ作り替え、React と `graph-viewer` への依存を除去。保存は `WorkspaceEdit` によるドキュメント編集として反映されるため、未保存の印・元に戻す・差分表示が VS Code の標準機能として働く。
- 拡張機能の表示名とアクティビティバーのビューコンテナタイトルを「Anytime Graph」に統一（ja/en 両方）。各ビュー・各カスタムエディタの表示名（「共起ネットワーク」等）は据え置き。
- webview のビルド（webpack）に型チェックを追加（従来は transpile のみで、未定義変数等のバグがコンパイルを通過していた）。あわせて graph-core への DOM 依存な import 経路を避けたことで、パッケージ後の webview バンドルが 607KB から 172KB へ縮小。

### 修正

- PNG 書き出しの失敗が無言で握り潰されていた問題を修正。書き込み失敗時は利用者へ伝わるようにした。
- 新規共起ネットワーク作成時に、同じパスの既存ファイルを無確認で空の内容へ切り詰めていた問題を修正。上書き前に確認ダイアログを表示し、パス区切りや `..` を含む不正なパスは拒否する。

### Graph Core (graph-core)

- 共起ネットワーク図種・`.cooc.json` スキーマ検証・Barnes-Hut レイアウト・絞り込みと編集操作、および共起ネットワークビューア（描画コア・フィルタ/語一覧パネル・レイアウト Worker・i18n・Web アプリ `/cooccurrence`）を追加。
- 孤立語の発散・入力検証漏れ・`node:crypto` 依存によるビルド失敗・クラスタ絞り込みの不具合・Worker 未終了や中断処理まわりの不具合・右サイドパネル下部の到達不能を修正。
- ビューアの描画を要求時のみに変更（アイドル時の負荷を削減）。

## [0.11.1] - 2026-07-13

### Graph Core (graph-core)

- `parseGraphDsl` の causal-loop リンク行パーサの ReDoS を解消しました。

## [0.11.0] - 2026-07-11

### Graph Core (graph-core)

- ノート網パネルを graph-core へ抽出し、閲覧専用オプションを追加。

## [0.10.0] - 2026-07-09

### 追加

- グラフエディタの右クリックコンテキストメニュー: 切り取り / コピー / 貼り付け / 削除と選択操作をキャンバスへ配線。Paste は `Ctrl+V` と揃えて常時有効化し、メニューはビューポート内へクランプする。

### 修正

- メニュー本体を backdrop の前面へ描画（z-index 未指定で項目がクリックできなかった）。
- 未配線の `ContextMenu` ハンドルを削除 (CodeQL js/property-access-on-non-object)。

### Graph Core (graph-core)

- 常に同じ値を返していた三項演算子を除去 (Sonar S3923)。

## [0.9.0] - 2026-06-30

### Graph Core (graph-core)

- 思考法ダイアグラム: `structure-map` 図種を追加。
- FreeMind 風マインドマップレイアウト（中央ルート＋左右バランス展開＋ベジェ曲線）。
- マインドマップ子ノード重なりを修正、エッジ metadata をラベル text へ載せ編集欄をコンパクト化。

## [0.8.0] - 2026-06-20

### Graph Core (graph-core)

- 型付きノート関連付けの語彙（depends-on / implements / part-of / supersedes / refines）と、関係タイプ別のエッジスタイリングを追加。

## [0.7.0] - 2026-06-17

### Graph Core (graph-core)

- 思考法ダイアグラム対応を追加（10 図種のプリセット・DSL パーサ・SVG 描画）。
- フロントマター由来のドキュメントノート網プリセット `buildNoteGraph`、spec→DSL シリアライザ、`node.metadata.path` を追加。

## [0.6.0] - 2026-06-13

### Graph Core (graph-core / graph-viewer)

- グラフエディタから React を完全除去：hooks・ツールバー・キャンバス・パネル・オーバーレイをすべて vanilla 化し、webview バンドルから React を排除。
- `anytime-graph` Web Component（React 非依存配布）を追加し、graph-core の React peer 依存を除去。

## [0.5.1] - 2026-06-13

### 変更

- TypeScript 6.0.3 へアップグレード（モノレポ全体のビルドツールチェーン更新）。

## [0.5.0] - 2026-06-08

### 変更

- `ThemeProvider` を撤去し、`@mui`・`@emotion` 依存を削除。

### Graph Core (graph-core / graph-viewer)

- `graph-viewer`・`graph-core`（`MinimapCanvas`）の `@mui` を自前 `ui/` キットへ置換（MUI 削減 Phase3e）。

## [0.4.1] - 2026-05-27

### Graph Core (graph-core)

- SonarCloud コード品質改善（認知的複雑度削減・機械的安全修正）。

## [0.4.0] - 2026-05-24

### Graph Core (graph-core)

- オーバービュー minimap・折りたたみ可能サブツリー・オプトインのノードドラッグ移動を持つ読み取り専用 `GraphView` を追加
- radial mindmap レイアウトおよび rooted tree レイアウトを追加
- wheel zoom の補正と DPR > 1 環境での hit-test / pan / zoom ずれを修正
- `resolveEdgesForRender` を engine に抽出し O(1) ノード探索に整理

## [0.3.4] - 2026-05-21

### 変更

- `graph-core` 0.3.4 に合わせたバージョン更新（拡張固有のソース変更なし）

### Graph Core (graph-core)

- SonarCloud 指摘を解消（S7769/S7735/S7748/S107 ほか）
- 純ロジックのユニットテストカバレッジを改善（`reducer`・`groupClustering` ほか）
- `mcp-graph`: SonarCloud 指摘を解消（S7772/S7754/S7741/S1128）

## [0.3.3] - 2026-05-20

### Graph Core (graph-core)

- `useCanvasBase` から `deleteGroupsContainingSelection` ヘルパーを抽出し、認知的複雑度を削減（S3776）

## [0.3.2] - 2026-05-17

### 変更

- バージョンアップのみ (0.3.1 から機能変更なし)

### Graph Core (graph-core)

- バージョン同期のみ (機能変更なし)

## [0.3.1] - 2026-05-15

### 変更

- README から廃止された VS Marketplace バッジを削除
- `graph-viewer` を自己完結 i18n に移行 (公開 API 経由でメッセージを参照)

### Graph Core (graph-core)

- 実カンバスを使わない culling / shape / drawHelpers のテストカバレッジを追加

## [0.3.0] - 2026-05-04

### Graph Core (graph-core)

- シーケンス図フラグメント用 `fragment` シェイプを追加
- Sonar 修正: Readonly props（S6759）・型アサーション削除（S4325）・安定キー（S6479）・Number グローバル（S7773）・globalThis（S7764）
- hooks・engine・physics・IO モジュールにわたるヘルパー抽出で認知的複雑度を削減（S3776）

## [0.2.3] - 2026-05-03

### Graph Core (graph-core)

- Ctrl+クリック複数選択トグル用の `onNodeCtrlClick` コールバック
- ホイールズーム動作制御の `wheelRequiresShift` オプション

## [0.2.2] - 2026-05-02

### Graph Core (graph-core)

- ノード選択時に関連しない C4 グラフ要素を減光表示
- ミニマップコントロールの順序・フィットコントロールの配置を改善

## [0.2.1] - 2026-04-24

### 変更

- 拡張アイコンと Marketplace ロゴを `anytime-graph-128` に刷新

### Graph Core (graph-core)

- `splitManualTopBottom`・`packGroupMembers`・ネストしたフレームレイアウトのテストを追加

## [0.2.0] - 2026-04-23

### 追加

- 英語 UI 対応: webview が `vscode.env.language` に応じて日本語／英語を切り替え（書き直した `next-intl` shim で `graph-viewer/src/i18n/` を使用）
- マニフェスト NLS 対応: `package.nls.json` / `package.nls.ja.json` で Marketplace 表示と VS Code UI の言語設定に追従
- `GraphEditor` に `containerHeight` prop を追加

### 変更

- webview を `@anytime-markdown/graph-viewer` パッケージに統合（`PersistenceAdapter` ブリッジ経由）。`GraphCanvas` 等の重複実装を削除

### Graph Core (graph-core)

- ビューポートのドラッグパン・ズームボタン付き `MinimapCanvas` を追加
- `LIGHT_COLORS` を sumi-e デザインシステムパレットに統一
- フレーム Z 動作を追加（`hitTestFrameBody`・フレーム内ノードドラッグ）

## [0.1.5] - 2026-04-18

### Graph Core (graph-core)

- コンテキストメニュー対応のため `useCanvasBase` に `onNodeContextMenu` コールバックを追加
- コネクタ始点にドットを表示
- コンテキストメニューのヒットテストに frame ノードを含める
- コネクタ始点ドットの半径を 5 から 3 に縮小
- `shapes` と `shapeRenderers` の循環依存を解消

## [0.1.4] - 2026-04-12

### Graph Core (graph-core)

- `trail-core/src/c4/coverage/` ソースファイルをバージョン管理から除外してしまう `.gitignore` パターンを修正

## [0.1.2] - 2026-04-11

### Graph Core (graph-core)

- レンダリングパイプラインおよびレイアウトアルゴリズム全体の認知的複雑度を低減（SonarCloud S3776）
- SonarCloud 修正: S125・S1854・S6582・S2871・S1871・S7781
- edgeRenderer の drawEdge にユニットテストを追加

## [0.1.0] - 2026-04-04

### 追加

- Trail Webview パネルによる TypeScript 解析
- tsconfig 選択、エクスポート、双方向同期、フィルタ・レイアウト UI

### 変更

- シェイプ・エッジレンダラ更新による GraphCanvas 描画の改善
- 直交ルーティング対応のキャンバスインタラクション更新

### Graph Core (graph-core)

- mermaidParser による Mermaid 図インポート
- 階層型レイアウトエンジンと直交エッジルーティング
- フレーム折りたたみ/展開とウェイポイント編集
- 直線ルーティングモードと並列コネクタオフセット
- ボトムアップサブグラフレイアウトとネストフレーム対応

## [0.0.3] - 2026-04-01

### 追加

- データマッピング、フィルタ、パスハイライト、詳細パネルを統合

### セキュリティ

- VS Code webview の postMessage ハンドラに origin 検証を追加

### Graph Core (graph-core)

- GraphNode にメタデータ、GraphEdge にウェイトを追加
- データマッピング、グラフ走査、バッチインポート、ノードフィルタ、パスハイライトを追加
- Draw.io / SVG エクスポートでメタデータとウェイトを保持

## [0.0.2] - 2026-03-29

### 変更
- Marketplace 画像を更新

### Graph Core (graph-core)
- SonarCloud の軽微・重要な指摘を修正

## [0.0.1] - 2026-03-27

初回リリース。グラフエディタを Anytime Markdown 拡張機能から分離。

### 追加

**エディタ**
- `*.graph` ファイル用のカスタムエディタによるビジュアルノードグラフエディタ
- キャンバス上でノード、エッジ、ラベルを作成
- ノード選択中にタイプするとテキスト編集を開始
- テーマに対応した色によるダーク/ライトテーマサポート
- テーマと言語の切り替えが可能な設定パネル

**レイアウト**
- 物理ベースレイアウト（力指向、Fruchterman-Reingold）
- VPSC 制約ベースのオーバーラップ除去
- 読みやすいレイアウトのための接続ノード自動展開

**シェイプ**
- 矩形、楕円、ひし形などを含むシェイプツール
- クイックアクション用のシェイプホバーバー（基本シェイプ以外では非表示）
- ドラッグ時の衝突検出

**コマンド**
- `Anytime Graph: New Graph` で新しいグラフファイルを作成

### Graph Core (graph-core)
- 10種のノードタイプ（rect, ellipse, diamond, parallelogram, cylinder, sticky, text, doc, frame, image）
- 3種のエッジタイプ（line, arrow, connector）+ 直交コネクタ（A* 障害物回避）+ ベジェ曲線
- スマートガイド、グリッドスナップ、ノード整列・分布
- ビューポート操作（パン、ズーム 0.1-10x、フィットコンテンツ）
- Undo/Redo（選択状態保持、最大50履歴）
- SVG エクスポート、draw.io XML エクスポート/インポート
- アクセシビリティ（ARIA ロール、キーボードナビゲーション、prefers-reduced-motion）
