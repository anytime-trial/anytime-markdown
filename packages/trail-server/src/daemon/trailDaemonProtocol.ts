// trail-daemon child process との IPC メッセージ型定義。
//
// JSON-RPC 風: 各リクエストに id を付与し、レスポンスは id で対応付ける。
// イベント (log / progress / phase / afterRun / status) は fire-and-forget。
//
// extension (host) <-> trail-daemon (child) 間で fork + process.send で送受信される。
// すべて JSON シリアライズ可能であること (関数 / class instance / DB handle は含めない)。

import type { ImportAllPhaseEvent } from '@anytime-markdown/trail-db';
import type { RunnerStatus } from '@anytime-markdown/memory-core';

/** BaseRunner.runOnce の reason 引数。BaseRunner 互換のため string も許容。 */
export type RunReason =
  | 'import'
  | 'memory'
  | 'all'
  | 'startup'
  | 'periodic'
  | 'manual'
  | string;

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
  readonly stage: 'disabled' | 'primary' | 'primary+memory' | 'all';
  readonly ollamaBaseUrl: string;
  readonly disabledMemoryAnalyzers?: readonly string[];
  readonly disabledAggregators?: readonly string[];
  readonly importAllStatusFilePath: string;
  readonly pipelineStatusFilePath: string;
  readonly githubPrReview?: SerializableGitHubPrReviewConfig;
  /** null なら memory pipeline をスキップ (Wave 1/2 のみ実行)。 */
  readonly memoryCore: SerializableMemoryCoreConfig | null;
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
    };

export type HostMessage = HostRequest;
export type DaemonMessage = DaemonResponse | DaemonEvent;
