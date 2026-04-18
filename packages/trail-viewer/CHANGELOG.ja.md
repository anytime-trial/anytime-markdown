# 変更履歴

`@anytime-markdown/trail-viewer` に対するすべての重要な変更をこのファイルに記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.7.0] - 2026-04-18

### 追加

- Analytics 日付パネルの右カラムに日次集計チャートを表示
- デザイントークン追加: `amberGoldHover`、`iceBlueBorder`、スキルチャート色、`toolPalette`、`commitColors`

### 変更

- Analytics UI 命名に合わせて `Behavior*` を `Combined*` にリネーム
- すべてのスクロール可能領域に `scrollbarSx` を適用
- セッション一覧テーブルからモデル列を削除
- 日次集計パネルからキャッシュタイムラインを削除

### 修正

- Analytics 日付パネルの日次ツール指標を `trail_daily_counts` から取得
- ライトモードのトークン値（bg、semantics、disabled text）を修正
- `TOOL_COLORS` とコストチャートのハードコード色をデザイントークンに置き換え
- コミットタイプ色のハードコードを `commitColors` トークンに置き換え
- CTA ホバー色のハードコードを `amberGoldHover` トークンに置き換え
- ユーザーメッセージボーダーをトークン化、フォーカスリングを 3px に強化（WCAG 2.2）
- `getAnalytics` / `getCostOptimization` を `trail_daily_counts` に移行

### パフォーマンス

- `getBehaviorData` の大量フェッチを `trail_daily_counts` SELECT に置き換え

## [0.4.0] - 2026-04-13

### 追加

- アナリティクスセッション行からトレースタブへのジャンプを追加
- セッションキャッシュタイムラインに累積推論時間のプロットを追加
- ブランチ/モデルフィルターをリポジトリセレクターに置き換え

### 変更

- `TrailViewerApp` を共有ラッパーコンポーネントとして抽出（VS Code拡張とWebアプリで共用）
- `useC4DataSource` のローカルモードを削除
- `useTrailDataSource` の未使用Supabaseデュアルモードを削除

### 修正

- 検索テキストとリポジトリフィルターをクライアントサイドで正しく適用するよう修正

## [0.3.1] - 2026-04-12

### 修正

- `trail-core/src/c4/coverage/` ソースファイルをバージョン管理から除外してしまう `.gitignore` パターンを修正

## [0.3.0] - 2026-04-12

### 追加

- `c4-viewer` パッケージと `C4DataServer` を `trail-viewer` にマージ
- `TrailViewerCore` に Releases タブを追加
- `ReleasesPanel` コンポーネントとリリースデータ取得を追加
- ja/en 翻訳マップによる i18n 基盤を追加
- `NEXT_PUBLIC_SHOW_LIMITED` 環境変数（アナリティクス・トレース表示制限）を追加
- `NEXT_PUBLIC_SHOW_90D_PERIOD` 環境変数（90D 期間セレクタ非表示）を追加
- リリースパネル（160px）を `TrailPanel` → `C4ViewerCore` 経由で接続
- `useC4DataSource` に `releases`・`selectedRelease` を追加
- `AnalyticsPanel` のスクロール可能エリアとスクロールバートークンを追加
- セッションリストの高さを固定（選択時 726px、未選択時 maxHeight）
- `SessionCommitList` を右カラム下部に移動
- セッションリストの Commits 列に追加/削除行数を表示
- セッションリストに全 4 トークン種別と init→peak コンテキストトークンを表示

### 変更

- サイドバイサイドレイアウトのブレークポイントを `md` から `lg`（1200px）に変更
- 右カラムを 600px に拡大
- `SessionCommitList` は 5 行を超えるとスクロール
- 期間別コストを `DailyActivityChart` の Cost モードに統合
- コストグラフを Current/Optimized に簡略化
- `SessionCacheTimeline`・`SessionCommitList`・`DailySessionList` の閉じるボタンを削除
- `SHOW_LIMITED` を `SHOW_UNLIMITED`（論理反転）にリネーム
- `SupabaseTrailReader` を `release_files`/`release_features` に対応
- C4 データの HTTP/WS 二重取得を廃止し、HTTP 初期取得を復元

### 修正

- コミットが見つからない場合の `SessionCommitList` 高さ
- `CyclingCard` のキーと配置
- `SupabaseTrailReader` に `getCostOptimization` を追加

### アクセシビリティ

- WCAG 2.2 AA クイックウィンと短期修正を適用

## [0.2.1] - 2026-04-11

### 追加

- Analytics タブにコスト最適化セクションを追加
- コスト最適化分類エンジンとルール設定を追加
- モデル価格定数とコスト計算機を追加
- コスト最適化データ取得 API と型定義を追加

### 修正

- 日付選択時のセッションフィルタをローカルタイムゾーン基準に修正

## [0.2.0] - 2026-04-09

### 追加

- Supabase リモートデータソース連携（`SupabaseTrailReader`）
- `ITrailReader` インターフェース（リモートデータアクセス抽象化）
- セッション中断検知とコンテキストトークン表示
- ツールコール解析（Retry/Build/Test 失敗メトリクス）
- セッション効率メトリクス（12指標パネル、概要カード拡張）
- トークン効率カード（Tokens/Step、Cost/Step）
- セッション・コミット相関（`SessionCommitList` コンポーネント）
- セッションキャッシュタイムライン、ピークコンテキスト列
- MUI X Charts による Analytics 強化（コスト切替、期間セレクタ、セッションドリルダウン）
- Init Context 列とバッチコンテキスト統計クエリ

### 変更

- Anytime Trial デザインシステム適用（ダーク/ライトモード対応）

### 修正

- システムメッセージとトレースメッセージバブルからタイムスタンプを削除

## [0.1.0] - 2026-04-08

### 追加

- 初回リリース: Claude Code 会話トレース可視化パッケージ
- JSONL セッションパーサーとメッセージツリービルダー
- LINE 風チャットバブル UI
- セッション一覧（ブランチ・モデル・日付範囲フィルタ付き）
- トレースツリー（折りたたみ可能なメッセージ階層）
- ツールコール詳細表示
- 統計バー（トークン使用量集計）
- Claude Code バージョン・モデル表示
- 会話ターン間のディバイダー
- 評価パネル（v1.1）
- プロンプト管理パネル（v1.1）
- Analytics タブ（コスト推定・ツール使用量統計）
- `useTrailDataSource` フック（データソース抽象化）
- テーマ対応スタイリング（ライト/ダークモード）
