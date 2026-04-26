# 変更履歴

"trail-core" パッケージの主な変更をこのファイルに記録し���す。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.12.0] - 2026-04-26

### 追加

- `sessions` テーブルに `source` カラムを追加し、ログの出所を識別可能に

## [0.11.0] - 2026-04-26

- trail-viewer・vscode-trail-extension とのバージョン同期のためのバンプ（コア変更なし）

## [0.10.0] - 2026-04-25

### 追加

- スタック形式のリリース品質チャート用 `computeReleaseQualityTimeSeries` を追加
- `leadTimeForChanges` に代わる `leadTimePerLoc` 指標（min/LOC）を追加
- `tokensPerLoc` 指標（tokens/LOC）と `computeTokensAndCostPerLocTimeSeries` を追加
- `QualityMetrics` に `costPerLocTimeSeries` を公開
- `CombinedCommitPrefix` に `linesAdded` フィールドを追加
- 生産性指標クエリ用の DB インデックスを追加

### 変更

- Change Failure Rate を 168h タイムウィンドウ + ファイルオーバーラップ方式に刷新
- プロンプト→コミット成功率を AI ファーストトライ成功率に置き換え
- AI ファーストトライ失敗検知にファイルオーバーラップを必須化、非コードファイルを除外
- キャッシュリードとコミット単位の実態に合わせて閾値を再調整
- 日次バケット閾値を 31 日に拡大
- `VALID_MESSAGE_COMMIT_CONFIDENCES` を `ReadonlySet<string>` に拡張

### 修正

- `message_commits` をユーザー祖先 UUID に解決するよう修正
- timeSeries を sum-ratio 集計に合わせて整合
- 生産性指標の日時に `mc.detected_at` ではなく `committed_at` を使用
- 生産性指標をセッションスコープのコミットウィンドウに再定義

## [0.9.1] - 2026-04-24

### 変更

- `vscode-trail-extension` のリリースにバージョンを揃える（`trail-core` 自体にコード変更なし）

## [0.9.0] - 2026-04-23

### 追加

- `ManualGroup` 型と `c4ToGraphDocument` における `GraphGroup` への変換
- 動的インポート・再エクスポート・型インポートのエッジ抽出（メタデータ付き）
- サービスカタログにフレームワーク・ランタイム・言語アイコンを追加
- サービスカタログに GitHub・VS Code・AI サービスアイコンを追加

## [0.8.0] - 2026-04-19

### 追加

- DORA 4 メトリクスのドメイン型・閾値・分類（`types.ts`、`thresholds.ts`）
- デプロイ頻度メトリクス実装
- 変更のリードタイムメトリクス実装
- プロンプト→コミット成功率メトリクス実装
- 変更失敗率メトリクス実装
- 全 DORA メトリクスを集約する `computeQualityMetrics` オーケストレーター
- `ITrailReader` に `getQualityMetrics` ポートを追加
- セッション単位の永続化のための `ISessionRepository` ポート
- `budget` および `session` ドメインモデルの拡張
- メッセージとコミットを事後的に紐付ける `BackfillMessageCommits` ユースケース
- メトリクス集計ウィンドウ用の時系列ユーティリティ関数

## [0.7.0] - 2026-04-18

### 追加

- `trail_daily_costs` を廃止し `trail_daily_counts` テーブルを導入
- TrailDB に `getAllDailyCounts()` を追加・`getAllDailyCosts()` を削除
- `IRemoteTrailStore.upsertDailyCosts` を `upsertDailyCounts` に置き換え

### 変更

- `SyncService` を `getAllDailyCounts` / `upsertDailyCounts` に対応
- `PostgresTrailStore` と `SupabaseTrailStore` を `trail_daily_counts` に対応
- リリース同期を `anytime-markdown` リポジトリのみにフィルタ
- `trail_current_graphs` 同期を `anytime-markdown` のみにフィルタ

### 修正

- `getAllMessageToolCalls` にパラメータ化クエリを使用（SQL インジェクション防止）
- FK 違反防止のため `message_tool_calls` を `messageCutoff` でフィルタ

### 削除

- `daily_costs` デッドコードを削除

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
