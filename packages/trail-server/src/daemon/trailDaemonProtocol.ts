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
   * 除外パターン (`.anytime/analyze-exclude`) を読むルートの絶対パス。
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
  /** コードグラフ解析・exclude 読み込みに使うリポジトリルート。 */
  readonly gitRoot?: string;
  /** memory (better-sqlite3) DB ファイルの絶対パス。省略時は MemoryApiHandler が無効化される。 */
  readonly memoryDbPath?: string;
  /** HTTP サーバの希望ポート。EADDRINUSE 時は +1..+9 → 0 (OS 任意) の順で試みる。 */
  readonly preferredPort?: number;
  /**
   * tree-sitter-python.wasm の絶対パス。bundle 環境で Python コードグラフ解析を有効化する。
   * 省略時は Python 解析が無効になる（TS のみ）。
   */
  readonly pythonWasmPath?: string;
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
    };

export type HostMessage = HostRequest;
export type DaemonMessage = DaemonResponse | DaemonEvent;
