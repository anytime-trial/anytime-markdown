#!/usr/bin/env node
import { Command } from 'commander';
import { join, basename } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { TrailDatabase } from '@anytime-markdown/trail-db';
import { MemoryCoreService, type MemoryCoreLogSink, BetterSqlite3MemoryDb, getMemoryCoreDbPath, getTrailHome } from '@anytime-markdown/memory-core';
import { ChatBridge } from './memory-chat/chatBridge';
import { RebuildScheduler } from './memory-chat/rebuildScheduler';
import { CREATE_EXTENSION_LOGS, CREATE_EXTENSION_LOGS_INDEXES } from '@anytime-markdown/trail-core/domain/schema';
import { TrailDataServer } from './server/TrailDataServer';
import { LogService } from './services/LogService';
import { DaemonLifecycle } from './runtime/DaemonLifecycle';
import { ConsoleLogger, FileLogger, type Logger } from './runtime/Logger';
import { loadConfig } from './runtime/Config';
import { DaemonScheduler } from './runtime/DaemonScheduler';
import { createAnalyzeAllJob } from './jobs/AnalyzeAllJob';
import { CodeGraphService } from './analyze/CodeGraphService';
import {
  findTsconfigCandidates,
  runAnalyzeCurrentCodePipeline,
  runAnalyzeReleaseCodePipeline,
} from './analyze/AnalyzePipeline';

const TRAIL_HOME = getTrailHome(process.cwd());
const MEMORY_DB_PATH = getMemoryCoreDbPath(process.cwd());
const VERSION = '0.18.0';

const program = new Command();
program
  .name('anytime-trail-server')
  .description('Anytime Trail standalone daemon')
  .version(VERSION);

program
  .command('start')
  .description('Start the daemon (foreground)')
  .option('-p, --port <port>', 'Port (0 for auto)', '0')
  .option('-h, --host <host>', 'Bind host', '127.0.0.1')
  .option('--git-roots <roots>', 'Comma-separated git roots', '')
  .option('--no-stdout', 'Disable stdout logging')
  .option('--no-scheduler', 'Disable background scheduler')
  .action(async (opts: { port: string; host: string; gitRoots: string; stdout: boolean; scheduler: boolean }) => {
    const lc = new DaemonLifecycle({
      jsonPath: join(TRAIL_HOME, 'daemon.json'),
      lockPath: join(TRAIL_HOME, 'daemon.lock'),
    });

    if (lc.isDaemonAlive()) {
      const info = lc.readDaemonJson();
      console.log(`Daemon already running on ${info?.url} (pid=${info?.pid})`);
      process.exit(0);
    }

    const logger = createLogger(opts.stdout);
    logger.info('starting daemon', { trailHome: TRAIL_HOME });

    const dbStorageDir = join(TRAIL_HOME, 'db');
    const distPath = join(__dirname, 'viewer-dist');
    const trailDb = new TrailDatabase(distPath, dbStorageDir, 5, makeTrailLoggerAdapter(logger), 7);
    await trailDb.init();

    const gitRoots = opts.gitRoots ? String(opts.gitRoots).split(',').filter(Boolean) : [];
    const server = new TrailDataServer(distPath, trailDb, logger, gitRoots[0]);

    // extension_logs 専用 DB を better-sqlite3 で開き、LogService を wire する。
    // trail.db とは別ファイルとし、WAL 競合と性能影響を避ける。
    //
    // nativeBinding: webpack-bundled 実行時は bindings package の getFileName が
    // call stack を辿って .node のパスを推測できず crash する。__dirname
    // (= dist/) から native binary の絶対パスを組み立てて回避する
    // (vscode-trail-extension の memoryCoreNativeBinding と同等)。
    const cliNativeBinding = join(
      __dirname,
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    );
    const extensionLogsDbPath = join(dbStorageDir, 'extension-logs.db');
    const extensionLogsDb = new BetterSqlite3MemoryDb({
      filePath: extensionLogsDbPath,
      ...(existsSync(cliNativeBinding) ? { nativeBinding: cliNativeBinding } : {}),
    });
    extensionLogsDb.run(CREATE_EXTENSION_LOGS);
    for (const idx of CREATE_EXTENSION_LOGS_INDEXES) extensionLogsDb.run(idx);
    extensionLogsDb.run('PRAGMA journal_mode=WAL');
    const logService = new LogService(extensionLogsDb, server);
    server.setLogService(logService);
    logger.info('log streaming service wired', { dbPath: extensionLogsDbPath });

    const configPath = join(TRAIL_HOME, 'config.json');
    const config = loadConfig(configPath, logger);
    const effectiveGitRoots = gitRoots.length > 0 ? gitRoots : config.gitRoots;

    // Wire analyze pipeline if gitRoots are available
    if (effectiveGitRoots.length > 0) {
      const codeGraphRepos = effectiveGitRoots.map((p) => ({
        id: basename(p),
        label: basename(p),
        path: p,
      }));
      const codeGraphService = new CodeGraphService({
        repositories: codeGraphRepos,
        trailDb,
        logger,
      });
      server.setCodeGraphService(codeGraphService);

      const primaryGitRoot = effectiveGitRoots[0]!;

      server.onAnalyzeCurrentCode = async ({ workspacePath, tsconfigPath }) => {
        const analysisRoot = workspacePath ?? primaryGitRoot;
        let rootStat: ReturnType<typeof statSync>;
        try { rootStat = statSync(analysisRoot); }
        catch { throw new Error(`workspace path does not exist: ${analysisRoot}`); }
        if (!rootStat.isDirectory()) {
          throw new Error(`workspace path is not a directory: ${analysisRoot}`);
        }

        let resolvedTsconfig = tsconfigPath;
        if (!resolvedTsconfig) {
          const candidates = findTsconfigCandidates(analysisRoot);
          if (candidates.length === 0) {
            throw new Error(`No tsconfig.json found under ${analysisRoot}`);
          }
          resolvedTsconfig = candidates[0].fsPath;
        }

        return runAnalyzeCurrentCodePipeline({
          analysisRoot,
          tsconfigPath: resolvedTsconfig,
          trailDb,
          callbacks: server,
          codeGraphService,
          logger,
        });
      };

      server.onAnalyzeReleaseCode = async () => {
        return runAnalyzeReleaseCodePipeline({
          trailDb,
          codeGraphService,
          gitRoot: primaryGitRoot,
        });
      };

      server.onAnalyzeAll = async () => {
        const startedAt = Date.now();
        const result = await trailDb.importAll(
          (message) => logger.info(`Trail import (HTTP): ${message}`),
          effectiveGitRoots,
        );
        return { ...result, durationMs: Date.now() - startedAt };
      };

      logger.info('analyze pipeline wired', {
        repos: codeGraphRepos.map((r) => r.id),
        primary: primaryGitRoot,
      });
    } else {
      logger.warn('analyze pipeline not wired — no gitRoots configured');
    }

    const port = Number.parseInt(String(opts.port), 10);
    await server.start(port);
    const actualPort = server.port;
    const url = `http://${opts.host}:${actualPort}`;
    logger.info('daemon listening', { url });

    // MemoryCoreService — daemon は memory-core ingest pipeline をホストする。
    // pause/resume 状態は `${TRAIL_HOME}/memory-core-runner.json` に永続化され、
    // VS Code 拡張 reload 後・daemon 再起動後も保持される。
    const memoryCoreLogSink: MemoryCoreLogSink = {
      appendLine: (msg: string) => logger.info(msg),
    };
    const memoryCorePrimaryGitRoot = effectiveGitRoots[0];
    const memoryCoreService = new MemoryCoreService({
      logSink: memoryCoreLogSink,
      trailDbPath: join(dbStorageDir, 'trail.db'),
      ...(memoryCorePrimaryGitRoot ? { gitRoot: memoryCorePrimaryGitRoot } : {}),
      statePath: join(TRAIL_HOME, 'memory-core-runner.json'),
      backfillDays: config.memory.conversation.backfillDays,
    });
    server.setMemoryCoreService(memoryCoreService);
    logger.info('memory-core service wired', {
      paused: memoryCoreService.getStatus().paused,
      gitRoot: memoryCorePrimaryGitRoot ?? null,
    });

    const memoryLogger = {
      info: (msg: string, ctx?: Record<string, unknown>) =>
        logger.info(ctx ? `${msg} ${JSON.stringify(ctx)}` : msg),
      error: (msg: string, err?: unknown) => logger.error(msg, err),
    };

    const chatBridge = new ChatBridge({
      memoryDbPath: MEMORY_DB_PATH,
      getConfig: () => ({
        baseUrl: config.memory.ollama.baseUrl,
        chatModel: config.memory.chat.model,
        embedModel: config.memory.embedding.model,
        bm25Limit: config.memory.rag.bm25Limit,
        vecLimit: config.memory.rag.vecLimit,
        finalLimit: config.memory.rag.finalLimit,
        rrfK: config.memory.rag.rrfK,
      }),
      logger: memoryLogger,
    });
    server.setChatBridge(chatBridge);
    logger.info('chat bridge wired', { memoryDbPath: MEMORY_DB_PATH });

    const rebuildScheduler = new RebuildScheduler({
      memoryDbPath: MEMORY_DB_PATH,
      logger: memoryLogger,
    });
    const rebuildSchedulerDisposable = rebuildScheduler.start(
      config.memory.fts.rebuildIntervalMinutes * 60 * 1000,
    );
    logger.info('rebuild scheduler started', {
      intervalMin: config.memory.fts.rebuildIntervalMinutes,
    });

    // createAnalyzeAllJob は importAll → runOnce('periodic') を順次実行する
    // (= VS Code 拡張の anytime-trail.analyzeAll コマンドと同じデータフロー)。
    // 以前は createPeriodicImportJob (importAll のみ) と createMemoryCorePipelineJob
    // (runOnce のみ) を別個に登録していたが、メモリ取込が import より先に走って
    // しまうレースを避けるため 1 ジョブに統合した。interval / runOnStart は
    // top-level analyzeAll 側の設定に従う (旧 scheduler.periodicImport / memory.ingest は廃止)。
    const scheduler = new DaemonScheduler(
      [
        createAnalyzeAllJob({
          service: memoryCoreService,
          trailDb,
          gitRoots: effectiveGitRoots,
          intervalMs: config.analyzeAll.intervalSec * 1000,
          runOnStart: config.analyzeAll.runOnStart,
          startupDelayMs: config.analyzeAll.startupDelaySec * 1000,
          // VS Code 拡張 OllamaProvider が polling して per-phase 表示を更新する
          importAllStatusFilePath: join(dbStorageDir, 'importall-phase-status.json'),
        }),
      ],
      logger,
    );

    const schedulerDisabledByEnv = process.env.TRAIL_DISABLE_SCHEDULER === '1';
    const schedulerEnabled = opts.scheduler && !schedulerDisabledByEnv;
    if (!schedulerEnabled) {
      logger.info('scheduler disabled', {
        reason: schedulerDisabledByEnv ? 'TRAIL_DISABLE_SCHEDULER=1' : '--no-scheduler',
      });
    } else {
      scheduler.start();
    }

    lc.writeDaemonJson({
      schemaVersion: 1,
      pid: process.pid,
      host: opts.host,
      port: actualPort,
      url,
      version: VERSION,
      startedAt: new Date().toISOString(),
      startedBy: 'cli',
      dbPath: join(dbStorageDir, 'trail.db'),
      gitRoots,
      viewerDistPath: distPath,
      pidStartTime: Date.now(),
    });

    const shutdown = async (signal: string) => {
      logger.info('shutdown requested', { signal });
      try { await scheduler.stop(); } catch (err) { logger.error('scheduler stop failed', err); }
      try { await memoryCoreService.dispose(); } catch (err) { logger.error('memory-core dispose failed', err); }
      try { rebuildSchedulerDisposable.dispose(); } catch (err) { logger.error('rebuild scheduler dispose failed', err); }
      // ChatBridge holds WebSocket connections; dispose after scheduler/ingest stop but before server closes.
      try { await chatBridge.dispose(); } catch (err) { logger.error('chat bridge dispose failed', err); }
      try { await server.stop(); } catch (err) { logger.error('server stop failed', err); }
      lc.removeDaemonJson();
      try {
        const closeFn = (trailDb as unknown as { close?: () => Promise<void> | void }).close;
        if (typeof closeFn === 'function') await closeFn.call(trailDb);
      } catch (err) { logger.error('trail db close failed', err); }
      try { extensionLogsDb.close(); } catch (err) { logger.error('extension-logs.db close failed', err); }
      process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  });

program
  .command('status')
  .description('Check daemon status')
  .action(() => {
    const lc = new DaemonLifecycle({
      jsonPath: join(TRAIL_HOME, 'daemon.json'),
      lockPath: join(TRAIL_HOME, 'daemon.lock'),
    });
    const info = lc.readDaemonJson();
    if (!info) { console.log('Not running'); process.exit(1); }
    if (!lc.isDaemonAlive()) { console.log(`Stale daemon.json (pid=${info.pid})`); process.exit(1); }
    console.log(`Running on ${info.url} (pid=${info.pid})`);
  });

program
  .command('stop')
  .description('Stop the running daemon')
  .action(() => {
    const lc = new DaemonLifecycle({
      jsonPath: join(TRAIL_HOME, 'daemon.json'),
      lockPath: join(TRAIL_HOME, 'daemon.lock'),
    });
    const info = lc.readDaemonJson();
    if (!info || !lc.isDaemonAlive()) { console.log('No running daemon'); process.exit(1); }
    try {
      process.kill(info.pid, 'SIGTERM');
      console.log(`Sent SIGTERM to pid=${info.pid}`);
    } catch (err) {
      console.error('Failed to signal daemon', err);
      process.exit(1);
    }
  });

const ingestCmd = program
  .command('ingest')
  .description('Control memory-core ingest pipeline on the running daemon');

ingestCmd
  .command('pause')
  .description('Pause periodic memory-core ingest on the running daemon')
  .option('-r, --reason <reason>', 'pausedBy label sent to the daemon', 'cli')
  .action(async (opts: { reason: string }) => {
    await callDaemonMemoryCore('pause', { by: opts.reason });
  });

ingestCmd
  .command('resume')
  .description('Resume periodic memory-core ingest on the running daemon')
  .action(async () => {
    await callDaemonMemoryCore('resume');
  });

ingestCmd
  .command('status')
  .description('Show current memory-core ingest status from the running daemon')
  .action(async () => {
    await callDaemonMemoryCore('status');
  });

program.parse();

async function callDaemonMemoryCore(
  action: 'pause' | 'resume' | 'status',
  body?: Record<string, unknown>,
): Promise<void> {
  const lc = new DaemonLifecycle({
    jsonPath: join(TRAIL_HOME, 'daemon.json'),
    lockPath: join(TRAIL_HOME, 'daemon.lock'),
  });
  const info = lc.readDaemonJson();
  if (!info || !lc.isDaemonAlive()) {
    console.error('No running daemon — start it with `anytime-trail-server start`');
    process.exit(1);
  }
  const url = `${info.url}/api/memory-core/${action}`;
  const method = action === 'status' ? 'GET' : 'POST';
  try {
    const res = await fetch(url, {
      method,
      ...(method === 'POST'
        ? {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body ?? {}),
          }
        : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`HTTP ${res.status} from daemon: ${text}`);
      process.exit(1);
    }
    const status = await res.json();
    console.log(JSON.stringify(status, null, 2));
  } catch (err) {
    console.error('Failed to reach daemon:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function createLogger(toStdout: boolean): Logger {
  const logDir = join(TRAIL_HOME, 'logs');
  const today = new Date().toISOString().slice(0, 10);
  const logPath = join(logDir, `daemon-${today}.log`);
  const file = new FileLogger(logPath, 'info');
  if (!toStdout) return file;

  class CompositeLogger {
    constructor(
      private readonly a: Logger,
      private readonly b: Logger,
    ) {}
    debug(m: string, meta?: Record<string, unknown>) { this.a.debug(m, meta); this.b.debug(m, meta); }
    info(m: string, meta?: Record<string, unknown>) { this.a.info(m, meta); this.b.info(m, meta); }
    warn(m: string, meta?: Record<string, unknown>) { this.a.warn(m, meta); this.b.warn(m, meta); }
    error(m: string, e?: unknown, meta?: Record<string, unknown>) {
      this.a.error(m, e, meta); this.b.error(m, e, meta);
    }
    child(scope: string): Logger {
      return new CompositeLogger(this.a.child(scope), this.b.child(scope));
    }
  }
  return new CompositeLogger(new ConsoleLogger('info'), file);
}

interface TrailLoggerLike {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}
function makeTrailLoggerAdapter(logger: Logger): TrailLoggerLike {
  return {
    info: (msg) => logger.info(msg),
    warn: (msg) => logger.warn(msg),
    error: (msg, err) => logger.error(msg, err),
  };
}
