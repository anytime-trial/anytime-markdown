# 変更履歴

"graph-core" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

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
