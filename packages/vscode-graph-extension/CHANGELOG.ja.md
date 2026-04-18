# 変更履歴

この拡張機能に対するすべての重要な変更はこのファイルに記録されます。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

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
