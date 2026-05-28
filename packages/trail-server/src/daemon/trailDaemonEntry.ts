// trail-daemon child process のエントリ。
//
// host (extension) から fork され、IPC で `HostRequest` を受けて `DaemonResponse` を返す。
// 内部で MemoryCoreService + AnalyzeAllRunner を構築・管理する。
//
// バンドルは vscode-trail-extension/webpack.config.js の `trailDaemonConfig` 経由で
// `dist/trail-daemon.js` として生成され、TrailDaemonHost が fork する。

import { MemoryCoreService } from '@anytime-markdown/memory-core/pipeline';
import { analyze } from '@anytime-markdown/trail-core/analyze';

import { checkLlmAvailability } from '../lep/LlmAvailability';
import { AnalyzeAllRunner } from '../runner/AnalyzeAllRunner';

import type {
  DaemonEvent,
  DaemonMessage,
  HostMessage,
  MethodName,
  RunReason,
  SerializableAnalyzeAllConfig,
} from './trailDaemonProtocol';

function send(m: DaemonMessage): void {
  process.send?.(m);
}

function sendEvent<C extends DaemonEvent['channel']>(
  channel: C,
  payload: Extract<DaemonEvent, { channel: C }>['payload'],
): void {
  send({ type: 'event', channel, payload } as DaemonEvent);
}

function ok(id: string, result?: unknown): void {
  send({ type: 'response', id, ok: true, result });
}

function fail(id: string, err: unknown): void {
  const e =
    err instanceof Error
      ? { message: err.message, stack: err.stack }
      : { message: String(err) };
  send({ type: 'response', id, ok: false, error: e });
}

/** 構造化ロガー (log event ブリッジ)。MemoryCoreService / AnalyzeAllRunner の logSink から呼ばれる。 */
export const daemonLogger = {
  debug: (m: string) =>
    sendEvent('log', { level: 'debug', message: m, timestamp: new Date().toISOString() }),
  info: (m: string) =>
    sendEvent('log', { level: 'info', message: m, timestamp: new Date().toISOString() }),
  warn: (m: string) =>
    sendEvent('log', { level: 'warn', message: m, timestamp: new Date().toISOString() }),
  error: (m: string) =>
    sendEvent('log', { level: 'error', message: m, timestamp: new Date().toISOString() }),
};

let memoryCoreService: MemoryCoreService | null = null;
let analyzeAllRunner: AnalyzeAllRunner | null = null;

/** テスト用: 状態リセット。 */
export function _resetForTest(): void {
  memoryCoreService = null;
  analyzeAllRunner = null;
}

function requireRunner(): AnalyzeAllRunner {
  if (!analyzeAllRunner) {
    throw new Error('not configured: call configure() first');
  }
  return analyzeAllRunner;
}

async function configure(cfg: SerializableAnalyzeAllConfig): Promise<void> {
  // 既存インスタンスがあれば dispose
  if (analyzeAllRunner) {
    await analyzeAllRunner.dispose();
    analyzeAllRunner = null;
  }
  if (memoryCoreService) {
    await memoryCoreService.dispose();
    memoryCoreService = null;
  }

  // MemoryCoreService (cfg.memoryCore が null なら memory pipeline をスキップ)
  if (cfg.memoryCore) {
    memoryCoreService = new MemoryCoreService({
      logSink: { appendLine: (m: string) => daemonLogger.info(`[mcs] ${m}`) },
      trailDbPath: cfg.memoryCore.trailDbPath,
      dbPath: cfg.memoryCore.dbPath,
      nativeBinding: cfg.memoryCore.nativeBinding,
      gitRoot: cfg.memoryCore.gitRoot,
      backfillDays: cfg.memoryCore.backfillDays,
      llm: cfg.memoryCore.llm,
      backupGenerations: cfg.memoryCore.backupGenerations,
      backupIntervalDays: cfg.memoryCore.backupIntervalDays,
    });
  }

  // AnalyzeAllRunner
  // 注意: trailDb と githubPrReview は本 Phase では undefined (それぞれの concrete wire は別 task)。
  // - trailDb undefined: AnalyzeAllRunner は trail.db import パイプラインをスキップ。
  // - githubPrReview undefined: GitHub source は無効。
  analyzeAllRunner = new AnalyzeAllRunner({
    logSink: { appendLine: (m: string) => daemonLogger.info(`[runner] ${m}`) },
    gitRoot: cfg.gitRoot,
    statePath: cfg.statePath,
    trailDb: undefined,
    gitRoots: cfg.gitRoots,
    claudeProjectsDir: cfg.claudeProjectsDir,
    codexSessionsDir: cfg.codexSessionsDir,
    memoryCoreService: memoryCoreService ?? undefined,
    stage: cfg.stage,
    checkLlmAvailability: cfg.memoryCore
      ? () =>
          checkLlmAvailability({
            baseUrl: cfg.ollamaBaseUrl,
            chatModel: cfg.memoryCore!.llm.chatModel,
            embedModel: cfg.memoryCore!.llm.embedModel,
          })
      : undefined,
    ollamaBaseUrl: cfg.ollamaBaseUrl,
    disabledMemoryAnalyzers: cfg.disabledMemoryAnalyzers,
    disabledAggregators: cfg.disabledAggregators,
    githubPrReview: undefined,
    importAllStatusFilePath: cfg.importAllStatusFilePath,
    pipelineStatusFilePath: cfg.pipelineStatusFilePath,
    onImportProgress: (message: string) => sendEvent('progress', { message }),
    analyzeReleaseFn: analyze,
    onImportPhase: (event) => sendEvent('phase', event),
    onAfterRun: () => sendEvent('afterRun', {}),
  });
}

async function disposeAll(): Promise<void> {
  if (analyzeAllRunner) {
    await analyzeAllRunner.dispose();
    analyzeAllRunner = null;
  }
  if (memoryCoreService) {
    await memoryCoreService.dispose();
    memoryCoreService = null;
  }
}

export async function dispatch(method: MethodName | string, params: unknown): Promise<unknown> {
  switch (method) {
    case 'configure':
      await configure(params as SerializableAnalyzeAllConfig);
      return;
    case 'runOnce': {
      const p = params as { reason: RunReason };
      return requireRunner().runOnce(p.reason);
    }
    case 'start': {
      const p = params as {
        intervalMs: number;
        options?: { runOnStart?: boolean; startupDelayMs?: number };
      };
      requireRunner().start(p.intervalMs, p.options ?? {});
      return;
    }
    case 'stop':
      requireRunner().stop();
      return;
    case 'pause': {
      const p = params as { by: string };
      return requireRunner().pause(p.by);
    }
    case 'resume':
      return requireRunner().resume();
    case 'getStatus':
      return requireRunner().getStatus();
    case 'getLastImportResult':
      return requireRunner().getLastImportResult();
    case 'dispose':
      await disposeAll();
      return;
    default:
      throw new Error(`unknown method: ${method}`);
  }
}

async function handle(msg: HostMessage): Promise<void> {
  if (msg.type !== 'request') return;
  try {
    ok(msg.id, await dispatch(msg.method, msg.params));
  } catch (e) {
    fail(msg.id, e);
  }
}

// IPC ループと終了ハンドラ
process.on('message', (m: HostMessage) => {
  void handle(m);
});
process.on('disconnect', () => {
  void disposeAll().finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void disposeAll().finally(() => process.exit(0));
});
