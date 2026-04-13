# 変更履歴

"Anytime Trail" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

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

