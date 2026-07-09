# 変更履歴

"Anytime Trail" 拡張機能の主な変更をこのファイルに記録します。

形式は [Keep a Changelog](https://keepachangelog.com/) に基づいています。

## [Unreleased]

## [0.32.0] - 2026-07-09

### 追加

- `get_verification_status` MCP ツール: 検証台帳 (`verification.db`) を読み取り、どの検証コマンドが実行されたかを返す。保護領域パスガードと `busy_timeout` 付き。

### Trail Core (trail-core / trail-server / trail-viewer / agent-core)

- `agent-core`: worker エントリで `argv` 由来の `workspaceRoot` を検証し、`chmod` 失敗を警告する。
- `trail-viewer`: `flatMap` への単項コールバック直渡しを明示ラップへ変更 (CodeQL js/superfluous-trailing-arguments)。
- `trail-server`: 非 Promise への不要な `await` を除去 (Sonar S4123)。

## [0.31.2] - 2026-07-02

### Trail Core (trail-viewer)

- 脱React パリティ再監査: C4・シェル/パネル・logs/messages/memory・analytics ツールチップ・C4 ツールバー（i18n/a11y）・C4 canvas の動的 aria-label・codeGraph/evaluation/sessionList パネルの挙動/見た目回帰を復元、ローディング/空状態の表現を復元、指標カードの `?` ヘルプを円囲みアイコン化、可視ラベル・aria・variant を復元（Alert フォールバック色・Spinner aria）。

## [0.31.1] - 2026-06-30

### セキュリティ

- 同梱依存をセキュリティ更新: `ws` 8.20.1 → 8.21.0、`dompurify` 3.4.0 → 3.4.11。

### 変更

- 同梱の `anytime-dev-health` スキル: 意図的簡略化マーカー（`// SHORTCUT: … ceiling … upgrade`）の走査・台帳化を追加。

## [0.31.0] - 2026-06-27

### 変更

- ドキュメント: Stop フックスクリプトを `token-budget.sh` に変更（旧 `trail-token-budget.sh`）。当該フックは Anytime Agent 拡張が登録します。

### Trail Core (trail-viewer)

- C4: `classifyLayer` 配線による層注釈・可視化、Scatter / Code Graph ポップアップの vanilla 配線完成、要素ツリーの種別バッジを SVG アイコン化、C4 左パネルのコントロールを高さ上限付き 1 列へ集約（Ghost Edges / Hotspot / オーバーレイ凡例 / defectRisk・TC の重なり解消）、選択要素 詳細パネルの欠落セクション復元とフォント拡大、C4 層コンテナ自動シード（Phase 4）の撤去。

## [0.30.1] - 2026-06-24

### Trail Core (trail-viewer / memory-core)

- `trail-viewer`: resizable ポップアップの全画面化／リサイズ回帰を修正、combined チャートの ↗ ポップアップトリガを復元、ポップアップ右上アイコンの色をテーマ色に一致。
- `memory-core`: failed-items retry が `conversation_incremental` scope も拾うよう一般化、`spec_incremental` の partial 警告を解消（`reference` 型追加＋`related:` 専用 frontmatter のソフトスキップ）。

## [0.30.0] - 2026-06-23

### 追加

- `anytime-dev-health`・`anytime-cross-review`・`anytime-token-budget` スキルを同梱し、activate 時に `<workspace>/.claude/skills/` へ自動配置（`installStaticSkillDir` による version 差分上書き）。

### Trail Core (memory-core / doc-core / trail-server)

- `memory-core`: review ingest で `reviewer` / `severity_overall` を記録し、`linkAddresses` のコミット窓を `reviewed_at` アンカーに変更して review→対処ループの紐付けを解消（RC1）。
- `memory-core`: review session パーサが本文 2048 字切り詰めで後半 finding を脱落させ、明示 `重大度:` マーカーを無視していた問題を修正（全文パース＋マーカー優先）。
- `memory-core`: drift の合成 subject ID（`file:` / `package:` 等）を正準 entity へ写像し FK silent ドロップを解消（RC5）。
- `doc-core` / `trail-server`: doc-core ランナーを trail daemon 子プロセスへ配線し、embed の silent failure を止血（per-item 耐性化＋ステータス永続化）、embed 入力を 3000 字に切り詰め bge-m3 の context length 超過を回避（RC3）。

## [0.29.0] - 2026-06-22

### Trail Core (trail-viewer / mcp-trail / trail-server / chart-core)

- `mcp-trail`: discovery ツールを追加 — `get_important_files`・`get_code_dependencies`（既存 TrailDataServer の HTTP 解析をラップ）に加え `query_code_graph` / `find_code_path` / `get_cochange_partners`。
- `mcp-trail`: `query_code_graph` を検索専用に再設計（既定 depth=0・ノードサイズ順ランキング・detail モード）。誘導部分グラフとエッジ上限で結果膨張を抑制。
- `trail-viewer`: `ui-core` ベースの素 DOM へ全面移行（React/@mui を置換）。Trace/Prompts は vanilla→React ブリッジで島として存置。`@mui` / `@mui/x-charts` / `@emotion` 依存を除去。
- `trail-viewer`: 全チャートを `chart-core` Web Component（`<anytime-chart>`）へ移行。`AnytimeChartView` ラッパと円・積み上げ棒の spec 変換を追加。
- vanilla/chart 移行中に表面化した複数のリグレッションを修正（C4 レベルボタン、C4/Prompts 空表示、埋込時のポップアップ覆い、棒グラフ選択ハイライト、combined チャート系列）。

## [0.28.0] - 2026-06-20

### Trail Core (trail-core / trail-server / mcp-trail / memory-core)

- `doc-core` パッケージを新規追加。構造索引・FTS5 キーワード・embedding による意味検索を単一の `doc-core.db` に内包（日本語向け trigram トークナイザ）。
- `mcp-trail` に `search_docs` ツールを追加し、`doc-core.db` 横断検索を公開。
- `trail-server` daemon に `doc-core` を配線。ドキュメントルートを `lep.json` の `sources.docs.root` から取得するよう変更（旧 `DOC_CORE_DOCS_ROOT` env 廃止）。
- `memory-core` episode 要約の永続化漏れを修正（ollama INSERT に `summary` 列を追加）し、文書全体の spec 要約 `summarizeSpecDoc` を新設。

## [0.27.2] - 2026-06-13

### Trail Core (trail-core / trail-viewer)

- バンドルされた C4 ビューアが React 結合のキャンバスヘルパー（`useCanvasBase`・`MinimapCanvas`）を `graph-react-islands` から import するよう更新（graph-core の React peer 依存除去に追従）。

## [0.27.1] - 2026-06-13

### 修正

- TypeScript 6.0.3 へアップグレード（ビルドツールチェーン更新）。

### Trail Core (trail-core / trail-server / memory-core)

- daemon の dispose を SIGKILL エスカレーション化し、Extension Host クラッシュ時の daemon 孤児化を防止。
- `bug_history` スイープを event loop へ定期 yield し、大量データ時のブロッキングを緩和（perf）。
- `ChatBridge.dispose` の await 漏れを修正（S4822）。
- trail-core / memory-core の SonarCloud 指摘を解消。

## [0.27.0] - 2026-06-08

### 修正

- `VSCODE_NODE_TARGET` を 24.15.0 へ更新し、Node 24 ABI 向けの `better-sqlite3` を同梱。`prepare-native` の reuse をターゲット一致時のみに限定。

### Trail Core (trail-server / memory-core)

- trail-server: `computeImportance` の CodeQL tainted-format-string・log-injection を解消し、`openReadOnly` の未 await async attach を修正。
- memory-core: 埋め込み用正規表現を堅牢化（S5850 / S5868）し、embedding ヘルパに Stryker ミューテーションテストを追加。

## [0.26.0] - 2026-06-03

### 修正

- MCP コマンドハンドラを await し、トレースターミナルを再利用。

### Trail Core (trail-core / trail-server / trail-viewer)

- `lep.json`: primary analyzer (ReleaseResolver / CoverageImporter / BehaviorAnalyzer / CommitFilesBackfiller / SubagentTypeBackfiller / MessageCommitMatcher) を個別 toggle 可能に。
- trail-server: チャット初期化を直列化し、analyzer エラーの握りつぶしを停止。
- trail-core: コールグラフの循環・null エントリ・ゼロ除算・O(n^2) 集計を修正。
- trail-viewer: 非同期レース / ページネーション欠落 / フレームごとのキャンバスリセットを修正し、C4 / プロンプト取得を初回アクセスまで遅延。
- trail-db: `SyncService` でメッセージカットオフを SQL 側に押し込み。

## [0.25.0] - 2026-05-31

### 追加

- `lep.json` が存在しない場合、アクティベート時に既定値で自動生成する。
- `lep.json` のワークスペース設定を一気通貫で配線: `configPaths`・`defaultRepoName`・トレースディレクトリ注入により、データサーバー / デーモンを単一 git ルートから分離。

### 変更

- デーモンの HTTP サーバーを `configure()` から分離し、`lep.json workspace.excludeRoot` / `configPaths` をデーモンの `CodeGraphService` とデータサーバーへ貫通。

### 修正

- 本番パッケージング前に `dist` をクリーンし、古い成果物を VSIX から除外。
- trail フックの `TRAIL_HOME` をワークスペースルートに固定（`vscode-common`）。

### Trail Core (trail-core / trail-server / trail-db)

- `trail-server`: `/config` の lep ヘルパーと `workspace.configPaths` スキーマを追加。トレースディレクトリと既定リポジトリ名を注入し、表示を単一 git ルートから分離。
- `trail-db`: better-sqlite3 を開く前に `init()` で DB の親ディレクトリを作成。

## [0.24.0] - 2026-05-29

### 追加

- C4 モデルビューに L5 関数レベルグラフビューアを追加。コンポーネントを選択すると関数コールグラフを確認できる (新 C4 レベル5)。
- C5 コンポーネントスコープ: 関数グラフを container / system に加えて個別コンポーネント単位に絞り込めるよう対応。

### 変更

- 拡張ホストを trail-daemon アーキテクチャ (`DaemonClient` 経由の HTTP + IPC クライアント) へ移行。`extension.js` のバンドル TypeScript ゼロのマイルストーンを達成。

### 修正

- node バンドルでオプショナルなネイティブ依存を externalize し、解決失敗を回避。
- `ChatBridge` のリークを解消し、デーモンのエラーログを強化。

### Trail Core (trail-core / trail-server / memory-core / mcp-trail)

- trail-server: `/api/c4/function-graph` エンドポイントと、IPC 解析パイプラインを持つ trail-daemon ホスト (`AnalyzeAllRunnerClient` / `AnalyzeCommandClient`) を追加。`/services` `/analyze-utils` `/llm` `/github` `/config` サブパスを追加。
- trail-core: L5 関数グラフエンジン (`filterTrailGraphByElement`) と、`simple-icons` をバンドルから除外する生成済みサービスアイコンデータ。
- memory-core / mcp-trail: TypeScript 依存の export を `/pipeline` `/query` サブパスへ分離し、ルートバレルを TypeScript-free に維持。

## [0.23.2] - 2026-05-27

### 修正

- `analyze_current_code` が `current_code_graphs` とコミュニティを、解析対象ワークスペースと同じリポジトリに保存するよう修正（呼び出しごとの `repositories` 上書き）。従来は統計（解析対象ワークスペースに保存）とコードグラフ・コミュニティ（activate 時固定 repo に生成）が別プロジェクトにズレることがあった。

### セキュリティ

- `handleTraceFile` に解決済みパスの包含チェックを追加し、path injection (S2083) を多層防御。
- analyze 子プロセスの結果を `mkdtempSync` で作成した private ディレクトリに書き込み、insecure temporary file を解消。
- `parseGitHubRemote` を `indexOf` ベースに置換し、polynomial ReDoS を解消。

### ビルド

- 開発・ビルド成果物をパッケージから除外し、VSIX サイズを約40%削減。

### Trail Core (trail-core / trail-server / trail-db / memory-core)

- trail-server / trail-db / memory-core / trail-core 全体で認知的複雑度 (S3776) を削減。
- trail-db にカバレッジ向上テストを +181 追加（パッケージカバレッジ 77.5% → 80.6%）。
- SonarCloud 機械的安全修正（S4624 / S7735 / S7780 / S4325 ほか）多数。

## [0.23.1] - 2026-05-26

### 変更

- コード解析の重い TypeScript 解析を隔離した子プロセス（`analyze-child`）で実行するようにした。解析中のネイティブクラッシュで拡張ホストが巻き込まれなくなり、ホストは生存して 1 回リトライし、不透明な失敗ではなく構造化エラーを返す。
- パイプラインパネルで LEP の 4 ウェーブをすべて表示し、ウェーブ単位でグループ化。
- `analyze-exclude` / `excludeRoot` を開いている VS Code ワークスペースフォルダ（`lep.json` の `workspace.excludeRoot`）基準で解決。
- `tsconfig.json` の無い Python-only リポジトリの解析に対応。

### 修正

- 解析後に `model-updated` を通知し、C4 モデルビューを更新する。

### ビルド

- webpack マルチ config を逐次ビルド（`parallelism: 1`）してピーク負荷を下げ、Node 24 / WSL2 の非決定的 SIGSEGV を緩和。

### Trail Core (trail-core / trail-server)

- 重い TS 解析を子プロセスへ隔離（計算は子・永続化はホスト）しクラッシュ耐性化。
- flow / sequence 解析器が共有する言語非依存の CFG-IR を導入。
- 解析パイプラインに Python ファイル分類（ui / logic / excluded）を適用。
- Ollama 負荷スロットル: COOLING 中は会話スコープをスキップ。
- in-repo の built `.d.ts` 解決 import をソースノードへ救済。
- コードグラフの kind バッジをローカライズ（`c4.kind.*`）。

## [0.23.0] - 2026-05-24

### 変更

- trail-viewer: current C4 model が空のときにリポジトリ / リリースセレクタを表示
- `trail_repos` の embed の曖昧性を解消（`!repo_id`）

### Trail Core (trail-core / trail-server / trail-db / memory-core)

- `trail-core`: Python 多言語コードグラフ解析（tree-sitter-python、import / 継承 / 呼び出しエッジ、`PythonExportExtractor`、関数一覧 / ツリー、importance 算出）
- `trail-core`: Ollama サーマルスロットル（`OllamaThrottleGovernor`）— EWMA レイテンシ・エラー・連続稼働上限で検知し、バックグラウンド解析を直列化。`lep.json` に `throttle` セクション追加
- `trail-core`: リポジトリ正規化 — `repo_id` / `release_id` を導入し Supabase ミラーと同期

## [0.22.1] - 2026-05-21

### セキュリティ

- `trail-db` のセッションメタデータ解析（`sessionMeta`）の多項式 ReDoS を修正（S5852 / js/polynomial-redos）
- `trail-db` `GitStateService.getCommitsSince` の OS コマンドインジェクションを修正

### Trail Core (trail-core / trail-db / mcp-trail / memory-core / trail-server)

- `trail-core`: SonarCloud 指摘を解消（S3358/S2871/S4325/S7748/S6397/S3735 ほか）
- `trail-db`: SonarCloud 指摘を解消（S4325/S3358/S7718/S7776/S3863/S1854 ほか）
- `mcp-trail`: SonarCloud 指摘を解消（S1874/S7735/S4325/S7772/S2486/S4043）。sqlite/tools のカバレッジを改善（`searchMemory`/`read`/`write`/`client`/`dbPath`/`sqlJsUtil` を 100% に）
- `memory-core`: カバレッジを改善（ステートメント 85.6→92.1%・ブランチ 69.9→77.7%）
- `trail-server`: `TrailDataServer` WebSocket 統合テストを追加（ステートメント 52→57%）。LEP パイプライン（analyzers/ingesters）と server/analyze/runtime のカバレッジを改善
- `vscode-common`: `claudeHookSetup`/`installSkills` のカバレッジを改善（69→94% / 75→99%）

## [0.22.0] - 2026-05-20

### 追加

- **LEP (Layered Event Pipeline) — GitHub PR review 取り込み**: `GitHubPrReviewIngester` が GitHub PR レビューの finding を新たな `github_pr_review` ソースイベントとして取り込む。`FindingAnalyzer` が finding を解析して DB に書き込む
- **LEP — DORA メトリクス集計**: Layer 4 `DoraMetricsAggregator` が統合イベントストリームからデプロイ頻度・リードタイム・変更失敗率・MTTR を算出
- **LEP — クロスソース相関**: `CrossSourceCorrelator` がコミット・セッション・PR レビューを横断的に紐付け、`cross_source_correlations` を DB に書き込む。Trail viewer での関連シグナル表示を可能にする
- **`lep.json` 設定一本化**: `LepConfig` スキーマを全パイプライン設定をカバーするよう拡張。起動時に `config.json` を自動移行・リネーム。スケジュール / LLM / メモリ / `gitRoots` は `lep.json` に一本化

### 変更

- **LEP — ステージ enum と `memory` スコープスキップ**: パイプラインステージにメモリ処理が含まれない場合、memory スコープを失敗でなく `skipped` 表示するよう変更
- **LEP — LLM プリフライトヘルスチェック**: メモリ解析ステージ前に LLM 到達性チェックを実施。到達不能な analyzer は部分スキップとして報告し、残りを継続実行
- **`memory-core` 7 analyzer 分解**: モノリシックなメモリパイプラインを `lep.json` 配線で動作する 7 つの focused analyzer に分割

### 修正

- `LEP ingester → consumer` 初期化順序バグ: `LepOrchestrator` 起動順を修正し、`import_sessions` イベントが 0 件になる問題を解消
- `ollama-core` / `memory-core` split-brain: `resolveOllamaBaseUrl` が `lep.json` から単一の権威ある `baseUrl` を解決し、daemon と拡張間の設定分岐を排除

### セキュリティ

- `trail-server` の 13 件の HTTP 500 ハンドラでスタックトレース露出をサニタイズ
- `trail-server` / `vscode-trail-extension` で `fetch` 前にデーモン URL を検証
- `memory-core` のトレール添付一時ファイルに `mkdtempSync` を使用し TOCTOU 競合を排除
- spec/install/loader の 4 パスで TOCTOU ファイルシステム競合を解消
- `hono` / `mermaid` / `next-intl` / `ws` を更新し中程度 CVE 4 件をパッチ

### Trail Core (trail-core / trail-server / memory-core / trail-db)

- `trail-server`: `Config.ts`（`config.json` ローダー）を削除。デーモンと拡張を完全に `lep.json` に配線
- `trail-db`: 16 メソッドの認知的複雑度を 15 以下に削減（`SyncService.doSync/syncManualElements`・`ClaudeCodeBehaviorAnalyzer.analyze`・`communityCarryOver` resolve ヘルパー・`ExecFileGitService` numstat/namestatus ヘルパー）（S3776）
- `trail-db`: ステートメントカバレッジを 56% → 70% に向上。analytics・search・stats・セッション割り込みの特性テストを追加
- `trail-core`: 30+ 関数の認知的複雑度を 15 以下に削減（S3776）
- `trail-core`: 境界正規表現の範囲を厳密化し多項式 ReDoS を回避
- `trail-db`: `sessions.repo_name` を JSONL の `cwd` フィールドから導出するよう修正
- `memory-core`: E5 テストで `FIX_COMMITTED_AT` をフロントマター日付に固定

## [0.21.0] - 2026-05-17

### 追加

- `anytime-reverse-spec` スキルに chapters 9-11 を追加し、`evaluate=true` + Phase E1-E4 による生成済み spec の評価レポート出力に対応 (`mcp-trail` の新ツール `evaluate_reverse_spec` を活用)
- プロンプトポップアップを `markdown-core` の read-only viewer で Markdown 描画
- Trail Memory タブ: bug 因果情報を構造化パネル化 (旧グラフを置換)、bug-fix セッションへの遷移と "open in messages" アクション、Drift サブタブに `Fix Target` 列とフィルタ、Drift Type ヘルプツールチップ (11 定義一覧)、Reviews サブタブの UX 改善と session reviewer 表示
- Trail Commits 累積エリアチャート (回帰率モード) を追加
- Memory pipeline パネルに "memory backup" 実行を表示 (memory-core.db バックアップローテーション)
- `trail-server` が `repo` パラメータを code-graph および pipeline/refresh ルートまで伝播

### 変更

- 会話履歴 backfill のデフォルトウィンドウを 30 日に拡張。`config.json` の `backfillDays` を広げると自動で再 backfill を発火。`readMessagesSince` を session 単位でストリーミングし、長時間バックフィル中も heartbeat を発行
- Commits 累積チャートの右軸を回帰率 → 修正率 (Fix Ratio) に変更、ウィンドウ前のコミットを cumulative baseline に折り込み
- Memory pipeline 実行を (day, scope) で集約しスタックドチャート化
- `anytime-reverse-spec` テンプレートの 02 / 04 / 07 章構造、05 章 MCP サブカテゴリと節番号を評価用途向けに安定化
- `memory-core` の review finding parser が Sample 1/2/3 セッション形式を認識。backfill 進捗と total を `PipelineStatusWriter` へ転送

### 修正

- `memory-core` の `failed_items` を embedding 成功時にクリア
- `memory-core` の purge スクリプトを transaction で包み、有効な reason を使用
- `memory-core` の会話パイプラインを reload-safe 化 (途中での cursor advance を削除)
- `memory-core/spec` が `90.skill/` を spec 取り込みから除外、`caused_by` の root cause を具体的なエンティティに限定
- `trail-server` でドリフトイベント ID の percent-encoded path param をデコード
- `trail-viewer` の `CombinedDataReader` テストモックを現スキーマに整合

### 破壊的変更

- AI ノートパネルおよび `anytime-trail.openAiNote*` コマンドを削除しました。
  この機能は新規拡張 Anytime Agent (`anytime-trial.anytime-agent`) に
  `anytime-agent.openAiNote*` として移行しました。\
  既存ノート（`.anytime/notes/`）と `anytime-note` スキルはそのまま
  引き続き利用できます（データ移行は不要）。

### リファクタ

- `installBundledSkills` / `installTemplatedSkill` /
  `installStaticSkillDir` と関連テストを `vscode-trail-extension` から
  `@anytime-markdown/vscode-common` に抽出しました。Agent 拡張側で
  同じ skill-installer を再利用するためです。

### Trail Core (trail-core)

- バージョン同期のみ (ソース変更なし)

## [0.20.0] - 2026-05-16

### 追加

- VS Code コマンド `Anytime Trail: Analyze Code (Pick Tsconfig)` (`anytime-trail.analyzeCurrentCodePickTsconfig`) を追加。複数 `tsconfig.json` 環境で従来の QuickPick 選択フローを使いたい場合に呼び出す（コマンドパレットからのみ提供、ダッシュボードアイコンには未バインド）
- VS Code コマンド `Anytime Trail: Register MCP Server (.mcp.json を更新)` (`anytime-trail.registerMcpServer`) を追加。ワークスペースルートの `.mcp.json` に `mcpServers.mcp-trail` エントリを追加・更新（他 server 設定は保持）。`anytimeTrail.viewer.port` を反映した `TRAIL_SERVER_URL` env を含む。パース不能な JSON は `.bak.<timestamp>` に退避してから新規作成
- `seedAnalyzeExclude` の `DEFAULT_ANALYZE_EXCLUDE_CONTENT` を拡充。`.claude/` / `.changeset/` / `.github/` / `.config/` / `.playwright-mcp/` / `.serena/` / `.vscode/` / `__mocks__/` / `demos/` / `dist/` / `**/CHANGELOG.{ja,}.md` / `**/README.{ja,}.md` を初期除外に追加
- `loadConfig` の挙動変更: `config.json` 不在時に DEFAULT_CONFIG を**自動でディスクに書き出す**（拡張・daemon 共通）。書き込み失敗時は in-memory フォールバック
- **Breaking:** VS Code 設定 `anytimeTrail.analyzeAll.enabled` (boolean、既定 `false`) を追加。OFF のとき Pipelines ツリービューは非表示になり、AnalyzeAllRunner も構築されない（自動・手動・HTTP API いずれも no-op）。自動実行を継続したい場合は `true` に設定後リロードが必要
- `anytime-basic-design` skill のバンドル: 新ヘルパー `installStaticSkillDir` 経由で activate 時に自動インストール
- `anytime-note` skill をテンプレートとしてバンドル: 新ヘルパー `installTemplatedSkill` 経由でインストールし、agent notes は `<workspace>/.anytime/notes` に保存
- バンドルされた `anytime-reverse-*` skill ファミリーのリネーム（ディレクトリ・内容・インストールヘルパーを新名に整列）
- マルチリポジトリ対応の `code-graph`: `trail-server` の `/api/code-graph` 現在モード・query/explain/path ルート・pipeline/refresh パスで `repo`/`repoName` パラメータを尊重するように変更し、`CodeGraphService` のキャッシュをリポジトリ単位化
- `mcp-trail` に `list_community_nodes` read tool を追加

### 変更

- `Anytime Trail: Analyze Code` (ダッシュボードアイコン / コマンドパレット) で複数 `tsconfig.json` が見つかった場合の QuickPick を廃止し、ワークスペースルート優先で最浅 tsconfig を自動選択するように変更（HTTP / MCP と挙動を統一）。明示的に選びたい場合は新コマンド `Anytime Trail: Analyze Code (Pick Tsconfig)` を使用
- **Breaking:** `analyzeAll.runOnStart` の DEFAULT を `true` → `false`、`startupDelaySec` を `5` → `30` に変更。AnalyzeAll は明示的な opt-in 操作が前提
- **Breaking:** `TrailServerConfig` を簡素化。`scheduler.*` (periodicImport / memoryCore) と `memory.ingest` を削除し、`schemaVersion` を `1` にリセット。旧フィールドからの**マイグレーションは持たない**
- **Breaking:** memory-core 単位の pause/resume を AnalyzeAll パイプライン (importAll + memory-core runOnce) 単位に一本化
- **Breaking:** VS Code コマンド `anytime-trail.memory.{pause,resume,status}Ingest` を `anytime-trail.analyzeAll.{pause,resume,status}` にリネーム
- **Breaking:** HTTP API `/api/memory-core/{pause,resume,status}` を `/api/analyze-all/{pause,resume,status}` にリネーム
- **Breaking:** trail-server CLI サブコマンド `ingest {pause,resume,status}` を `analyze-all {pause,resume,status}` にリネーム
- AnalyzeAllRunner を新設。importAll → memory-core runOnce のオーケストレーション、pause/resume、ticks/lastRunAt/lastError の永続化を一元管理 (`<TRAIL_HOME>/analyze-all-runner.json`)

### 修正

- `anytime-reverse-spec` のフィーチャー一覧 summary でセル単位パイプエスケープが入らないよう修正
- activate 時に `anytime-note` skill が確実にインストールされるよう修正
- `pipeline-status.json` の reader / writer 整合を維持

### 削除

- **Breaking:** VS Code コマンド `Anytime Trail: Pause/Resume AnalyzeAll Pipeline` を削除（HTTP API / CLI で代替可能、`status` コマンドは残置）
- **Breaking:** VS Code コマンド `Anytime Trail: Analyze Release Code` を削除（MCP / HTTP では継続利用可能）
- **Breaking:** VS Code コマンド `Anytime Trail: Register MCP Server to Claude Code (mcp-trail)` と `buildClaudeMcpAddCommand` を削除（新コマンド `Register MCP Server` に統合）
- `createAnalyzeAllJob` / `createPeriodicImportJob` (AnalyzeAllRunner に置換)
- `TrailDataServer.setMemoryCoreService` (AnalyzeAllRunner が hosting する)
- trail-server / vscode-trail-extension の後方互換 shim を撤去

### セキュリティ

- 多項式バックトラッキング（ReDoS）対策として正規表現リテラルを強化
- webview message listener で origin 検証を追加

### Trail Core (trail-core)

- `DEFAULT_ANALYZE_EXCLUDE_CONTENT` を拡充
- **Breaking:** agent マッピングを `trail-core` から新パッケージ `agent-core` に移動
- 正規表現リテラルの ReDoS 対策を強化

## [0.19.0] - 2026-05-15

### 変更

- **Breaking:** ワークスペース設定フォルダを `.trail/` から `.anytime/` にリネーム。対象ファイルは `analyze-exclude` / `dead-code-ignore` / `commit-categories.json` / `tool-categories.json` / `skill-categories.json` / `anytime-history.json`。既存ワークスペースは手動で `.trail/` → `.anytime/` にリネームが必要
- **Breaking:** Trail DB と Claude Code ステータスファイル、trace 出力のデフォルト保存先を `.vscode/` から `.anytime/` に変更。設定 `anytimeTrail.database.storagePath` の空既定値、`anytimeTrail.claudeStatus.directory` のデフォルト値 (`.vscode/trail/agent-status` → `.anytime/trail/agent-status`) と trace 出力 (`.vscode/trace` → `.anytime/trace`) が影響。既存環境では設定上書きまたは手動移動が必要
- **Breaking:** memory-core.db のデフォルト保存先を `~/.claude/memory-core/memory-core.db` から `<workspaceRoot>/.anytime/db/memory-core.db` に変更。`MEMORY_CORE_DB_PATH` 環境変数は引き続き優先。既存 DB はユーザー側で手動コピー/移動が必要
- **Breaking:** `TRAIL_HOME` のデフォルトを `~/.claude/trail` から `<workspaceRoot>/.anytime/trail` に変更。`config.json` / `daemon.json` / `daemon.lock` / `memory-core-runner.json` / `pipeline-status.json` / `logs/` / `db/` すべてが新ディレクトリに移動。`TRAIL_HOME` 環境変数は引き続き優先。既存 `config.json` はユーザー側で手動コピーが必要
- **Breaking:** runtime artifact を TRAIL_HOME 配下に集約。`anytimeTrail.database.storagePath` 既定値を `.anytime/db` から `.anytime/trail/db` (`${TRAIL_HOME}/db`) に変更。memory-core.db / pipeline-status.json / trace 出力 / hook state (session-guard / git-state) すべてが `${TRAIL_HOME}/` 配下に集約。`.anytime-trail/metrics-thresholds.yaml` は `.anytime/metrics-thresholds.yaml` に統一
- `*_DB_PATH` 環境変数と未使用の `opts.dbPath` オーバーライドを撤去
- `DaemonClient` に `workspaceRoot` を明示的に渡し、ステータスファイル読み取りを writer のパス解決と共有

### 修正

- `pipeline-status.json` の reader を writer と整合
- VS Code 拡張から `sql.js` を撤去しネイティブ sqlite に統一（Phase 4）

### Trail Core (trail-core)

- `TRAIL_HOME` 集約 — 共有 `getTrailHome` で trail 関連ストレージを解決
- `trail-db` 既定 DB ディレクトリを `<cwd>/.anytime/trail` に変更、`.anytime` を `SNAPSHOT_SKIP_DIRS` に追加
- `mcp-trail` / `memory-core` / `trail-server` を `TRAIL_HOME` 既定に整列、memory-core のフォールバックを厳格化
- `saveCurrentGraph` の OOM 回避のため sql.js を WASM に切替

## [0.18.0] - 2026-05-08

### 修正

- `collectAllRelFilePaths` が CodeGraph node のファイル拡張子を `.ts`/`.tsx` に正しく復元するよう修正
- `CodeGraphService.runAnalyze` が `analyze-exclude` パターンを適用するよう修正
- importance analyzer が `analyze-exclude` パターンを適用するよう修正
- Extension webpack 設定に `extensionAlias` を追加し TypeScript パス解決を修正
- `noRecentChurn` の recent 窓を 90 日から 30 日に短縮
- TypeScript の `moduleResolution` を `bundler` に変更

### 変更

- `.trail/analyze-exclude` の解釈を `.gitignore` 互換に変更。`AnalyzePipeline` の `**/<pattern>/**` 自動ラップを撤去; `!` 否定や `/dist` 形式の root 固定パターンを直接記述可能に。`GraphDetector` も `ignore` インスタンスを受け取れるよう拡張
- `computeAndPersistImportance` が `analyze-exclude` の `Ignore` インスタンスを受け取り、全 SourceFile に除外規約を適用。`__tests__/` や `*.test.ts` 等のパターンが importance 解析にも一貫して効くようになった

### Trail Core (trail-core)

- `.trail/analyze-exclude` が `.gitignore` 互換に; `AnalyzeOptions.exclude` の型を `string[]` から `Ignore` に変更
- `analyze()` が `ts.Program` を `ImportanceAnalyzer` と共有するよう変更
- `mapFileToC4Elements` の絶対パスマッチング修正
- `ProjectAnalyzer.getSourceFiles` が `.d.ts` ファイルを除外するよう修正
- SQLite スキーマに ISO 8601 + Z CHECK 制約と統一されたインデックス命名を追加

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
