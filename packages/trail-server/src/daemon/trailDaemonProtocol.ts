// trail-daemon child process との IPC メッセージ型定義。
//
// JSON-RPC 風: 各リクエストに id を付与し、レスポンスは id で対応付ける。
// イベント (log / progress / phase / afterRun / status) は fire-and-forget。
//
// extension (host) <-> trail-daemon (child) 間で fork + process.send で送受信される。
// すべて JSON シリアライズ可能であること (関数 / class instance / DB handle は含めない)。

import type { ImportAllPhaseEvent } from '@anytime-markdown/trail-db';
import type { RunnerStatus } from '@anytime-markdown/memory-core';

/** BaseRunner.runOnce の reason 引数 (memory-core の RunReason と一致)。 */
export type RunReason = 'startup' | 'periodic' | 'import' | 'manual';

/** daemon が内部で MemoryCoreService を構築するのに必要なシリアライズ設定。 */
export interface SerializableMemoryCoreConfig {
  readonly trailDbPath: string;
  readonly dbPath: string;
  readonly nativeBinding?: string;
  readonly gitRoot: string;
  readonly statePath?: string;
  readonly backfillDays?: number;
  readonly llm: {
    readonly baseUrl: string;
    readonly chatModel: string;
    readonly embedModel: string;
  };
  readonly backupGenerations?: number;
  readonly backupIntervalDays?: number;
}

/** daemon が GitHubReviewClient + gitRemoteReader を構築するのに必要な設定。 */
export interface SerializableGitHubPrReviewConfig {
  readonly token: string | null;
  readonly owner: string;
  readonly repo: string;
  readonly since?: string;
  readonly maxPrs?: number;
}

/** daemon が AnalyzeAllRunner を構築するのに必要なシリアライズ設定全部。
 * 非シリアライズ要素 (logSink / trailDb handle / memoryCoreService instance /
 * callbacks / analyzeReleaseFn / githubPrReview.{client, gitRemoteReader})
 * は daemon 側で構築 or イベントで bridge する。 */
export interface SerializableAnalyzeAllConfig {
  readonly trailDbPath: string;
  readonly gitRoot: string;
  readonly statePath?: string;
  readonly gitRoots?: readonly string[];
  readonly claudeProjectsDir?: string;
  readonly codexSessionsDir?: string;
  readonly stage: 'disabled' | 'sources' | 'primary' | 'memory' | 'primary+memory' | 'all';
  readonly ollamaBaseUrl: string;
  readonly disabledMemoryAnalyzers?: readonly string[];
  readonly disabledAggregators?: readonly string[];
  readonly importAllStatusFilePath: string;
  readonly pipelineStatusFilePath: string;
  readonly githubPrReview?: SerializableGitHubPrReviewConfig;
  /** null なら memory pipeline をスキップ (Wave 1/2 のみ実行)。 */
  readonly memoryCore: SerializableMemoryCoreConfig | null;
  /**
   * ドキュメント検索 (doc-core) の ingest 設定。memory pipeline とは独立した別 DB
   * (doc-core.db) への取込で、未指定/docsRoot 空なら doc-core を無効化する (既定オフ)。
   */
  readonly docCore?: SerializableDocCoreConfig;
}

/** daemon が doc-core ランナーを配線するのに必要なシリアライズ設定。 */
export interface SerializableDocCoreConfig {
  /** ドキュメントリポジトリのルート。空文字なら doc-core 無効。 */
  readonly docsRoot: string;
  /** 埋め込みモデル名 (doc_embedding.model)。ollama baseUrl は親 cfg.ollamaBaseUrl を使う。 */
  readonly embedModel: string;
}

/**
 * daemon が runAnalyzeCurrentCodePipeline を実行するのに必要なシリアライズ可能な引数。
 * 非シリアライズ要素 (trailDb / codeGraphService / callbacks / logger / onProgress)
 * は daemon 側で構築 or イベントで bridge する。
 */
export interface SerializableAnalyzeCurrentCodeRequest {
  /** 解析対象リポジトリのルートディレクトリの絶対パス。 */
  readonly analysisRoot: string;
  /**
   * 除外パターン (`.anytime/trail/analyze-exclude`) を読むルートの絶対パス。
   * 省略時は daemon 側で analysisRoot にフォールバックする。
   */
  readonly excludeRoot?: string;
  /**
   * tsconfig.json の絶対パス。Python-only リポジトリの場合は undefined。
   * undefined を明示的に渡すことができるよう省略可能にしている。
   */
  readonly tsconfigPath?: string;
  /**
   * analyze-child.js (TS 経路を隔離する子プロセスエントリ) の絶対パス。
   * 省略時は daemon 内で在来どおり in-process で計算する。
   */
  readonly analyzeChildPath?: string;
}

/**
 * daemon が runAnalyzeReleaseCodePipeline を実行するのに必要なシリアライズ可能な引数。
 * 非シリアライズ要素 (trailDb / codeGraphService / onProgress)
 * は daemon 側で構築 or イベントで bridge する。
 */
export interface SerializableAnalyzeReleaseCodeRequest {
  /** リリース解析のベースとなる git リポジトリのルートの絶対パス。 */
  readonly gitRoot: string;
}

/**
 * daemon が TrailDataServer + CodeGraphService を起動するのに必要なシリアライズ可能な引数。
 * 非シリアライズ要素 (trailDb handle / logger instance) は daemon 側で構築する。
 */
export interface SerializableHttpServerOptions {
  /** 拡張の dist ディレクトリ。daemon が better-sqlite3 native binding を解決するのに使う。 */
  readonly distPath: string;
  /**
   * TrailDatabase を開くための trail.db 絶対パス。daemon は dirname を DB ディレクトリとして使う。
   * 旧実装は configure() の lastCfg.trailDbPath を参照していたが、HTTP サーバを
   * インポートパイプライン (AnalyzeAllRunner) から分離するため startHttpServer の opts で直接受け取る。
   */
  readonly trailDbPath: string;
  /** コードグラフ解析・exclude 読み込みに使うリポジトリルート。 */
  readonly gitRoot?: string;
  /**
   * 表示エンドポイントが `?repo=` 未指定時に使うデフォルト repo 名 (extension が
   * `basename(wsRootForDb)` を注入)。gitRoots は複数指定され得るため、単一 gitRoot の
   * basename からの導出をやめ主 repo 名を明示注入する。未指定時は `basename(gitRoot)` へフォールバック。
   */
  readonly defaultRepoName?: string;
  /** memory (better-sqlite3) DB ファイルの絶対パス。省略時は MemoryApiHandler が無効化される。 */
  readonly memoryDbPath?: string;
  /**
   * lep.json `workspace.configPaths` から extension が解決した絶対ファイルパス群。
   * daemon は fork 時 cwd 未指定でワークスペースルートを確実に知らないため、categories /
   * metrics をこのパスから読むことで gitRoot 非依存にする。省略キーは `<gitRoot>/.anytime/<file>`
   * へフォールバックする。`TrailDataServer` の `options.configPaths` と同形。
   */
  readonly configPaths?: {
    readonly commitCategories?: string;
    readonly toolCategories?: string;
    readonly skillCategories?: string;
    readonly metricsThresholds?: string;
  };
  /**
   * trace 一覧/取得が読む trace ディレクトリの絶対パス。extension が writer (traceCommands) と
   * 同じ `TRAIL_HOME ?? <wsRoot>/.anytime/trail` + `/trace` で解決して渡す。省略時は
   * daemon 側で `<gitRoot>/.anytime/trail/trace` にフォールバック。
   */
  readonly traceDir?: string;
  /**
   * code graph / C4 解析の除外ルート (`.anytime/trail/analyze-exclude` を読むディレクトリ)。
   * extension が lep.json `workspace.excludeRoot` を `resolveExcludeRoot` で解決して渡す。
   * 省略 (空文字解決で undefined) 時は daemon 側で `opts.gitRoot` にフォールバックする。
   */
  readonly excludeRoot?: string;
  /** HTTP サーバの希望ポート。EADDRINUSE 時は +1..+9 → 0 (OS 任意) の順で試みる。 */
  readonly preferredPort?: number;
  /**
   * tree-sitter-python.wasm の絶対パス。bundle 環境で Python コードグラフ解析を有効化する。
   * 省略時は Python 解析が無効になる（TS のみ）。
   */
  readonly pythonWasmPath?: string;
  /**
   * ChatBridge 構築設定。指定時に daemon 内で ChatBridge を構築し setChatBridge で wire する。
   * 非シリアライズ要素 (trailDb / codeGraphService / server / WebSocket) は daemon 側で wire する。
   */
  readonly chatBridge?: SerializableChatBridgeConfig;
  /**
   * LogService 構築設定。指定時に daemon 内で BetterSqlite3MemoryDb + LogService を構築し
   * setLogService で wire する。
   * 非シリアライズ要素 (broadcaster = TrailDataServer instance) は daemon 側で wire する。
   */
  readonly logService?: SerializableLogServiceConfig;
  /**
   * RebuildScheduler 構築設定。指定時に daemon 内で RebuildScheduler を構築し
   * start() を呼び出して定期実行を開始する。
   * 非シリアライズ要素 (logger instance) は daemon 側で生成する。
   */
  readonly rebuildScheduler?: SerializableRebuildSchedulerConfig;
  /** トークン予算の初期設定。startHttpServer 完了後に setTokenBudgetConfig を呼ぶ。 */
  readonly tokenBudgetConfig?: SerializableTokenBudgetConfig;
  /** ドキュメントパスの初期設定。startHttpServer 完了後に setDocsPath を呼ぶ。 */
  readonly docsPath?: string;
}

/**
 * daemon が ChatBridge を構築するのに必要なシリアライズ可能な設定。
 * getConfig の動的フィールドは staticConfig として渡す (daemon 側でそのまま返す lambda を生成)。
 * logger は daemon 内で daemonLoggerAsLogger から生成する (非シリアライズ)。
 */
export interface SerializableChatBridgeConfig {
  readonly memoryDbPath: string;
  readonly memoryNativeBinding?: string;
  /** ChatBridgeConfig の静的スナップショット。daemon は getConfig: () => staticConfig で wire する。 */
  readonly staticConfig: {
    readonly baseUrl: string;
    readonly chatModel: string;
    readonly embedModel: string;
    readonly bm25Limit?: number;
    readonly vecLimit?: number;
    readonly finalLimit?: number;
    readonly rrfK?: number;
  };
}

/**
 * daemon が LogService 用 BetterSqlite3MemoryDb を構築するのに必要なシリアライズ可能な設定。
 * db handle と broadcaster (TrailDataServer) は daemon 側で wire する。
 */
export interface SerializableLogServiceConfig {
  readonly extensionLogsDbPath: string;
  /** better-sqlite3 native binding への絶対パス。省略時は distPath から導出する。 */
  readonly nativeBinding?: string;
}

/**
 * daemon が RebuildScheduler を構築するのに必要なシリアライズ可能な設定。
 * logger は daemon 内で生成する (非シリアライズ)。
 */
export interface SerializableRebuildSchedulerConfig {
  readonly memoryDbPath: string;
  readonly memoryNativeBinding?: string;
  /** FTS 再構築の実行間隔 (ミリ秒)。省略時は 60 分。 */
  readonly intervalMs?: number;
}

/** トークン予算設定。TrailDataServer.setTokenBudgetConfig と同じフィールド。 */
export interface SerializableTokenBudgetConfig {
  readonly dailyLimitTokens: number | null;
  readonly sessionLimitTokens: number | null;
  readonly alertThresholdPct: number;
}

/**
 * daemon が setDocsPath リクエストを受けたときに渡す引数。
 * docsPath が undefined の場合は setDocsPath(undefined) を呼んでパスをクリアする。
 */
export interface SerializableSetDocsPathRequest {
  readonly docsPath?: string;
}

/**
 * トークン予算超過イベントのペイロード。TokenBudgetUpdatedMessage の
 * シリアライズ可能なサブセット (type フィールドは IPC チャネルで代替するため除外)。
 */
export interface SerializableTokenBudgetExceededPayload {
  readonly sessionId: string;
  readonly sessionTokens: number;
  readonly dailyTokens: number;
  readonly dailyLimitTokens: number | null;
  readonly sessionLimitTokens: number | null;
  readonly alertThresholdPct: number;
  readonly turnCount: number;
  readonly messageCount: number;
}

/** host -> daemon に送れる RPC メソッド名。 */
export type MethodName =
  | 'configure'
  | 'runOnce'
  | 'start'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'getStatus'
  | 'getLastImportResult'
  | 'analyzeCurrentCode'
  | 'analyzeReleaseCode'
  | 'startHttpServer'
  | 'setDocsPath'
  | 'setTokenBudgetConfig'
  | 'dispose';

export interface HostRequest {
  readonly type: 'request';
  readonly id: string;
  readonly method: MethodName;
  readonly params?: unknown;
}

export type DaemonResponseOk = {
  readonly type: 'response';
  readonly id: string;
  readonly ok: true;
  readonly result?: unknown;
};

export type DaemonResponseErr = {
  readonly type: 'response';
  readonly id: string;
  readonly ok: false;
  readonly error: { readonly message: string; readonly stack?: string };
};

export type DaemonResponse = DaemonResponseOk | DaemonResponseErr;

export type DaemonEvent =
  | {
      readonly type: 'event';
      readonly channel: 'log';
      readonly payload: {
        readonly level: 'debug' | 'info' | 'warn' | 'error';
        readonly message: string;
        readonly timestamp: string;
      };
    }
  | {
      readonly type: 'event';
      readonly channel: 'progress';
      readonly payload: { readonly message: string };
    }
  | {
      readonly type: 'event';
      readonly channel: 'phase';
      readonly payload: ImportAllPhaseEvent;
    }
  | {
      readonly type: 'event';
      readonly channel: 'afterRun';
      readonly payload: Record<string, never>;
    }
  | {
      readonly type: 'event';
      readonly channel: 'status';
      readonly payload: RunnerStatus;
    }
  | {
      readonly type: 'event';
      readonly channel: 'httpReady';
      readonly payload: { readonly port: number; readonly url: string };
    }
  | {
      readonly type: 'event';
      readonly channel: 'openDocLink';
      readonly payload: { readonly docPath: string };
    }
  | {
      readonly type: 'event';
      readonly channel: 'openFile';
      readonly payload: { readonly filePath: string };
    }
  | {
      readonly type: 'event';
      readonly channel: 'tokenBudgetExceeded';
      readonly payload: SerializableTokenBudgetExceededPayload;
    }
  | {
      readonly type: 'event';
      readonly channel: 'addNotePage';
      readonly payload: { readonly title: string; readonly contextMarkdown: string; readonly imageDataUrl?: string };
    };

export type HostMessage = HostRequest;
export type DaemonMessage = DaemonResponse | DaemonEvent;
