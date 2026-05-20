#!/usr/bin/env node
import { Command } from 'commander';
import { join, basename } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { TrailDatabase } from '@anytime-markdown/trail-db';
import { MemoryCoreService, type MemoryCoreLogSink, type LepStage, BetterSqlite3MemoryDb, getMemoryCoreDbPath, getTrailHome } from '@anytime-markdown/memory-core';
import { ChatBridge } from './memory-chat/chatBridge';
import { RebuildScheduler } from './memory-chat/rebuildScheduler';
import { CREATE_EXTENSION_LOGS, CREATE_EXTENSION_LOGS_INDEXES } from '@anytime-markdown/trail-core/domain/schema';
import { TrailDataServer } from './server/TrailDataServer';
import { LogService } from './services/LogService';
import { DaemonLifecycle } from './runtime/DaemonLifecycle';
import { ConsoleLogger, FileLogger, type Logger } from './runtime/Logger';
import { loadConfig } from './runtime/Config';
import { ensureLepConfigFile, loadLepConfig, disabledMemoryAnalyzerIds, resolveGitHubSource } from './runtime/LepConfig';
import { checkLlmAvailability } from './lep/LlmAvailability';
import { AnalyzeAllRunner, type AnalyzeAllRunnerOptions } from './runner/AnalyzeAllRunner';
import { createFetchGitHubReviewClient } from './lep/ingesters/github/GitHubReviewClient';
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

    // LEP 設定 (lep.json) 読込 + stage 解決 (Step 3d)。daemon は primary gitRoot を workspace とする。
    // 解決した stage を AnalyzeAllRunner に渡して Wave 実行範囲を制御する。
    const lepWorkspaceRoot = effectiveGitRoots[0];
    let lepStage: LepStage = opts.scheduler ? 'primary+memory' : 'disabled';
    let lepDisabledAnalyzers: readonly string[] = [];
    let githubPrReview: AnalyzeAllRunnerOptions['githubPrReview'] | undefined;
    if (lepWorkspaceRoot) {
      try {
        ensureLepConfigFile({
          workspaceRoot: lepWorkspaceRoot,
          legacy: {
            analyzeAllEnabled: opts.scheduler,
            analyzeAll: config.analyzeAll,
            ollamaBaseUrl: config.memory.ollama.baseUrl,
            chatModel: config.memory.chat.model,
            embeddingModel: config.memory.embedding.model,
          },
          logger,
        });
        const lep = loadLepConfig({ workspaceRoot: lepWorkspaceRoot, logger });
        lepStage = lep.config.stage;
        lepDisabledAnalyzers = disabledMemoryAnalyzerIds(lep.config);
        logger.info('lep.json loaded', { stage: lepStage, files: lep.loadedPaths.length });

        // 新ソース参照実装 (Step 4b): GitHub PR review。opt-in (sources.github.enabled)。
        const ghSource = resolveGitHubSource(lep.config);
        if (ghSource.enabled) {
          githubPrReview = {
            client: ghSource.token
              ? createFetchGitHubReviewClient({
                  token: ghSource.token,
                  logger: { info: (m) => logger.info(m), warn: (m) => logger.warn(m) },
                })
              : null,
            since: ghSource.since,
            maxPrs: ghSource.maxPrs,
          };
          logger.info('GitHub PR review source enabled', { hasToken: Boolean(ghSource.token) });
        }
      } catch (err) {
        logger.warn(`lep.json load failed: ${err instanceof Error ? err.message : String(err)}; fallback stage=${lepStage}`);
      }
    }

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
    logger.info('memory-core service constructed (orchestrated by AnalyzeAllRunner)', {
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

    // AnalyzeAllRunner は importAll → memory-core runOnce('periodic') を順次実行する
    // (= VS Code 拡張の anytime-trail.analyzeAll コマンドと同じデータフロー)。
    // メモリ取込が import より先に走ってしまうレースを避けるため 1 runner に統合済。
    // pause/resume は AnalyzeAllRunner が一元管理する (旧 memory-core 側の pause は使われない)。
    const analyzeAllRunner = new AnalyzeAllRunner({
      logSink: { appendLine: (msg: string) => logger.info(msg) },
      statePath: join(TRAIL_HOME, 'analyze-all-runner.json'),
      gitRoot: memoryCorePrimaryGitRoot,
      trailDb,
      gitRoots: effectiveGitRoots,
      memoryCoreService,
      stage: lepStage,
      checkLlmAvailability: () =>
        checkLlmAvailability({
          baseUrl: config.memory.ollama.baseUrl,
          chatModel: config.memory.chat.model,
          embedModel: config.memory.embedding.model,
        }),
      ollamaBaseUrl: config.memory.ollama.baseUrl,
      disabledMemoryAnalyzers: lepDisabledAnalyzers,
      disabledAggregators: lepDisabledAnalyzers,
      githubPrReview,
      // VS Code 拡張 OllamaProvider が polling して per-phase 表示を更新する
      importAllStatusFilePath: join(dbStorageDir, 'importall-phase-status.json'),
    });
    server.setAnalyzeAllRunner(analyzeAllRunner);
    logger.info('analyze-all runner wired', {
      paused: analyzeAllRunner.getStatus().paused,
    });

    const schedulerDisabledByEnv = process.env.TRAIL_DISABLE_SCHEDULER === '1';
    const schedulerEnabled = opts.scheduler && !schedulerDisabledByEnv;
    if (!schedulerEnabled) {
      logger.info('scheduler disabled', {
        reason: schedulerDisabledByEnv ? 'TRAIL_DISABLE_SCHEDULER=1' : '--no-scheduler',
      });
    } else {
      analyzeAllRunner.start(config.analyzeAll.intervalSec * 1000, {
        runOnStart: config.analyzeAll.runOnStart,
        startupDelayMs: config.analyzeAll.startupDelaySec * 1000,
      });
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
      try { await analyzeAllRunner.dispose(); } catch (err) { logger.error('analyze-all runner dispose failed', err); }
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

const analyzeAllCmd = program
  .command('analyze-all')
  .description('Control analyzeAll pipeline (importAll + memory-core) on the running daemon');

analyzeAllCmd
  .command('pause')
  .description('Pause periodic analyzeAll pipeline on the running daemon')
  .option('-r, --reason <reason>', 'pausedBy label sent to the daemon', 'cli')
  .action(async (opts: { reason: string }) => {
    await callDaemonAnalyzeAll('pause', { by: opts.reason });
  });

analyzeAllCmd
  .command('resume')
  .description('Resume periodic analyzeAll pipeline on the running daemon')
  .action(async () => {
    await callDaemonAnalyzeAll('resume');
  });

analyzeAllCmd
  .command('status')
  .description('Show current analyzeAll pipeline status from the running daemon')
  .action(async () => {
    await callDaemonAnalyzeAll('status');
  });

program.parse();

async function callDaemonAnalyzeAll(
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
  // daemon.json から得た URL を検証 (CodeQL `js/file-access-to-http`): localhost のみ許可。
  let parsedInfoUrl: URL;
  try {
    parsedInfoUrl = new URL(info.url);
  } catch {
    console.error(`Invalid daemon URL in daemon.json: ${info.url}`);
    process.exit(1);
  }
  if (parsedInfoUrl.hostname !== '127.0.0.1' && parsedInfoUrl.hostname !== 'localhost') {
    console.error(`Refusing to call non-localhost daemon URL: ${parsedInfoUrl.hostname}`);
    process.exit(1);
  }
  const url = `${parsedInfoUrl.origin}/api/analyze-all/${action}`;
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
