#!/usr/bin/env node
import { Command } from 'commander';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { statSync } from 'node:fs';
import { TrailDatabase } from '@anytime-markdown/trail-db';
import { TrailDataServer } from './server/TrailDataServer';
import { DaemonLifecycle } from './runtime/DaemonLifecycle';
import { ConsoleLogger, FileLogger, type Logger } from './runtime/Logger';
import { loadConfig } from './runtime/Config';
import { DaemonScheduler } from './runtime/DaemonScheduler';
import { createPeriodicImportJob } from './jobs/PeriodicImportJob';
import { CodeGraphService } from './analyze/CodeGraphService';
import {
  findTsconfigCandidates,
  runAnalyzeCurrentCodePipeline,
  runAnalyzeReleaseCodePipeline,
} from './analyze/AnalyzePipeline';

const TRAIL_HOME = process.env.TRAIL_HOME ?? join(homedir(), '.claude', 'trail');
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

    const configPath = join(TRAIL_HOME, 'config.json');
    const config = loadConfig(configPath);
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
          trailDataServer: server,
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

    const scheduler = new DaemonScheduler(
      [
        createPeriodicImportJob({
          trailDb,
          gitRoots: effectiveGitRoots,
          intervalMs: config.scheduler.periodicImport.intervalSec * 1000,
          runOnStart: config.scheduler.periodicImport.runOnStart,
          startupDelayMs: config.scheduler.periodicImport.startupDelaySec * 1000,
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
      try {
        await scheduler.stop();
        await server.stop();
        lc.removeDaemonJson();
        const closeFn = (trailDb as unknown as { close?: () => Promise<void> | void }).close;
        if (typeof closeFn === 'function') await closeFn.call(trailDb);
      } catch (err) {
        logger.error('shutdown failed', err);
      }
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

program.parse();

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
