# 変更履歴

"graph-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.4.0] - 2026-05-24

### 追加

- 読み取り専用 `GraphView`（`./viewer` サブパス、vanilla 埋め込み用）を追加
- radial mindmap レイアウトを追加
- rooted tree レイアウト（`rootId` 対応の階層レイアウト）を追加
- mindmap 風の折りたたみ可能サブツリーを読み取り専用ビューアに追加（コネクタ端点クリックで折りたたみ、ホバー時に -/+ トグルを表示）
- 読み取り専用ビューアにオーバービュー minimap を追加（trail-viewer の `MinimapCanvas` に準拠）
- オプトインのノード選択＋ドラッグ移動を読み取り専用ビューアに追加

### 修正

- `GraphView` の wheel zoom を補正し、リサイズ時に viewport を保持
- ポインタ座標を canvas backing px へ変換し、DPR > 1 環境での hit-test / pan / zoom のずれを修正

### 変更

- `resolveEdgesForRender` を engine に抽出し、隣接構築の重複排除と O(1) ノード探索に整理

## [0.3.4] - 2026-05-21

### 変更

- `graph-core` 全体の SonarCloud 指摘を解消（S7769・S7735・S7748・S107 ほか）
- 純ロジックのユニットテストカバレッジを改善（`reducer`・`groupClustering` ほかを 100% に）

## [0.3.3] - 2026-05-20

### 変更

- `useCanvasBase` から `deleteGroupsContainingSelection` ヘルパーを抽出し、認知的複雑度を削減（S3776）

## [0.3.2] - 2026-05-17

### 変更

- バージョンアップのみ (0.3.1 から機能変更なし)

## [0.3.1] - 2026-05-15

### 変更

- 実カンバスを使わない culling / shape / drawHelpers のテストカバレッジを追加

## [0.3.0] - 2026-05-04

### 追加

- シーケンス図フラグメント用 `fragment` シェイプを追加

### 修正

- React コンポーネントの props を `Readonly` でラップ（Sonar S6759）
- 不要な型アサーションを削除（Sonar S4325）
- 配列インデックスキーを安定した複合キーに置換（Sonar S6479）
- グローバル `parseInt` を `Number.parseInt` に置換（Sonar S7773）

### 変更

- `handleKeyDown` をカテゴリ別ハンドラに分割して認知的複雑度を削減（Sonar S3776）
- `handleMouseDown` をモード別ヘルパーに分割（Sonar S3776）
- physics の `assignCoordinates` からレイヤーヘルパーを抽出（Sonar S3776）
- engine の `computeVisibleElements`・`findShortestPath`・`findBestSnap` からヘルパーを抽出（Sonar S3776）
- drawio ノードスタイルのテーブル駆動化・`buildNodeStyle` 三項演算子の整理（Sonar S3776）
- `window.localStorage` を `globalThis.localStorage` に置換（Sonar S7764）

## [0.2.3] - 2026-05-03

### 追加

- Ctrl+クリック複数選択トグル用の `onNodeCtrlClick` コールバックオプション
- ホイールズームに Shift キーを要求する `wheelRequiresShift` オプション

## [0.2.2] - 2026-05-02

### 追加

- ノード選択時に関連しないグラフ要素を減光表示

### 修正

- `MinimapCanvas` を左サイドコントロールパネルの上に移動
- ミニマップコントロールの表示順を修正
- フィットコントロールをミニマップ内に移動

## [0.2.1] - 2026-04-24

### 追加

- `splitManualTopBottom`・`packGroupMembers`・ネストしたフレームレイアウトのテストを追加

## [0.2.0] - 2026-04-23

### 追加

- `MinimapCanvas` コンポーネント: ビューポートのドラッグパン・ズームイン/アウトボタン付きミニマップ
- `MinimapCanvas` をパッケージ index からエクスポート
- フレーム Z 動作: `useCanvasBase` に `hitTestFrameBody` とフレーム内ノードドラッグを追加

### 変更

- `LIGHT_COLORS` を sumi-e デザインシステムパレットに合わせて更新

## [0.1.5] - 2026-04-18

### 追加

- コンテキストメニュー対応のため `useCanvasBase` に `onNodeContextMenu` コールバックを追加
- コネクタ始点にドットを表示

### 修正

- コンテキストメニューのヒットテストに frame ノードを含める
- コネクタ始点ドットの半径を 5 から 3 に縮小

### 変更

- `shapes` と `shapeRenderers` の循環依存を解消

## [0.1.4] - 2026-04-12

### 修正

- `trail-core/src/c4/coverage/` ソースファイルをバージョン管理から除外してしまう `.gitignore` パターンを修正

## [0.1.3] - 2026-04-12

### 変更

- E2E カバレッジ連携のため jest `coverageReporters` に `json-summary` を追加

## [0.1.2] - 2026-04-11

### 追加

- edgeRenderer の drawEdge にユニットテストを追加

### 変更

- renderer.ts・textRendering.ts・hitTest.ts・smartGuide.ts の認知的複雑度を低減（SonarCloud S3776）
- importDrawio.ts・importMermaid.ts・exportDrawio.ts の認知的複雑度を低減（SonarCloud S3776）
- visibilityGraph.ts・vpsc.ts・resolveAllCollisions.ts・parseEdge.ts の認知的複雑度を低減（SonarCloud S3776）
- findShortestPath.ts・階層レイアウト・PhysicsEngine・drawEdge の認知的複雑度を低減（SonarCloud S3776）
- SonarCloud 修正: コメントアウトコード削除（S125）、不要な代入削除（S1854）、オプショナルチェイン（S6582）、ソートに localeCompare を使用（S2871）、重複分岐を統合（S1871）、replaceAll を使用（S7781）

## [0.1.1] - 2026-04-07

### 追加

- グラフノードの Person シェイプ対応
- 共通グラフ操作用 `useCanvasBase` フック抽出
- useCanvasBase のエディタキーバインド

### 変更

- ホイール動作変更: Shift+ホイールでズーム、ホイールでマトリクススクロール

### 修正

- useCanvasBase の型エラー（SELECT_RECT_COLORS / CanvasColors 不一致）
- SonarCloud 指摘事項（S1854, S6557, S4624, S6481, S3358, S6582）

## [0.1.0] - 2026-04-04

### 追加

- Mermaid 図インポート（flowchart/sequence/class/state 対応の mermaidParser）
- 階層型物理レイアウトエンジン
- 可視グラフアルゴリズムによる直交エッジルーティング
- フレームの折りたたみ/展開サポート
- エッジパスの手動調整用ウェイポイント
- コネクタエッジの直線ルーティングモード
- 同一ノードペア間の並列コネクタパスオフセット
- Mermaid インポート用ボトムアップサブグラフレイアウト
- layoutWithSubgroups でのネストフレームレイアウト
- コネクタ端点重複時の迂回パス

### 変更

- shapes.ts を shapeRenderers と textRendering モジュールに分割
- visibilityGraph から orthogonalRouter を分離
- オーバーレイから描画ヘルパーを分離
- マジックナンバーを定数に抽出
- pathfinding モジュールを visibilityGraph ベースの直交ルーティングに置き換え
- コネクタルーティングから障害物回避を削除
- EdgeType から 'arrow' を削除

### 修正

- ベジェ制御点をエッジ側に対して垂直に偏向
- 並列コネクタ端点の中心対称オフセット
- 階層レイアウトでノード高さに応じたレイヤー間隔調整

## [0.0.3] - 2026-04-01

### 追加

- GraphNode にメタデータ、GraphEdge にウェイトを追加
- データマッピング用の linearScale と interpolateColor ユーティリティを追加
- Draw.io および SVG エクスポートでメタデータとウェイトを保持
- グラフ走査、バッチインポート、ノードフィルタを追加
- パスハイライトとフィルタパネルを追加

### 修正

- resolveConnectorEndpoints と RenderOptions の readonly 型不整合を修正

## [0.0.2] - 2026-03-29

### 修正
- SonarCloud 軽微な指摘を修正
- SonarCloud 重要な指摘を修正

## [0.0.1] - 2026-03-27

初回リリース。

### 追加

**ノード**
- 10種のノードタイプ: rect, ellipse, diamond, parallelogram, cylinder, sticky, text, doc, frame, image
- フレームノード（視覚的グルーピング）
- ノードロック・z-index レイヤー順序
- ドラッグ&ドロップによる画像配置
- ノード URL ハイパーリンク
- テキストオーバーフロー時の省略記号クリッピング

**エッジ**
- 3種のエッジタイプ: line, arrow, connector
- 直交コネクタ（A* 障害物回避ルーティング、バイナリヒープ）
- ベジェ曲線エッジ（手動制御点）
- エッジラベル・設定可能な端点形状（arrow, circle, diamond, bar）
- 追加接続ポイントのカスタマイズ

**キャンバス**
- スマートガイド（整列スナップ）
- グリッドスナップ（ノード・リサイズ）
- ノード整列（左、右、上、下、中央）・分布
- ビューポート: パン、ズーム（0.1-10x）、フィットコンテンツ（easeOutCubic アニメーション）
- ビューポートカリング（レンダリング性能向上）
- Undo/Redo（選択状態保持、最大50履歴）
- シェイプホバーバー（選択ノードのクイックアクション）
- ドラッグ時の衝突検出
- ダーク/ライトテーマ対応

**レイアウト**
- 物理ベースレイアウト（力指向グラフ、Fruchterman-Reingold アルゴリズム）
- VPSC 制約ベースの重なり除去
- 接続ノードの自動配置

**エクスポート / インポート**
- SVG エクスポート（全ノードタイプ・グラデーション対応）
- draw.io XML エクスポート/インポート（Node.js 用 xmldom 互換）

**アクセシビリティ**
- キャンバス ARIA ロール、ラベル、ライブステータスリージョン
- 矢印キーによるノード移動
- カラーパレットのキーボードナビゲーション（ARIA ロール）
- PropertyPanel コントロールラベル
- prefers-reduced-motion アニメーション対応
- aria-live によるノード追加/削除の通知
