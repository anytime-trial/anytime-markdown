# 変更履歴

"Anytime Trail" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

### 変更

- `.trail/analyze-exclude` の解釈を `.gitignore` 互換に変更。`AnalyzePipeline` の `**/<pattern>/**` 自動ラップを撤去し、ユーザーが `!` 否定や `/dist` 等の root 固定パターンを直接書ける。`GraphDetector` が `ignore` インスタンスを受け取れるよう拡張
- `computeAndPersistImportance` も `analyze-exclude` の `Ignore` を受け取り、TS Compiler が拾った全 SourceFile に同じ除外規約を適用。これにより `__tests__/` や `*.test.ts` といった analyze-exclude 設定が importance 解析（→ `current_file_analysis` / `current_function_analysis`）にも一貫して効くようになった

## [0.17.0] - 2026-05-06

### 追加

- バックアップ間隔を日数で設定できる `backupIntervalDays` 設定
- `anytime-history.json` 列挙のリポジトリからコミットを取り込み
- 解析パイプラインへのデッドコード永続化統合
- `/api/c4/file-analysis`・`/api/c4/function-analysis` REST エンドポイント
- `mcp-trail` MCP サーバー（`TRAIL_WORKSPACE_PATH` 伝搬、`better-sqlite3` の bundle 外部化）
- `perf-report` 計測経路を追加（Phase B-1）

### 修正

- `C4Provider` 不在時にも手動追加 element を C4 モデルにマージ
- `analyzeExclude` の silent catch / TOCTOU / 初回除外漏れ / export 参照切れを修正
- リポジトリを意識したコミットアクティビティのインデックス化
- `tsc --noEmit` エラーを 37 件から 9 件に削減

### 変更

- スキルのインストール先を `~/.claude/` から `<workspace>/.claude/` に変更
- バンドル版 `anytime-reverse-engineer` スキルに `mcp-trail` 登録手順を追記
- `mcp-trail` bundle externals を `sql.js` に切替
- ファイル解析の importance を WebSocket push から DB 永続化に切替

### パフォーマンス

- 拡張バンドルへ `webpack-bundle-analyzer` を導入
- trail-db の SQL/perf 計測基盤を追加

### Trail Core (trail-core)

- デッドコード検出（`DeadCodeSignals`・`computeDeadCodeScore`・`parseDeadCodeIgnore`）
- TypeScriptAdapter での cyclomatic complexity、`file_analysis` / `function_analysis` テーブル
- `.trail/analyze-exclude` による解析フィルタの外部化
- `dead-code-score` MetricOverlay とカラーマッピング
- C4 ビューア向けサイズメトリクス（LOC / Files / Functions）オーバーレイ
- WSL UTC タイムゾーン修正、complexity 系 MetricOverlay リネーム
- `SERVICE_CATALOG` 隔離で mcp-trail bundle 86% 削減、`zod` を 4.3.6 に統一
- 未使用 `release_features` / `imported_files` / `c4_models` テーブル削除

## [0.16.0] - 2026-05-04

### 追加

- Claude セッションを git worktree 別に表示する Agent Mapping TreeView
- Agent Mapping パネルにコンテキストトークン使用量・今日のサマリー・フィルターアイコンを追加
- セッションツリーに AI セッションタイトルを表示
- `analyzeCurrentCode` 実行後に Trail Viewer を自動で開く
- activate 時に anytime-reverse-engineer スキルを自動インストール
- C4 シーケンス表示用 `/api/c4/sequence` エンドポイント
- `/api/c4/coverage` と `/api/code-graph` に release フィルタ対応
- `docsPath` 設定から Docs リポジトリエントリを自動生成

### 修正

- worktree とセッション両レベルで古いセッションをフィルタリング
- C4 importance スコアの表示・Trail Viewer への送信を修正
- コードグラフのリポジトリラベルをパスのベース名から導出

### 変更

- コマンドを `analyze` 動詞に統一（`analyzeCurrentCode`、`analyzeAll`）
- AI Note コマンド ID を `AiNote` プレフィックスに統一、ラベルを「AI Note / AI ノート」に統一
- 設定キーをサブセクションに整理
- `workspacePath` を C4 と CodeGraph 共通のトップレベル設定に昇格
- 削除: C4 モデルパネル・Memory パネル・`loadCoverage`・`regenerateCurrentCodeGraph`・`codeGraph.autoRefresh`・`codeGraph.outputDir`・`coverage.historyLimit`・`test.coverageCommand`・`test.e2eCommand`・Supabase/sync コマンド

### Trail Core (trail-core)

- Claude セッションと worktree のマッピング純粋関数 `agentMapping`
- C4 要素間コール連鎖を抽出する `SequenceAnalyzer`
- Bash `cwd` をワークスペースパスとして記録し worktree 検出を改善
- 修正: ドキュメント変更後も worktree マッピングを維持
- 修正: 別リポジトリのセッションが main に誤マッピングされる問題を解消
- 削除: CLI エントリポイントと CLI 専用トランスフォーム

## [0.15.0] - 2026-05-03

### 追加

- TrailDataServer 経由の F-cMap データ生成・表示
- L4 コード要素の関数一覧 API エンドポイント
- open-file WebSocket メッセージ型と dispatch 処理
- L4 ファイルを VS Code で開くコマンド配線（`onOpenFile`）
- Trace CodeLens と `runWithTrace` コマンド（M5 完了）

### 修正

- Trail ビューアで Trace タブが表示されない問題を修正

### 変更

- M1-M6 トレース実装のリファクタリング（重複削除・品質改善）

### Trail Core (trail-core)

- C4 グラフノードオーバーレイ用の F-cMap カラーマップ計算
- DSM L4 を C4 code 要素の集約に変更
- c4Mapper の重複ロジック削減

## [0.14.0] - 2026-05-02

### 追加

- `SyncService` を通じて `current_coverage` と `current_code_graphs` を Supabase に同期

### 変更

- `anytimeTrail.coverage.path` 設定を削除

### 修正

- Code Graph の読み込みを DB 初期化後に変更
- `regenerateReleaseCodeGraphs` コマンドでワークスペースフォルダー未設定時のガードを追加

### Trail Core (trail-core)

- リリース非依存のカバレッジスナップショット用 `current_coverage` テーブルと `LOC` メトリクスを追加
- CodeGraph の DB 永続化テーブルと永続化レイヤーを追加
- カバレッジ同期の NaN 値・コミュニティサマリー保持・Code Graph 初期化ガードを修正

## [0.13.0] - 2026-04-28

### 追加

- 拡張機能フローに Code Graph サービス統合と関連 HTTP/WS コマンド処理を追加

### Trail Core (trail-core)

- Code Graph パイプライン（detect/extract/build/cluster/layout/query/orchestrate）を追加
- Code Graph のリポジトリ範囲・除外パターン設定対応を追加

## [0.12.0] - 2026-04-26

### Trail Core (trail-core)

- `sessions` テーブルに `source` カラムを追加し、ログの出所を識別可能に

## [0.11.0] - 2026-04-26

### 修正

- `TrailDataServer` に `/api/trail/days/:date/tool-metrics` エンドポイントを追加

### Trail Viewer (trail-viewer)

- Session Timeline に Timing Breakdown チャート・ツール/スキルモード切り替え・TurnLaneChart を追加
- Error/CommitType バーチャートを横並び円グラフに変更
- DORA メトリクスを個別概要カードとして追加
- サブエージェントレーン（支配的ツールカラー）と動的タイムライン高さを追加
- Quality Metrics タブと旧チャート/カードコンポーネントを削除
- パフォーマンス: `getSessions` から重いクエリを除去

## [0.10.0] - 2026-04-25

### 追加

- `PostgresTrailStore` に `upsertCommitFiles` を実装し、テスト用フェイクも追加
- デプロイ頻度＋品質 API エンドポイント（`/api/deployment-frequency-quality`）を追加
- コミットファイルを Supabase `trail_commit_files` テーブルに同期

### 変更

- ターンベースの帰属でアシスタントコストをユーザープロンプト単位に集約
- Supabase に送信するメトリクス入力に tokens/LOC を追加

### 修正

- web-app リーダーの `leadTimeForChanges` を `leadTimePerLoc` / `tokensPerLoc` に置き換え
- LEAD ベースのトークン集計を範囲内のアシスタントメッセージのみに制限

### パフォーマンス

- 重い CTE + LEAD 集計を 2 本のシンプルな範囲スキャンに置き換え
- `match_confidence` フィルタを SQL 側に押し込む

### Trail Core (trail-core)

- Change Failure Rate を 168h タイムウィンドウ + ファイルオーバーラップ方式に刷新
- `leadTimePerLoc`（min/LOC）と `tokensPerLoc`（tokens/LOC）指標を追加
- スタック形式のリリース品質チャート用 `computeReleaseQualityTimeSeries` を追加
- プロンプト→コミット成功率を AI ファーストトライ成功率に置き換え
- 生産性指標クエリ用の DB インデックスを追加

## [0.9.1] - 2026-04-24

### 変更

- README をビジョンと現状提供機能の構成に再編成
- 拡張アイコンと Marketplace ロゴを `anytime-control-256` に刷新

### 修正

- `TrailDataServer` のパストラバーサル脆弱性を修正（パス処理を堅牢化）
- `PerAgentState` 初期化に不足していた `touchedFiles` フィールドを追加

### Trail Core (trail-core)

- コード変更なし（拡張機能のバージョンに揃える）

## [0.9.0] - 2026-04-23

### 追加

- `backupGenerations` VS Code 設定: 保持するバックアップ世代数を設定可能
- ManualGroups の永続化（Supabase・Web API・TrailDataServer・MCP）
- Trail Viewer にグループ描画・キーボードショートカット・`GroupLabelDialog` を追加
- Trail Viewer の C4 タブに `MinimapCanvas` を追加
- C4 モデル要素・関係管理 MCP サーバー（`list_relationships`・`GET /api/c4/manual-relationships`）

### Trail Core (trail-core)

- `ManualGroup` 型とサービスカタログアイコン（フレームワーク・ランタイム・言語・GitHub・VS Code・AI）を追加
- 動的インポート・再エクスポート・型インポートのエッジをメタデータ付きで抽出

## [0.8.0] - 2026-04-19

### 追加

- タブバーにリアルタイムのトークンバジェット監視インジケーターを追加
- 拡張機能アクティベート時に全 Claude Code フック（PostToolUse、Stop 等）を自動セットアップ
- セッション一覧とアナリティクスパネルにセッション ID コピーボタンを追加
- アナリティクスセッションテーブルとセッション一覧にエラー件数を表示
- セッション一覧にサブエージェント数を表示
- ビューアへ HTTP でデータを提供する `TrailDataServer` を追加
- `JsonlSessionReader`・`GitStateService`・`MetricsThresholdsLoader`・`SqliteSessionRepository` を実装
- DORA メトリクス用の品質メトリクス SQL・REST エンドポイント・リーダー実装を追加

### Trail Core (trail-core)

- DORA 4 メトリクス: デプロイ頻度・変更のリードタイム・プロンプト成功率・変更失敗率
- `computeQualityMetrics` オーケストレーターと `getQualityMetrics` ポート
- メッセージとコミットを事後的に紐付ける `BackfillMessageCommits` ユースケース

## [0.7.0] - 2026-04-18

### 追加

- Note treeview を追加（vscode-markdown-extension から移動）

### 変更

- `storagePath` を `database.storagePath` と `claudeStatus.directory` に分割
- `ClaudeStatusWatcher` を `vscode-common` へ移行

### 修正

- リセット時にステータスファイルから `sessionEdits` と `plannedEdits` をクリア

### Trail Core (trail-core)

- `trail_daily_costs` を廃止し `trail_daily_counts` を導入
- 同期を `anytime-markdown` リポジトリのみにフィルタ
- `getAllMessageToolCalls` のパラメータ化クエリを修正

## [0.6.0] - 2026-04-13

### 追加

- Trail Viewerボタン付きダッシュボードパネルを追加
- ダッシュボードパネルのi18nキーを追加
- C4解析とTrailインポートのステップをリポジトリ名付きでログ出力

### 変更

- "Import JSONL Logs"を"Refresh Trail Data"（リフレッシュアイコン）にリネーム
- "Analyze Workspace"を"Analyze Code"（`symbol-class`アイコン、互換性向上）にリネーム
- `c4Export` / `c4Import` コマンドを削除
- データベースパネルのTrail Viewerアイコンを削除

### 修正

- C4パネルのリポジトリセレクターで全リポジトリを表示するよう修正
- `trail_graphs` マイグレーション結果をディスクに永続化するよう修正

### Trail Core (trail-core)

- `IC4ModelStore` ポートと `fetchC4Model` サービスを導入
- リモート同期を完全洗い替え方式に変更
- `trail_graphs` を `current_graphs` / `release_graphs` に分割
- `daily_costs` のJST境界集計とサイレントエラーを修正

## [0.5.3] - 2026-04-12

### Trail Core (trail-core)

- `src/c4/coverage/` ソースファイルをバージョン管理から除外し CI ビルド失敗を引き起こしていた `.gitignore` パターンを修正

## [0.5.2] - 2026-04-12

### 追加

- `analyzeReleases`: git worktree ベースのリリースファイル・フィーチャー分析
- タスク同期を `release_files`/`release_features` 同期に置き換え
- `/api/trail/releases` エンドポイント追加
- リリースタグ解決のための `resolveReleases` 追加
- `saveTrailGraph` / `getTrailGraph` DB メソッド追加
- トレイルグラフ ID 一覧取得の `getTrailGraphIds` 追加
- インポート結果メッセージに `releasesAnalyzed` カウントを追加

### 変更

- `SyncService` から C4 モデル同期を削除（C4 データは `trail-viewer` が DB 経由で配信）
- `C4Panel` の `saveC4Model` 呼び出しを `getTrailGraphIds` に変更

### 修正

- `analyzeReleases` 実行前に古い worktree をクリーンアップするよう修正
- `importAll` の早期リターンに `releasesAnalyzed` を追加

### Trail Core (trail-core)

- ドメイン層（model, schema, engine, port, reader, usecase）を追加
- `releases`・`release_files`・`release_features`・`trail_graphs`・`release_coverage` テーブルを追加
- `session_costs`/`daily_costs` テーブルを追加し、バッチ処理によりインポート性能を改善

## [0.5.1] - 2026-04-11

### 追加

- Claude メモリファイル管理用 `AiMemoryProvider` による Memory ツリービューを追加
- Memory コマンドと NLS ラベルを追加

### 変更

- Trail アイコンを更新（camel_trail.png）
- Dashboard を 2 階層構造に変更
- DB 日時データを UTC ISO 8601 形式に統一
- コスト分類カラムを追加し、インポート時に分類を実行
- 最終インポート・最終同期をローカルタイムゾーン形式で表示

### 削除

- Git 機能（Changes・Graph・Timeline・SpecDocs パネル）を Anytime Git 拡張に分離

### 修正

- マイグレーション失敗時のエラーログを追加
- syncToSupabase コマンドの実装と同期エラーログを追加
- Trail Viewer のインポートおよび表示に関する複数バグを修正

### Trail Core (trail-core)

- ロケール対応の日時フォーマット用 `formatDate` ユーティリティ
- 日時表示をローカルタイムゾーンに統一

## [0.5.0] - 2026-04-09

### 追加

- リモート同期コマンドと Supabase 接続用 VS Code 設定
- Supabase CSP 設定

### Trail Core (trail-core)

- リモート DB 同期レイヤー（SQLite → Supabase/PostgreSQL）
- セッションコミット統計・コミット解決クエリ
- Analytics フィールド: `totalFilesChanged`・`totalAiAssistedCommits`・`totalSessionDurationMs`

## [0.4.0] - 2026-04-08

### 追加

- SQLite データベースによるトレイルデータ保存（sql.js、sql-asm.js）
- Dashboard パネル（手動 JSONL インポートボタン付き）
- JSONL インポート中のプログレス通知
- Prompts タブ（skills・settings.json 表示）
- Analytics タブ（コスト推定・ツール使用量統計）
- プロンプトファイル読み込み用 Prompts API エンドポイント

### 変更

- ビューア・インポートボタンを Dashboard タイトルバーに移動

### 修正

- JSONL ファイルの再帰的スキャン（サブエージェントセッション含む）
- セッション行の snake_case → camelCase 変換
- 互換性のため FTS5 を LIKE 検索に置換
- sql.js を `__non_webpack_require__` で dist/ から読み込み
- TrailDatabase の初期化をバックグラウンドで実行（アクティベーションブロック回避）
- フィルタドロップダウンで全ブランチ・モデルを保持
- フィルタ変更時の `searchSessions` 呼び出し

### Trail Core (trail-core)

- バージョン同期のみ（コード変更なし）

## [0.3.0] - 2026-04-07

### 追加

- カバレッジファイル監視（デバウンス付き `CoverageWatcher`）
- カバレッジスナップショット履歴永続化（`CoverageHistory`）
- C4 パネルでのカバレッジ読み込み・履歴・差分統合
- C4 ツリープロバイダー（C1-C4 レベルノード）
- ルートノードコンテキストメニューに C4 ビューア
- C4 ツリーのコンテキストメニュー・テストコマンド設定
- `runE2eTest` / `runCoverageTest` コマンド
- アクティベーション時の Claude Code スキル自動インストール
- スタンドアロン C4 ビューアの L1 編集 UI
- マニュアル要素マージ・編集ハンドラ
- モノレポ解析のシステム境界
- 解析プログレスオーバーレイ
- C4 グラフでのマーキー選択・ノードクリック/ダブルクリック

### 変更

- C4 ツールバーアイコンをコンテキストメニューに移動

### 修正

- `restoreSavedModel` での `projectRoot` 設定（カバレッジ読み込み）
- カバレッジ検出のディレクトリ監視（ファイル監視から変更）
- ワークスペース解析の tsconfig.json ピッカー
- analyze コマンドで常にビューアを開くように修正

### Trail Core (trail-core)

- CLI 出力の `--format c4` オプション追加

## [0.2.0] - 2026-04-05

### 追加

- C4 分析時のサーバー自動起動（ユーザー確認付き）
- 共有 TrailLogger ユーティリティ
- C4DataServer（HTTP + WebSocket）の実装
- スタンドアロンビューア（React エントリーポイント + webpack 構成）
- ブラウザでスタンドアロンビューアを自動起動
- C4 モデル永続化と自動読み込み
- C4 Model / DSM タブバー
- DSM キャンバスレンダラー（ヒットテスト付き）
- DSM コマンドとメニュー項目の登録

### 修正

- C4 ツリービューの空パネル登録
- 新規 WebSocket クライアントへの現在データ送信
- ブラウザ起動を初回のみに制限
- バウンダリをオプション扱いに変更

### 変更

- VS Code webview を削除しスタンドアロンビューアのみに変更
- コマンド登録を個別モジュールに分離
- 空 catch ブロックを TrailLogger 出力に置換
- 非ヌルアサーションをガード句に置換

### セキュリティ

- CORS ヘッダー、WebSocket origin チェック、メッセージ型ガードを追加

### テスト

- Jest 基盤セットアップと GitStatusParser テスト追加
- C4DataServer 型ガードテスト追加

### Trail Core (trail-core)

- CLI `--help` と `parseArgs` エクスポート
- EdgeExtractor の O(1) ルックアップ改善
- ReDoS 防止

## [0.1.0] - 2026-04-04

### 追加

- Mermaid C4 パースと graph-core 描画による C4 アーキテクチャ図ビューアパネル
- C4 モデル JSON エクスポートと Mermaid 依存関係エクスポート
- git graph コミット選択時の変更ファイルハイライト
- C4 ビューアでのノードクリックによるファイルオープン
- git リポジトリの自動オープンと C4 レベル切り替え

### 修正

- Mermaid エクスポートに .mmd 拡張子を使用
- C4 tsconfig リストから .vscode-test と .worktrees を除外
- C4 分析時の tsconfig.json 検索上限を 50 に拡大
- C4 ビューアのズーム関数に deltaY を直接渡す
- C4 ホイールズームの webview スクロールキャプチャを防止
- 拡張機能に typescript をバンドルしてモジュール未検出を解決
