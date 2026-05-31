// trail-daemon child process のエントリ。
//
// host (extension) から fork され、IPC で `HostRequest` を受けて `DaemonResponse` を返す。
// 内部で MemoryCoreService + AnalyzeAllRunner を構築・管理する。
//
// バンドルは vscode-trail-extension/webpack.config.js の `trailDaemonConfig` 経由で
// `dist/trail-daemon.js` として生成され、TrailDaemonHost が fork する。

import * as path from 'node:path';

import { BetterSqlite3MemoryDb } from '@anytime-markdown/memory-core';
import { MemoryCoreService } from '@anytime-markdown/memory-core/pipeline';
import { makeChildAnalyzeFn } from '../analyze/childAnalyzeFn';
import {
  CREATE_EXTENSION_LOGS,
  CREATE_EXTENSION_LOGS_INDEXES,
} from '@anytime-markdown/trail-core/domain/schema';
import { TrailDatabase } from '@anytime-markdown/trail-db';

import { checkLlmAvailability } from '../lep/LlmAvailability';
import { AnalyzeAllRunner } from '../runner/AnalyzeAllRunner';
import { TrailDataServer } from '../server/TrailDataServer';
import { CodeGraphService } from '../analyze/CodeGraphService';
import { ChatBridge } from '../memory-chat/chatBridge';
import { RebuildScheduler } from '../memory-chat/rebuildScheduler';
import { LogService } from '../services/LogService';
import type { Logger } from '../runtime/Logger';
import {
  runAnalyzeCurrentCodePipeline,
  runAnalyzeReleaseCodePipeline,
} from '../analyze/AnalyzePipeline';
import type { AnalyzeCurrentOpts, AnalyzeReleaseOpts } from '../analyze/AnalyzePipeline';

import type {
  DaemonEvent,
  DaemonMessage,
  HostMessage,
  MethodName,
  RunReason,
  SerializableAnalyzeAllConfig,
  SerializableAnalyzeCurrentCodeRequest,
  SerializableAnalyzeReleaseCodeRequest,
  SerializableHttpServerOptions,
  SerializableSetDocsPathRequest,
  SerializableTokenBudgetConfig,
} from './trailDaemonProtocol';

// daemon バンドル (dist/trail-daemon.js) と同じ dist/ 配下に配置される解析子プロセスと
// wasm を __dirname 起点で解決する。webpack trailDaemonConfig は node.__dirname=false の
// ため __dirname は runtime の dist/ を指す。これにより daemon は typescript を静的 import
// せず、release/on-demand 解析を analyze-child へ委譲できる。
const analyzeChildPath = path.join(__dirname, 'analyze-child.js');
const pythonWasmPath = path.join(__dirname, 'wasm', 'tree-sitter-python.wasm');

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

// typescript を引き込む同期 `analyze` の代替。release 解析 (AnalyzeAllRunner) と
// HTTP refresh (TrailDataServer) の両方へ注入し、TS 解析を analyze-child へ一本化する。
const childAnalyzeFn = makeChildAnalyzeFn(analyzeChildPath, {
  pythonWasmPath,
  logger: daemonLogger,
});

let memoryCoreService: MemoryCoreService | null = null;
let analyzeAllRunner: AnalyzeAllRunner | null = null;
/** startHttpServer() で構築した TrailDataServer。 */
let httpServer: TrailDataServer | null = null;
/** startHttpServer() で構築した CodeGraphService。 */
let httpCodeGraphService: CodeGraphService | null = null;
/** startHttpServer() で構築した TrailDatabase (analyze pipeline に渡す)。 */
let httpTrailDb: TrailDatabase | null = null;
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

/** Error.stack を優先して文字列化する。スタックがない場合は message、非 Error は String()。 */
function formatError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

/** msg + (err 整形) + (meta JSON) を 1 行に結合する。error ログ用。 */
function buildErrorLine(msg: string, err?: unknown, meta?: Record<string, unknown>): string {
  const base = err !== undefined ? `${msg} ${formatError(err)}` : msg;
  return formatWithMeta(base, meta);
}

/**
 * Logger adapter: daemonLogger (イベントブリッジ) を runtime/Logger の Logger インタフェースに
 * 適合させる薄いラッパ。TrailDataServer / CodeGraphService / ChatBridge / RebuildScheduler が
 * 期待する Logger を満たす。新規ファイルは作らず daemon entry 内に局所定義する。
 * scope を伴う child() も同じ factory を再帰利用し、root / child の実装重複を排除する。
 */
function makeScopedDaemonLogger(scope?: string): Logger {
  const prefix = scope ? `[${scope}] ` : '';
  return {
    debug: (msg, meta) => daemonLogger.debug(formatWithMeta(prefix + msg, meta)),
    info: (msg, meta) => daemonLogger.info(formatWithMeta(prefix + msg, meta)),
    warn: (msg, meta) => daemonLogger.warn(formatWithMeta(prefix + msg, meta)),
    error: (msg, err, meta) => daemonLogger.error(buildErrorLine(prefix + msg, err, meta)),
    child: (childScope) => makeScopedDaemonLogger(scope ? `${scope}/${childScope}` : childScope),
  };
}
const daemonLoggerAsLogger: Logger = makeScopedDaemonLogger();

/** analyze current/release pipeline の onProgress を IPC 'progress' イベントに変換する共通実装。 */
function emitAnalyzeCurrentProgress(phase: string, percent?: number): void {
  sendEvent('progress', { message: percent !== undefined ? `${phase} (${percent}%)` : phase });
}
function emitAnalyzeReleaseProgress(message: string): void {
  sendEvent('progress', { message });
}

/** startHttpServer() で構築した RebuildScheduler disposable。 */
let httpRebuildSchedulerDisposable: { dispose(): void } | null = null;
/** startHttpServer() で構築した ChatBridge。dispose() で SQLite WAL をフラッシュする。 */
let httpChatBridge: ChatBridge | null = null;
/** startHttpServer() で構築した extensionLogsDb。 */
let httpExtensionLogsDb: BetterSqlite3MemoryDb | null = null;

/** テスト用: 状態リセット。 */
export function _resetForTest(): void {
  memoryCoreService = null;
  analyzeAllRunner = null;
  httpServer = null;
  httpCodeGraphService = null;
  httpTrailDb = null;
  httpPort = null;
  httpRebuildSchedulerDisposable = null;
  httpChatBridge = null;
  httpExtensionLogsDb = null;
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
    // typescript を引き込む同期 `analyze` の代わりに analyze-child へ fork する非同期
    // 実装を注入する。release 解析は TrailGraph のみ使うため child の graph を返す。
    analyzeReleaseFn: childAnalyzeFn,
    onImportPhase: (event) => sendEvent('phase', event),
    onAfterRun: () => {
      // daemon 内の TrailDataServer に sessions 更新を WebSocket push させる。
      // Phase 3 で TrailDataServer が daemon 側へ移ったため、旧 extension の
      // afterRun → trailDataServer.notifySessionsUpdated() を daemon 内で完結させる
      // (IPC afterRun イベントは extension 側のログ用に残す)。
      httpServer?.notifySessionsUpdated();
      sendEvent('afterRun', {});
    },
  });
}

/**
 * HTTP サーバ (TrailDataServer + CodeGraphService) を起動し httpReady イベントを emit する。
 * 冪等: 既に起動済みの場合は httpReady を再 emit して return する。
 * configure() (インポートパイプライン) とは独立して起動できる。必要な設定 (trailDbPath /
 * gitRoot) は opts から受け取るため lastCfg には依存しない。
 */
async function startHttpServer(opts: SerializableHttpServerOptions): Promise<void> {
  // 冪等: 既に起動済みなら httpReady を再 emit して終了。
  if (httpServer !== null && httpPort !== null) {
    sendEvent('httpReady', { port: httpPort, url: `http://localhost:${httpPort}` });
    return;
  }

  // TrailDatabase を開く。distPath と trailDbPath は configure 済みの cfg から取得。
  // startHttpServer の opts.distPath が native binding の基準ディレクトリになる。
  // init() を呼ばないと TrailDatabase.ensureDb() が "not initialized" で throw し
  // 全 /api/trail/* エンドポイントが 500 を返す (Phase 3 で TrailDataServer を
  // daemon 側に移した時の漏れ。extension 側 trailDb には別途 init() してある)。
  const trailDb = new TrailDatabase(opts.distPath, path.dirname(opts.trailDbPath));
  await trailDb.init();

  // CodeGraphService を構築。c4ElementsProvider / trailGraphProvider は省略 (dormant 段階)。
  const codeGraphService = new CodeGraphService({
    repositories:
      opts.gitRoot
        ? [{ id: opts.gitRoot, label: opts.gitRoot.split('/').at(-1) ?? opts.gitRoot, path: opts.gitRoot }]
        : [],
    trailDb,
    pythonWasmPath: opts.pythonWasmPath,
    // lep.json workspace.excludeRoot を優先し、未指定 (空文字解決) 時のみ gitRoot にフォールバック。
    excludeRoot: opts.excludeRoot ?? opts.gitRoot,
    logger: daemonLoggerAsLogger,
    defaultRepoName: opts.defaultRepoName,
  });

  // TrailDataServer を構築。distPath は better-sqlite3 native binding の解決に使う。
  const server = new TrailDataServer(
    opts.distPath,
    trailDb,
    daemonLoggerAsLogger,
    opts.gitRoot,
    opts.memoryDbPath,
    {
      configPaths: opts.configPaths,
      defaultRepoName: opts.defaultRepoName,
      traceDir: opts.traceDir,
    },
    childAnalyzeFn,
  );
  server.setCodeGraphService(codeGraphService);

  // ---- 付属オブジェクトの構築と wire ----

  // LogService
  if (opts.logService) {
    const lsCfg = opts.logService;
    const nativeBinding =
      lsCfg.nativeBinding ?? path.join(opts.distPath, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    const extensionLogsDb = new BetterSqlite3MemoryDb({ filePath: lsCfg.extensionLogsDbPath, nativeBinding });
    extensionLogsDb.run(CREATE_EXTENSION_LOGS);
    for (const idx of CREATE_EXTENSION_LOGS_INDEXES) extensionLogsDb.run(idx);
    extensionLogsDb.run('PRAGMA journal_mode=WAL');
    const logService = new LogService(extensionLogsDb, server);
    server.setLogService(logService);
    httpExtensionLogsDb = extensionLogsDb;
    daemonLogger.info(`[daemon] LogService wired: ${lsCfg.extensionLogsDbPath}`);
  }

  // ChatBridge
  if (opts.chatBridge) {
    const cbCfg = opts.chatBridge;
    const chatBridge = new ChatBridge({
      memoryDbPath: cbCfg.memoryDbPath,
      memoryNativeBinding: cbCfg.memoryNativeBinding,
      getConfig: () => cbCfg.staticConfig,
      logger: daemonLoggerAsLogger.child('chatBridge'),
    });
    server.setChatBridge(chatBridge);
    httpChatBridge = chatBridge;
    daemonLogger.info('[daemon] ChatBridge wired');
  }

  // RebuildScheduler
  if (opts.rebuildScheduler) {
    const rsCfg = opts.rebuildScheduler;
    const rebuildScheduler = new RebuildScheduler({
      memoryDbPath: rsCfg.memoryDbPath,
      memoryNativeBinding: rsCfg.memoryNativeBinding,
      logger: daemonLoggerAsLogger.child('rebuildScheduler'),
    });
    const intervalMs = rsCfg.intervalMs ?? 60 * 60 * 1000; // default 60 min
    httpRebuildSchedulerDisposable = rebuildScheduler.start(intervalMs);
    daemonLogger.info('[daemon] RebuildScheduler wired');
  }

  // ---- VS Code API 非依存コールバックの wire ----
  // onOpenDocLink / onOpenFile は VS Code API を使えないため IPC イベントとして返す。
  // extension (host) 側 (M2 で実装) がこのイベントを受けて VS Code API を呼び出す。
  server.onOpenDocLink = (docPath: string) => {
    sendEvent('openDocLink', { docPath });
  };
  server.onOpenFile = (filePath: string) => {
    sendEvent('openFile', { filePath });
  };

  // onTokenBudgetExceeded: シリアライズ可能なフィールドのみ IPC イベントとして返す。
  server.onTokenBudgetExceeded = (status) => {
    sendEvent('tokenBudgetExceeded', {
      sessionId: status.sessionId,
      sessionTokens: status.sessionTokens,
      dailyTokens: status.dailyTokens,
      dailyLimitTokens: status.dailyLimitTokens,
      sessionLimitTokens: status.sessionLimitTokens,
      alertThresholdPct: status.alertThresholdPct,
      turnCount: status.turnCount,
      messageCount: status.messageCount,
    });
  };

  // ---- analyze コールバックの wire ----
  // onAnalyzeCurrentCode / onAnalyzeReleaseCode は daemon 内部の pipeline 関数で処理する。
  // onAnalyzeAll は daemon 内部の AnalyzeAllRunner 経由。

  // HTTP request shape (webview → TrailDataServer): workspacePath / tsconfigPath のみ。
  // IPC dispatch 'analyzeCurrentCode' arm は SerializableAnalyzeCurrentCodeRequest を受け
  // analysisRoot / excludeRoot / analyzeChildPath まで渡す。意図的に異なるシグネチャ。
  server.onAnalyzeCurrentCode = async (req) => {
    if (httpTrailDb === null || httpCodeGraphService === null) {
      throw new Error('http server state not ready');
    }
    // gitRoot は startHttpServer の opts から取得 (lastCfg 非依存)。opts.gitRoot は optional のため
    // workspacePath も未指定なら解決不能としてエラーにする。
    const analysisRoot = req.workspacePath ?? opts.gitRoot;
    if (!analysisRoot) {
      throw new Error('analysisRoot not resolvable: pass workspacePath or startHttpServer gitRoot');
    }
    const opts2: AnalyzeCurrentOpts = {
      analysisRoot,
      tsconfigPath: req.tsconfigPath,
      trailDb: httpTrailDb,
      codeGraphService: httpCodeGraphService,
      callbacks: server,
      logger: daemonLoggerAsLogger,
      onProgress: emitAnalyzeCurrentProgress,
    };
    return runAnalyzeCurrentCodePipeline(opts2);
  };

  // HTTP request shape (webview → TrailDataServer): パラメータなし (gitRoot は opts から取得)。
  // IPC dispatch 'analyzeReleaseCode' arm は SerializableAnalyzeReleaseCodeRequest で gitRoot を受ける。
  server.onAnalyzeReleaseCode = async () => {
    if (httpTrailDb === null || httpCodeGraphService === null) {
      throw new Error('http server state not ready');
    }
    if (!opts.gitRoot) {
      throw new Error('gitRoot not configured; pass gitRoot to startHttpServer first');
    }
    const opts3: AnalyzeReleaseOpts = {
      trailDb: httpTrailDb,
      codeGraphService: httpCodeGraphService,
      gitRoot: opts.gitRoot,
      onProgress: emitAnalyzeReleaseProgress,
    };
    return runAnalyzeReleaseCodePipeline(opts3);
  };

  server.onAnalyzeAll = async () => {
    if (!analyzeAllRunner) {
      throw new Error('AnalyzeAllRunner not configured; call configure() first');
    }
    const startedAt = Date.now();
    await analyzeAllRunner.runOnce('import');
    const result = await analyzeAllRunner.getLastImportResult();
    if (!result) {
      throw new Error('importAll did not produce a result');
    }
    return { ...result, durationMs: Date.now() - startedAt };
  };

  // ---- 初期設定の適用 ----
  if (opts.tokenBudgetConfig) {
    server.setTokenBudgetConfig(opts.tokenBudgetConfig);
  }
  if (opts.docsPath !== undefined) {
    server.setDocsPath(opts.docsPath);
  }

  // ---- AnalyzeAllRunner を wire (configure 済みの場合) ----
  if (analyzeAllRunner) {
    server.setAnalyzeAllRunner(analyzeAllRunner);
  }

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
  httpTrailDb = trailDb;
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
  if (httpRebuildSchedulerDisposable) {
    httpRebuildSchedulerDisposable.dispose();
    httpRebuildSchedulerDisposable = null;
  }
  if (httpChatBridge) {
    try {
      httpChatBridge.dispose();
    } catch (err) {
      daemonLogger.error(`[daemon] ChatBridge dispose error: ${formatError(err)}`);
    }
    httpChatBridge = null;
  }
  if (httpServer) {
    try {
      await httpServer.stop();
    } catch (err) {
      daemonLogger.error(`[daemon] HTTP server stop error: ${formatError(err)}`);
    }
    httpServer = null;
  }
  if (httpExtensionLogsDb) {
    try {
      httpExtensionLogsDb.close();
    } catch (err) {
      daemonLogger.error(`[daemon] extensionLogsDb close error: ${formatError(err)}`);
    }
    httpExtensionLogsDb = null;
  }
  httpCodeGraphService = null;
  httpTrailDb = null;
  httpPort = null;
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
    case 'analyzeCurrentCode': {
      if (httpTrailDb === null || httpCodeGraphService === null || httpServer === null) {
        throw new Error('http server not started: call startHttpServer() first');
      }
      const req = params as SerializableAnalyzeCurrentCodeRequest;
      const opts: AnalyzeCurrentOpts = {
        analysisRoot: req.analysisRoot,
        excludeRoot: req.excludeRoot,
        tsconfigPath: req.tsconfigPath,
        analyzeChildPath: req.analyzeChildPath,
        trailDb: httpTrailDb,
        codeGraphService: httpCodeGraphService,
        callbacks: httpServer,
        logger: daemonLoggerAsLogger,
        onProgress: emitAnalyzeCurrentProgress,
      };
      return await runAnalyzeCurrentCodePipeline(opts);
    }
    case 'analyzeReleaseCode': {
      if (httpTrailDb === null || httpCodeGraphService === null || httpServer === null) {
        throw new Error('http server not started: call startHttpServer() first');
      }
      const req = params as SerializableAnalyzeReleaseCodeRequest;
      const opts: AnalyzeReleaseOpts = {
        trailDb: httpTrailDb,
        codeGraphService: httpCodeGraphService,
        gitRoot: req.gitRoot,
        onProgress: emitAnalyzeReleaseProgress,
      };
      return await runAnalyzeReleaseCodePipeline(opts);
    }
    case 'startHttpServer':
      await startHttpServer(params as SerializableHttpServerOptions);
      return;
    case 'setDocsPath': {
      if (!httpServer) {
        throw new Error('http server not started: call startHttpServer() first');
      }
      const req = params as SerializableSetDocsPathRequest;
      httpServer.setDocsPath(req.docsPath);
      return;
    }
    case 'setTokenBudgetConfig': {
      if (!httpServer) {
        throw new Error('http server not started: call startHttpServer() first');
      }
      httpServer.setTokenBudgetConfig(params as SerializableTokenBudgetConfig);
      return;
    }
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
