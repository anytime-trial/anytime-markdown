// trail-daemon child process のエントリ。
//
// host (extension) から fork され、IPC で `HostRequest` を受けて `DaemonResponse` を返す。
// 内部で MemoryCoreService + AnalyzeAllRunner を構築・管理する。
//
// バンドルは vscode-trail-extension/webpack.config.js の `trailDaemonConfig` 経由で
// `dist/trail-daemon.js` として生成され、TrailDaemonHost が fork する。

import * as path from 'node:path';

import { MemoryCoreService } from '@anytime-markdown/memory-core/pipeline';
import { analyze } from '@anytime-markdown/trail-core/analyze';
import { TrailDatabase } from '@anytime-markdown/trail-db';

import { checkLlmAvailability } from '../lep/LlmAvailability';
import { AnalyzeAllRunner } from '../runner/AnalyzeAllRunner';
import { TrailDataServer } from '../server/TrailDataServer';
import { CodeGraphService } from '../analyze/CodeGraphService';
import type { Logger } from '../runtime/Logger';

import type {
  DaemonEvent,
  DaemonMessage,
  HostMessage,
  MethodName,
  RunReason,
  SerializableAnalyzeAllConfig,
  SerializableHttpServerOptions,
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
/** configure() 完了後に保持する設定 (startHttpServer が参照する)。 */
let lastCfg: SerializableAnalyzeAllConfig | null = null;
/** startHttpServer() で構築した TrailDataServer。 */
let httpServer: TrailDataServer | null = null;
/** startHttpServer() で構築した CodeGraphService。 */
let httpCodeGraphService: CodeGraphService | null = null;
/** startHttpServer() が確立したポート番号。 */
let httpPort: number | null = null;

/** meta が存在する場合、JSON 化して msg に追記する。循環参照はキャッチして無視する。 */
function formatWithMeta(msg: string, meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return msg;
  try {
    return `${msg} ${JSON.stringify(meta)}`;
  } catch {
    return msg;
  }
}

/**
 * Logger adapter: daemonLogger (イベントブリッジ) を runtime/Logger の Logger インタフェースに
 * 適合させる薄いラッパ。TrailDataServer / CodeGraphService が期待する Logger を満たす。
 * 新規ファイルは作らず daemon entry 内に局所定義する。
 */
const daemonLoggerAsLogger: Logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => daemonLogger.debug(formatWithMeta(msg, meta)),
  info: (msg: string, meta?: Record<string, unknown>) => daemonLogger.info(formatWithMeta(msg, meta)),
  warn: (msg: string, meta?: Record<string, unknown>) => daemonLogger.warn(formatWithMeta(msg, meta)),
  error: (msg: string, err?: unknown, meta?: Record<string, unknown>) => {
    const errStr = err instanceof Error
      ? err.message + (err.stack ? `\n${err.stack}` : '')
      : err !== undefined ? String(err) : '';
    const metaStr = meta ? (() => { try { return JSON.stringify(meta); } catch { return ''; } })() : '';
    daemonLogger.error([msg, errStr, metaStr].filter(Boolean).join(' '));
  },
  child: (scope: string): Logger => ({
    debug: (msg: string, meta?: Record<string, unknown>) => daemonLogger.debug(formatWithMeta(`[${scope}] ${msg}`, meta)),
    info: (msg: string, meta?: Record<string, unknown>) => daemonLogger.info(formatWithMeta(`[${scope}] ${msg}`, meta)),
    warn: (msg: string, meta?: Record<string, unknown>) => daemonLogger.warn(formatWithMeta(`[${scope}] ${msg}`, meta)),
    error: (msg: string, err?: unknown, meta?: Record<string, unknown>) => {
      const errStr = err instanceof Error
        ? err.message + (err.stack ? `\n${err.stack}` : '')
        : err !== undefined ? String(err) : '';
      const metaStr = meta ? (() => { try { return JSON.stringify(meta); } catch { return ''; } })() : '';
      daemonLogger.error([`[${scope}] ${msg}`, errStr, metaStr].filter(Boolean).join(' '));
    },
    child: (childScope: string) => daemonLoggerAsLogger.child(`${scope}/${childScope}`),
  }),
};

/** テスト用: 状態リセット。 */
export function _resetForTest(): void {
  memoryCoreService = null;
  analyzeAllRunner = null;
  lastCfg = null;
  httpServer = null;
  httpCodeGraphService = null;
  httpPort = null;
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
  lastCfg = null; // 再 configure 時はリセット

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
  lastCfg = cfg;
}

/**
 * HTTP サーバ (TrailDataServer + CodeGraphService) を起動し httpReady イベントを emit する。
 * 冪等: 既に起動済みの場合は httpReady を再 emit して return する。
 * configure() が先に完了していること (lastCfg が null でないこと) を要求する。
 */
async function startHttpServer(opts: SerializableHttpServerOptions): Promise<void> {
  if (!lastCfg) {
    throw new Error('not configured: call configure() first');
  }

  // 冪等: 既に起動済みなら httpReady を再 emit して終了。
  if (httpServer !== null && httpPort !== null) {
    sendEvent('httpReady', { port: httpPort, url: `http://localhost:${httpPort}` });
    return;
  }

  // TrailDatabase を開く。distPath と trailDbPath は configure 済みの cfg から取得。
  // startHttpServer の opts.distPath が native binding の基準ディレクトリになる。
  const trailDb = new TrailDatabase(opts.distPath, path.dirname(lastCfg.trailDbPath));

  // CodeGraphService を構築。c4ElementsProvider / trailGraphProvider は省略 (dormant 段階)。
  const codeGraphService = new CodeGraphService({
    repositories:
      opts.gitRoot
        ? [{ id: opts.gitRoot, label: opts.gitRoot.split('/').at(-1) ?? opts.gitRoot, path: opts.gitRoot }]
        : [],
    trailDb,
    pythonWasmPath: opts.pythonWasmPath,
    excludeRoot: opts.gitRoot,
    logger: daemonLoggerAsLogger,
  });

  // TrailDataServer を構築。distPath は better-sqlite3 native binding の解決に使う。
  const server = new TrailDataServer(
    opts.distPath,
    trailDb,
    daemonLoggerAsLogger,
    opts.gitRoot,
    opts.memoryDbPath,
  );
  server.setCodeGraphService(codeGraphService);

  // ポートを試みる: preferredPort → preferred+1..+9 → 0 (OS 任意)。
  const preferred = opts.preferredPort ?? 19841;
  const portCandidates: number[] =
    preferred === 0
      ? [0]
      : [...Array.from({ length: 10 }, (_, i) => preferred + i), 0];

  let lastErr: Error | null = null;
  let startedPort: number | null = null;

  for (const candidate of portCandidates) {
    try {
      await server.start(candidate);
      startedPort = server.port;
      break;
    } catch (err) {
      if (err instanceof Error && err.message.includes('already in use')) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }

  if (startedPort === null) {
    throw lastErr ?? new Error('Failed to bind HTTP server on any port');
  }

  // 成功 — モジュールスコープに保持し dispose で後始末できるようにする。
  httpServer = server;
  httpCodeGraphService = codeGraphService;
  httpPort = startedPort;

  sendEvent('httpReady', { port: startedPort, url: `http://localhost:${startedPort}` });
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
  if (httpServer) {
    try {
      await httpServer.stop();
    } catch (err) {
      daemonLogger.error(`[daemon] HTTP server stop error: ${err instanceof Error ? err.message : String(err)}`);
    }
    httpServer = null;
  }
  httpCodeGraphService = null;
  httpPort = null;
  lastCfg = null;
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
    case 'startHttpServer':
      await startHttpServer(params as SerializableHttpServerOptions);
      return;
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
