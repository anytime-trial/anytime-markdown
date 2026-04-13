# 変更履歴

"trail-core" パッケージの主な変更をこのファイルに記録し���す。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.6.0] - 2026-04-13

### 追加

- マルチリポジトリC4モデルサポートのための `IC4ModelStore` ポートと `fetchC4Model` サービスを追加

### 変更

- リモート同期を完全洗い替え方式（7日間メッセージウィンドウ）に変更
- `trail_graphs` を `current_graphs` と `release_graphs` テーブルに分割
- `current_graphs` の主キーを `repo_name` に変更
- `TrailLogger` 出力に ISO 8601 UTC タイムスタンプを追加

### 修正

- 同期時にメッセージがサイレントに欠落していたセッションを再インポートするよう修正
- `INSERT_MESSAGE` SQL プレースホルダー数を修正し、サイレントキャッチエラーを表面化
- `daily_costs` の集計境界をプロセスTZではなくJSTで区切るよう修正

## [0.5.3] - 2026-04-12

### 修正

- `src/c4/coverage/` ソースファイルをバージョン管理から除外し CI ビルド失敗を引き起こしていた `.gitignore` パターンを修正

## [0.5.2] - 2026-04-12

### 追加

- trail-core のドメイン層（model, schema, engine, port, reader, usecase）を追加
- `releases` テーブルスキーマと `TrailRelease` ドメインモデル・リリースリゾルバーエンジンを追加
- `release_files`・`release_features` テーブルを追加（タスクドメインを廃止）
- `trail_graphs` スキーマを追加
- `release_coverage` テーブルと `ReleaseCoverageRow` 型を追加
- `session_costs`・`daily_costs` テーブルを追加
- `trail_sessions`・`trail_releases` に `repo_name` 列を追加
- コスト計算に `cacheCreation` 対応を追加
- `IGitService` に `getFileStatsByRange` を追加
- `ITrailReader` に `getReleases` を追加
- スキルベースのコスト分類用 `skill_models` テーブルを追加
- ドメインエンジン・ユースケース・リリースリゾルバーのユニットテストを追加
- `c4-kernel` パッケージを `trail-core` にマージ

### 変更

- sessions/messages テーブル構造を刷新し、`importAll` で `session_costs`/`daily_costs` を生成
- インポート性能改善（メッセージ数バッチ処理 20,000 件、インメモリセッションマップ、I/O削減）
- `daily_costs`・`session_costs` の再構築を `importAll` のポスト処理に移動
- DB コミット境界での進捗ログ（処理数/合計/スキップ数）
- コスト分類を Current/Optimized に簡略化（Rule/Feature を廃止）

### 修正

- Extension Host タイムアウト防止のためイベントループへの yield 処理
- セッション境界でのトランザクションコミット
- 既存レコードへの `repo_name`・`release_files` バックフィル
- メインセッションとサブエージェントのスキップロジックを分離
- サブエージェントの grandparent ディレクトリからの `sessionId` 抽出

## [0.5.1] - 2026-04-11

### 追加

- ロケール対応の日時フォーマット用 `formatDate` ユーティリティ
- `formatDate` のユニットテスト

### 変更

- 日時表示を `formatDate` を使用してローカルタイムゾーンに統一
- 日付グラフの集計をローカルタイムゾーン基準に変更

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
