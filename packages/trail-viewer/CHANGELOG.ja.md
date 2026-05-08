# 変更履歴

`@anytime-markdown/trail-viewer` に対するすべての重要な変更をこのファイルに記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.16.0] - 2026-05-08

### 追加

- C4 オーバーレイ凡例: coverage・importance・defect-risk・dead-code・DSM-cyclic・サイズ系メトリクスを離散セグメントバーに統一
- C4 オーバーレイ凡例: coverage を 3 色連続グラデーション横バーに変更
- C4 オーバーレイ凡例: サイズ系閾値ラベルを境界位置に表示し、左端に最大値・右端に 0 を配置
- C4 オーバーレイ凡例: 全オーバーレイで左→右に値が大きくなる方向に統一
- C4 オーバーレイ凡例: 各オーバーレイタイプに `?` アイコンとヘルプ Tooltip を追加
- Hotspot: popup に churn メトリクスを追加し、defect-risk/hotspot のゲートを削除
- 要素ツリー検索ボックスにクリアアイコンを追加
- メッセージタブフィルタの幅を C4 model タブと統一し、クリアボタンを追加
- オーバーレイセレクタ: リポジトリ選択プルダウンを昇順ソートに変更
- オーバーレイセレクタ: データ非依存時のオーバーレイを disabled 制御し、DSM を既定に変更

### 修正

- Hotspot overlay の凡例が表示されない問題を修正
- MetricsReader の Materialized View クエリ URL 長超過の回避策を追加

### 変更

- MatrixPanel から DSM ビューを削除し、popup メトリクスを overlay と整合
- Hotspot から `subagent` 粒度オプションを削除

## [0.15.0] - 2026-05-04

### 追加

- C4 ポップアップをリサイズ・最大化可能に（Matrix/Graph パネル）
- C4 ポップアップのメトリクスをサイズ・品質・構造にグループ化
- C4 要素パネルにグラフ/マトリクスポップアップとコミュニティグラフアイコンを追加
- オーバーレイセレクタをカテゴリ + サブ項目の2段構成に変更
- MatrixPanel にコミュニティ色分けトグルを追加
- コンテキストメニューから TRACE タブへの C4 シーケンスサブタブ連携
- `useCodeGraph` が release・repo オプションに対応

### 修正

- 情報パネルにコード（C4）要素のコミュニティを表示
- コミットデータがない場合に HotspotControls ポップアップを非表示
- コミットが存在しない Hotspot に "-" インジケータを表示
- データ未取得時にオーバーレイ下段 Select 全体を disabled 表示
- リポジトリ切替時にオーバーレイ選択をリセット
- coverage/DSM/complexity の空エントリをデータなしとして扱う
- Hotspot/欠陥リスク API をリポジトリ依存に変更
- C4 コンテキストメニューがグラフ描画型ではなくドメイン型を使用するよう修正

### 変更

- C4 レベルラベルを L1-L4 から C1-C4 にリネーム
- Hotspot 設定をトップツールバーから C4 設定ポップアップに移動
- Temporal Coupling コントロールを C4 と CodeGraph パネルで共有
- セッション・日次トークン量表示を削除
- `TraceTimeline` を `MessageTimeline` にリネーム
- 孤立 i18n キー 30 件を削除、タブラベルキーを `viewer.tab.*` に統一
- `viewer.tab.c4` を `viewer.tab.model` にリネーム
- `trace.*` i18n キーを `message.*` に統合

## [0.14.0] - 2026-05-03

### 追加

- C4 グラフノードへの F-cMap オーバーレイ表示
- Matrix パネル: DSM L4（コードレベル）
- Matrix パネル: Cov L3/L4 のコンポーネント/パッケージ/コードレベル切り替え
- Cov ビュー: 複雑度・欠陥数・LOC・変更コミット数列
- Cov ビュー: コミュニティラベル色とカバレッジ色付け
- DSM: ラベルセルへのコミュニティ色塗りつぶし
- Cov L3/L4 行ラベルへの祖先パンくず表示
- C4 要素の Ctrl+クリック複数選択
- L4 要素の右ポップアップへ関数一覧表示
- L4 右クリックメニューへ「ファイルを開く」追加
- Trace タブ（TraceViewer 統合）
- オーバーレイ凡例を C4 ポップアップ内に移動
- モデルタブ要素ポップアップへのステップ数表示

### 修正

- DSM L4 を C4 code 要素の集約に変更（ファイル直参照から修正）
- Complexity 列を totalCount（数値）で表示
- Cov ビューの数値列を右寄せ表示
- Drill Down 時に選択状態をクリアする
- 列ヘッダー 90° 回転を DSM ビューのみに限定
- Matrix パネルの SpreadsheetGrid で showHeaderRow を無効化
- Matrix パネルの Sheet ラッパーに display:flex を追加しスクロール修正
- Space パンと Ctrl+クリック複数選択の動作不具合を修正

### 変更

- Matrix ビューのボタン順序を Cov / DSM / F-cMap に変更
- レベルボタンを L2/L3/L4 表記に統一（旧 C2/C3）
- DSM と Cov のレベル選択を単一の state に統合
- C4 タブラベルを「C4 Model」に変更
- SpreadsheetGrid でツールバーを非表示
- パン/ズーム: Shift+ホイールでズームに戻す
- trail-viewer コンポーネントの重複ロジック・未使用コード削除

### 削除

- MatrixPanel から Heatmap ビューを削除
- 要素選択ポップアップから DSM メトリクス表示を削除
- CodeGraphPanel から欠陥リスク表示を削除
- CodeGraphPanel から再読込ボタンを削除
- Heatmap の Subagent モード表示を削除

## [0.13.0] - 2026-05-02

### 追加

- ページロード時の初期タブ選択用 URL パラメータ `?tab=` を追加
- ページロード時の初期 C4 階層レベル指定用 URL パラメータ `?c4level=` を追加
- URL 経由で Traces タブを開いたとき最初のセッションを自動選択
- メトリクスカード・チャートトグル・円グラフタイトルにヘルプツールチップを追加
- ノード選択時に関連しない C4 グラフ要素を減光表示

### 修正

- `CyclingCard` のレイアウトを統一（ラベル左揃え・値中央揃え・単位を値の右に配置）
- カードの高さを統一し、値の縦位置を揃えるよう修正
- `useTemporalCoupling` で空の `serverUrl` を許容するよう修正
- メッセージ読み取りウィンドウを最大90日に拡張
- `PromptManager` で使用していた `sectionBg` トークンを `ThemeColors` に追加
- テストモックに `range` メソッドと `trail_current_coverage` ハンドラーを追加

## [0.12.0] - 2026-04-28

### 追加

- Trail viewer に Code Graph タブとパネル UI を追加
- グラフ可視化向けに `CodeGraphCanvas`（sigma.js）と `useCodeGraph` フックを追加

### 修正

- コンテナ寸法が確定するまで sigma 初期化を遅延
- Code Graph 描画で無効な x/y 座標を許容して回帰を防止

## [0.11.0] - 2026-04-26

### 追加

- ターンごとの API 推論時間とツール実行時間を示す Timing Breakdown チャートを追加
- Session Timeline にツール/スキルモード切り替えトグルを追加
- Session Timeline にツール使用トークンバーを追加（右 Y 軸）
- Session Timeline の全チャートにコミット・エラー参照線を追加
- Session Timeline 下に Turn Lane Chart を追加（ターンごとのモデル/ツール/スキルストライプ表示）
- サブエージェントのトラック数に応じた動的タイムライン高さ（5つ以上でスクロールバー）
- エージェントごとのサブエージェントレーンを追加（支配的ツールカラーで着色）
- エラーの逆三角形マーカーとホバーツールチップを追加
- コミット三角形マーカーとタイムスタンプベースのフォールバック検出を追加
- サブエージェントタイムラインのツールチップにツール名を表示
- セッション Usage カードにトークン・コスト・メッセージ数・エラー数を追加
- DORA メトリクスを個別の展開可能な概要カードとして追加
- Error/CommitType 円グラフの中央に合計数を表示

### 変更

- 3チャートレイアウトを単一スタック Session Timeline に統合（Session Cache Timeline から改名）
- 全チャートの X 軸を揃え、幅全体にまたがる参照線を追加
- Error/CommitType バーチャートを横並びの円グラフに変更
- TurnLaneChart のモデルバーを細いモデルカラーストライプに変更
- SessionCacheTimeline をセッションリスト下に移動（全幅表示）
- セッション Usage/Productivity カードのメトリクスを再編成；Total Commits / Lines Added を Usage カードに移動
- DORA メトリクスを個別カードに展開；Lines Added → Total LOC に改名
- TurnLaneChart で連続する同一モデル/ツールの実行を単一矩形に統合
- スキルバーの高さを 8px に設定、ツール/モデルバー下の独立行として表示

### 削除

- 日次サマリービューから `SessionModelUsageChart` を削除
- Quality Metrics タブを削除
- OverviewCards から Quality・Productivity 集約カードを削除
- セッション詳細から Related Commits テーブルを削除
- セッション詳細からモデル使用チャートを削除
- Usage 概要カードからキャッシュヒット率を削除
- Session Timeline トークンチャートから累積推論量を削除

### 修正

- TurnLaneChart でスキルストライプが表示されない問題を修正
- 破線参照線を X 軸でクリップし、チャート上部に固定
- 全チャート X 軸を揃えるため Y 軸幅を明示的に設定
- コミットプレフィックス正規表現を修正；session_commits ハッシュフォールバックを追加
- セッション読み込み中に DailySessionList でローディングスピナーを表示
- `sessionsLoading` を `loadSession` のローディング状態から分離

### パフォーマンス

- `getSessions` から重い `trail_message_tool_calls`・`trail_session_commits` クエリを除去

## [0.10.0] - 2026-04-25

### 追加

- Activity タブにスタック形式のリリース品質チャートを追加
- Activity タブにリリーストグルとデプロイ頻度バーチャートを追加
- リードタイムバーをコミットプレフィックスでスタック表示、トグル付き
- Activity コミットチャートに commits / LOC トグルを追加
- ドリルダウンパネルにセッションごとのコミットプレフィックスチャートを追加
- Activity タブにコミットプレフィックスのスタックチャートを追加
- `DailyActivityChart` に Tokens/LOC または Cost/LOC のラインオーバーレイを追加
- コミットチャートに AI ファーストトライ成功率のラインオーバーレイを追加
- 生産性閾値ダイアログを追加
- `MetricCard` で `minPerLoc` と `tokensPerLoc` をフォーマット表示
- リードタイムツールチップに未マップコミット数を表示
- 品質指標チャートに日付付き X 軸を表示

### 変更

- ビューアータブを「activity」と「messages」にリネーム
- `leadTimeForChanges` ラベルを `leadTimePerLoc` / `tokensPerLoc` に置き換え（i18n）
- 新しいメトリクス入力形状に合わせて Supabase リーダーを更新
- i18n: 閾値ダイアログの指標列ヘッダーをローカライズ
- `DeltaBadge` のネストした三項演算子をヘルパー関数にリファクタリング

### 修正

- リリースチャートがメトリクスを取得中にスピナーを表示するよう修正
- `Intl.DateTimeFormat` インスタンスをレンダリングループ外に抽出
- `AnalyticsPanel` に `fetchQualityMetrics` を正しく接続

### パフォーマンス

- リリースチャート表示中は品質指標の取得をスキップ
- リリースチャート専用のデプロイ頻度エンドポイントを追加

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
