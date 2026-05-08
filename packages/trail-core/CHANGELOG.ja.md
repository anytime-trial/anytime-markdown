# 変更履歴

"trail-core" パッケージの主な変更をこのファイルに記録し���す。

形式は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に基づいています。

## [Unreleased]

## [0.18.0] - 2026-05-08

### 追加

- SQLite スキーマに ISO 8601 + Z 形式の CHECK 制約と `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` デフォルトを追加; インデックス命名を `idx_<テーブル>_<カラム>` 形式に統一

### 変更

- `.trail/analyze-exclude` の文法を `.gitignore` 互換に変更（`ignore` パッケージ採用）。`!` 否定・`/` 先頭固定・`*.spec.ts` ファイル glob・`dir/` ディレクトリ専用・`**` 再帰が利用可能に。**Breaking:** `AnalyzeOptions.exclude` の型を `readonly string[]` から `Ignore` に変更
- `loadAnalyzeExclude` の戻り値を `string[]` から `Ignore` に変更
- `FilterConfig.exclude` の型を `Ignore` に変更し、`matchGlob` / `parseAnalyzeExclude` を削除
- `analyze()` が TypeScript `ts.Program` を `ImportanceAnalyzer` と共有するよう変更

### 修正

- `mapFileToC4Elements` が絶対パスにマッチせず entries が常に空になっていた問題を修正
- `ProjectAnalyzer.getSourceFiles` が `.d.ts` 宣言ファイルを除外するよう修正

## [0.17.0] - 2026-05-06

### 追加

- デッドコード検出機構: `DeadCodeSignals`・`computeDeadCodeScore`・否定構文対応の `parseDeadCodeIgnore`
- 関数単位 importance のファイル集約、ファイル単位 dead-code score の C4 要素集約
- `dead-code-score` MetricOverlay とカラーマッピング
- `TypeScriptAdapter` への cyclomatic complexity 計算追加
- `file_analysis` / `function_analysis` SQLite テーブルと `line_count` / `cyclomatic_complexity` カラム
- `FileAnalysisRow` / `FunctionAnalysisRow` に `cyclomatic` / `lineCount` を追加
- `.trail/analyze-exclude` でコードグラフ解析フィルタを外部化
- `StoredCodeGraph` 向け `codeGraphToC4` 派生処理
- `TrailSession.workspace` フィールド、`TrailFilter.repository` を `workspace` に置換
- C4 ビューア向けサイズメトリクス（LOC / Files / Functions）オーバーレイ

### 修正

- WSL 上で UTC 表示になっていた時刻フォーマットをローカル TZ に修正
- `dead-code-score` の親フレームへの色伝播を抑止
- `dead-code-score` を表示レベルの要素タイプに絞って着色

### 変更

- `MetricOverlay` をリネーム: `complexity-most` / `complexity-highest` → `edit-complexity-most` / `edit-complexity-highest`
- `buildSizeMatrix` の入力を `CoverageMatrix` から `SizeFileEntry[]` に切替

### パフォーマンス

- `SERVICE_CATALOG` を専用 subpath に隔離（mcp-trail bundle 86% 削減）
- `zod` のバージョンを 4.3.6 に揃えて重複を解消

### 削除

- 未使用の `release_features` / `imported_files` / `c4_models` テーブルと関連コード

## [0.16.0] - 2026-05-04

### 追加

- Claude セッションを git worktree にマッピングする `agentMapping` 純粋関数（TDD）
- C4 要素間のコール連鎖を抽出する `SequenceAnalyzer`
- Bash の作業ディレクトリ（`cwd`）をワークスペースパスとして記録し worktree 検出を改善

### 修正

- ドキュメントのみの変更後も worktree マッピングを維持するよう修正
- 別リポジトリのセッションが main worktree に誤マッピングされる問題を修正

### 削除

- CLI エントリポイントと CLI 専用トランスフォームを削除

## [0.15.0] - 2026-05-03

### 追加

- C4 グラフノードオーバーレイ用の F-cMap カラーマップ計算

### 修正

- DSM L4 をファイル直参照から C4 code 要素の集約に変更

### 変更

- c4Mapper の重複ロジック整理と不要フェッチ削減

## [0.14.0] - 2026-05-02

### 追加

- リリース非依存のカバレッジスナップショット用 `current_coverage` テーブルを追加
- カバレッジデータから総行数を示す `LOC` メトリクスを追加
- CodeGraph の DB 永続化テーブルと永続化レイヤーを追加
- カバレッジ集計・解析のユニットテストを追加

### 変更

- `importCurrentCoverage` を `importAll` から `c4Analyze` に移動
- `graph.json` フォールバックを削除し、DB ベースの Code Graph 移行を完了

### 修正

- 未初期化 DB に対する `CodeGraphService.loadFromDb` のガードを追加
- `codeGraph.repositories` 設定の JSON オブジェクト文字列をパース可能に修正
- カバレッジ同期時の NaN パーセント値（Istanbul "Unknown"）をガード
- Code Graph 再生成時に AI コミュニティサマリーを保持するよう修正
- `aggregateCoverageFromDb` に L4 ファイルレベルのカバレッジエントリを追加
- `C4Model` 型をパッケージルートからエクスポート
- `TrailFilter` に `project` フィールドを追加

## [0.13.0] - 2026-04-28

### 追加

- Code Graph パイプライン（detector / extractor / builder / clusterer / layout / query engine / orchestrator）を追加
- Trail 拡張クライアント向けに Code Graph の HTTP/WS メッセージ型と API 連携を追加
- Code Graph 解析のリポジトリ範囲・除外パターン設定を追加

### 変更

- Code Graph の既定リポジトリ解決をワークスペース基準に変更
- Code Graph 設定参照を section スコープの accessor に限定

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
