# 変更履歴

"trail-core" パッケージの主な変更をこのファイルに記録し���す。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.5.0] - 2026-04-09

### 追加

- リモート DB 同期レイヤー（SQLite → Supabase/PostgreSQL）
- `IRemoteTrailStore` インターフェース（リモート DB 抽象化）
- `SupabaseTrailStore`・`PostgresTrailStore` 実装
- リモートトレイルテーブル用 PostgreSQL マイグレーション
- `SyncService`（SQLite → リモート同期）
- `resolveCommits`・`isCommitsResolved` メソッド
- `session_commits` テーブルと `commits_resolved_at` カラム
- `getSessionCommitStats`・`getSessionCommits` クエリ
- Analytics に `totalFilesChanged`・`totalAiAssistedCommits`・`totalSessionDurationMs` フィールド追加

## [0.4.0] - 2026-04-08

- vscode-trail-extension とのバージョン同期

## [0.3.0] - 2026-04-07

### 追加

- CLI 出力の `--format c4` オプション

## [0.2.0] - 2026-04-05

### 追加

- CLI `--help` オプション、フォーマットバリデーション、`parseArgs` エクスポート

### 変更

- TrailNode を Map でインデックス化し EdgeExtractor を O(1) ルックアップに改善

### セキュリティ

- `matchGlob` パターン処理の ReDoS 脆弱性を防止

## [0.1.0] - 2026-04-04

### 追加

- trailToC4 L2-L4 変換と MDA CLI コマンド
- --format mermaid CLI オプション（粒度・方向指定対応）
- モジュール・シンボル粒度の toMermaid トランスフォーム

### 変更

- toMermaid を trailToC4 + c4ToMermaid パイプラインに簡素化
- sourceFiles のキャッシュと EdgeExtractor の診断情報追加
- 未使用コードの削除

### 修正

- Mermaid ノードラベルに内部 ID ではなく filePath を使用

## [0.0.1] - 2026-04-04

初回リリース。TypeScript プロジェクトのアーキテクチャ可視化のための静的解析エンジン。

### 追加

- 設定可能なフィルタ付き TypeScript ��ロジェクトスキャン（ProjectAnalyzer）
- クラ���、関数、インターフェース、型エイリアスの抽出（SymbolExtractor���
- シンボル間のインポート依存関係検出（EdgeExtractor���
- パスパターンとシンボル種別の���ィルタリング（FilterConfig）
- Mermaid 図出力（toMermaid トランスフォーム）
- C4 モデル出力��toC4 トランスフォーム）
- Cytoscape.js グラフ出力（toCytoscape ��ランスフォーム���
- グラフスタイリング用 Trail ��タイルシート
- ユーザ���定義の解析スコープ（カスタムトレイル）
- C4 モデル型（Person、System、Container、Component、Relationship）
- コマンドライン解析ツール（`trail` CLI）
