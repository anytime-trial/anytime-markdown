# 変更履歴

"c4-kernel" パッケージの主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.2.0] - 2026-04-05

### 追加

- DSM 型定義と C4 モデルからの隣接行列構築
- TrailGraph ソース解析からの DSM マトリクス構築
- DSM 設計/実装間の差分検出
- Tarjan SCC によるサイクル検出
- Reverse Cuthill-McKee クラスタリング
- DSM コンポーネントノードを boundaryId でソート

### 修正

- コンポーネントレベル DSM から container/containerDb を除外
- フレームノードに選択マッチング用 `metadata.c4Id` を追加
- C4 ビューアの共有コンポーネントを graph-core に抽出

## [0.1.0] - 2026-04-04

### 追加

- C4Model から Mermaid C4 テキストへの c4ToMermaid シリアライザー
- parseMermaidC4 に Code 要素型を追加
- web-app と共有する C4 レベルフィルタリング用 buildLevelView
- extractBoundaries を c4-kernel に移動し重複を排除

### 修正

- Phase 2 でネストバウンダリフレームの groupId を伝播

## [0.0.1] - 2026-04-04

初回リリース。C4 ア���キテクチャモデルのパーサーおよびグラフドキュメント変換器。

### 追加

- Mermaid C4 図パーサ���（C4Context、C4Container、C4Component、C4Dynamic、C4Deployment）
- C4 モデルから graph-core 描画用 GraphDocument への変換
- C4 要素型: Person、System、SystemDb、SystemQueue、Container、ContainerDb、ContainerQueue、Component
- ラベルおよび技術アノテーション付き C4 リレーションシップ解析
- バウンダリ対応（System_Boundary��Container_Boundary、Boundary、Enterprise_Boundary）
