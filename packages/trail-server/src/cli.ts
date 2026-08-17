#!/usr/bin/env node
import { Command } from 'commander';
import { join, basename } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { TrailDatabase } from '@anytime-markdown/trail-db';
import { CaravanBookService, PipelineRunLedger, createPipelineRunLedgerFactory } from '@anytime-markdown/trail-caravan-book/pipeline';
import {
  type CaravanBookLogSink,
  type LepStage,
  attachTrailDbReadOnly,
  countDanglingReferences,
  countForeignWorkspaceMemory,
  getCaravanBookDbPath,
  getTrailHome,
  openCaravanBookDb,
  ownWorkspaceScope,
  rebuildContentlessFtsIndexes,
  unsafePurgeForeignWorkspaceMemory,
  unsafeRepairDanglingReferences,
} from '@anytime-markdown/trail-caravan-book';
import { ChatBridge } from './caravan-chat/chatBridge';
import { RebuildScheduler } from './caravan-chat/rebuildScheduler';
import { TrailDataServer } from './server/TrailDataServer';
import { LogService } from './services/LogService';
import { DaemonLifecycle } from './runtime/DaemonLifecycle';
import { ConsoleLogger, FileLogger, type Logger } from './runtime/Logger';
import { ThrottleStatusWriter } from './runtime/ThrottleStatusWriter';
import {
  migrateConfigJsonIntoLepJson,
  loadLepConfig,
  disabledAnalyzerIds,
  resolveGitHubSource,
  resolveExcludeRoot,
  DEFAULT_LEP_CONFIG,
  type LepConfig,
} from './runtime/LepConfig';
import {
  resolveOllamaBaseUrl,
  createOllamaClient,
  createThrottledOllamaClient,
  OllamaThrottleGovernor,
} from '@anytime-markdown/agent-core';
import { checkLlmAvailability } from './lep/LlmAvailability';
import { AnalyzeAllRunner, type AnalyzeAllRunnerOptions } from './runner/AnalyzeAllRunner';
import { createFetchGitHubReviewClient } from './lep/ingesters/github/GitHubReviewClient';
import { CodeGraphService } from './analyze/CodeGraphService';
import {
  findTsconfigCandidates,
  hasPythonFiles,
  resolveGitRootForRepo,
  runAnalyzeCurrentCodePipeline,
  runAnalyzeCommitCodePipeline,
  runAnalyzeReleaseCodePipeline,
  toAnalyzeReleaseScope,
  UnknownRepoError,
} from './analyze/AnalyzePipeline';

const TRAIL_HOME = getTrailHome(process.cwd());
const MEMORY_DB_PATH = getCaravanBookDbPath(process.cwd());
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
    // CLI は standalone（typescript 同梱）のため /api/trail/refresh の release 解析は
    // in-process `analyze` を analyzeReleaseFn として注入する（daemon は analyze-child へ委譲）。
    const { analyze } = await import('@anytime-markdown/trail-activity/analyze');
    // caravan-book.db は activity.db と同じ dbStorageDir に置かれる。ここで明示的に渡す
    // （CaravanApiHandler 側の cwd 基準の暗黙解決を廃したため。解決結果は従来と同一）。
    const caravanDbPath = join(dbStorageDir, 'caravan-book.db');
    const server = new TrailDataServer(distPath, trailDb, logger, gitRoots[0], caravanDbPath, undefined, analyze);

    // nativeBinding: webpack-bundled 実行時は bindings package の getFileName が
    // call stack を辿って .node のパスを推測できず crash する。__dirname
    // (= dist/) から native binary の絶対パスを組み立てて回避する
    // (vscode-trail-extension の caravanBookNativeBinding と同等)。
    const cliNativeBinding = join(
      __dirname,
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    );

    // gitRoots の bootstrap (鶏卵回避): CLI --git-roots → home-tier ~/.anytime/trail/lep.json
    // の gitRoots → 空。workspace lep.json は gitRoots 解決後でないと読めないため home-tier を使う。
    const bootstrapGitRoots =
      gitRoots.length > 0 ? gitRoots : loadLepConfig({ logger }).config.sources.gitRoots;
    const effectiveGitRoots = bootstrapGitRoots;

    // LEP 設定 (lep.json) — 唯一の設定ソース。旧 config.json は一度きり lep.json へ移行し以後読まない。
    // daemon は primary gitRoot を workspace とし、stage / schedule / llm / memory を集約する。
    const lepWorkspaceRoot = effectiveGitRoots[0];
    const { lepConfig, lepStage, lepDisabledAnalyzers, githubPrReview } = setupLepForDaemon(
      lepWorkspaceRoot,
      opts.scheduler,
      logger,
    );

    // ingest / chat / health で共有する LLM 値を lep.json から解決する。
    // baseUrl は resolveOllamaBaseUrl で env / Dev Container 検出を畳み込み、
    // health-check と実取込で同一値を使う (split-brain 防止)。
    const lepOllama = lepConfig.llm.providers.ollama;
    const resolvedOllamaBaseUrl = resolveOllamaBaseUrl(lepOllama.baseUrl);
    const ingestGenModel = process.env['MEMORY_CORE_GEN_MODEL'] || lepOllama.models.chat;

    // Ollama 熱負荷スロットリング (劣化 CPU 延命)。背景パイプラインのみに適用する。
    const throttle = setupOllamaThrottle(lepConfig.throttle, {
      baseUrl: resolvedOllamaBaseUrl,
      statusFilePath: join(dbStorageDir, 'throttle-status.json'),
      logger,
    });
    const throttleGovernor = throttle.governor;
    const throttledOllamaFactory = throttle.factory;
    const throttleStatusWriter = throttle.statusWriter;
    throttleStatusWriter?.start();

    // Wire analyze pipeline if gitRoots are available
    wireAnalyzePipeline({ effectiveGitRoots, lepConfig, lepWorkspaceRoot, trailDb, server, logger });

    const port = Number.parseInt(String(opts.port), 10);
    await server.start(port);
    const actualPort = server.port;
    const url = `http://${opts.host}:${actualPort}`;
    logger.info('daemon listening', { url });

    // CaravanBookService — daemon は trail-caravan-book ingest pipeline をホストする。
    // pause/resume 状態は `${TRAIL_HOME}/trail-caravan-book-runner.json` に永続化され、
    // VS Code 拡張 reload 後・daemon 再起動後も保持される。
    const caravanBookPrimaryGitRoot = effectiveGitRoots[0];
    const caravanBookService = createCaravanBookService({
      gitRoot: caravanBookPrimaryGitRoot,
      trailDbPath: join(dbStorageDir, 'activity.db'),
      statePath: join(TRAIL_HOME, 'trail-caravan-book-runner.json'),
      backfillDays: lepConfig.memory.conversation.backfillDays,
      workspaceScopeMode: lepConfig.memory.workspaceScope,
      llm: {
        baseUrl: lepOllama.baseUrl,
        chatModel: ingestGenModel,
        embedModel: lepOllama.models.embedding,
      },
      ollamaFactory: throttledOllamaFactory,
      logger,
    });

    const caravanLogger = {
      info: (msg: string, ctx?: Record<string, unknown>) =>
        logger.info(ctx ? `${msg} ${JSON.stringify(ctx)}` : msg),
      error: (msg: string, err?: unknown) => logger.error(msg, err),
    };

    const chatBridge = new ChatBridge({
      caravanDbPath: MEMORY_DB_PATH,
      getConfig: () => ({
        baseUrl: resolvedOllamaBaseUrl,
        chatModel: lepOllama.models.chat,
        embedModel: lepOllama.models.embedding,
        bm25Limit: lepConfig.memory.rag.bm25Limit,
        vecLimit: lepConfig.memory.rag.vecLimit,
        finalLimit: lepConfig.memory.rag.finalLimit,
        rrfK: lepConfig.memory.rag.rrfK,
      }),
      logger: caravanLogger,
    });
    server.setChatBridge(chatBridge);
    logger.info('chat bridge wired', { caravanDbPath: MEMORY_DB_PATH });

    const rebuildScheduler = new RebuildScheduler({
      caravanDbPath: MEMORY_DB_PATH,
      logger: caravanLogger,
    });
    const rebuildSchedulerDisposable = rebuildScheduler.start(
      lepConfig.memory.fts.rebuildIntervalMinutes * 60 * 1000,
    );
    logger.info('rebuild scheduler started', {
      intervalMin: lepConfig.memory.fts.rebuildIntervalMinutes,
    });

    // AnalyzeAllRunner は importAll → trail-caravan-book runOnce('periodic') を順次実行する
    // (= VS Code 拡張の anytime-trail.analyzeAll コマンドと同じデータフロー)。
    // メモリ取込が import より先に走ってしまうレースを避けるため 1 runner に統合済。
    // pause/resume は AnalyzeAllRunner が一元管理する (旧 trail-caravan-book 側の pause は使われない)。
    // Wave 1/2/4 の実行台帳。Wave 3 のセッションと同じ caravan-book.db を共有するため
    // WAL で開き、migration はここで走らせない (スキーマの所有は trail-caravan-book 側)。
    // caravan-book.db が未作成の間は caravan_pipeline_runs が無いので記録を諦める (null 返し)。
    const ledgerCoreDb = await openCaravanBookDb(caravanDbPath, {
      ...(existsSync(cliNativeBinding) ? { nativeBinding: cliNativeBinding } : {}),
    });
    const ledgerDb = ledgerCoreDb.conn ?? ledgerCoreDb.db;
    const openPipelineRunLedger = createPipelineRunLedgerFactory({
      db: ledgerDb,
      logger: caravanLogger,
    });

    const systemRunLedger = new PipelineRunLedger({
      db: ledgerDb,
      scope: 'daemon_session',
      wave: 'system',
      tier: 0,
      logger: caravanLogger,
    });
    const systemRunId = systemRunLedger.start();
    const logService = new LogService(ledgerDb, systemRunId);
    server.setLogService(logService);
    logger.info('log streaming service wired', { dbPath: caravanDbPath, runId: systemRunId });

    const analyzeAllRunner = new AnalyzeAllRunner({
      logSink: { appendLine: (msg: string) => logger.info(msg) },
      statePath: join(TRAIL_HOME, 'analyze-all-runner.json'),
      gitRoot: caravanBookPrimaryGitRoot,
      trailDb,
      gitRoots: effectiveGitRoots,
      // 設計書リポジトリはコード解析の対象ではないが、check_alignment が
      // 「設計書が更新されたか」を判定するために commit 取込は必要。gitRoots へ
      // 二重に書かせず sources.docs.root から導出する。
      commitWatchRoots: resolveDocsCommitWatchRoots(lepConfig.sources.docs.root, logger),
      claudeProjectsDir: lepConfig.sources.claude.projectsDir || undefined,
      codexSessionsDir: lepConfig.sources.codex.sessionsDir || undefined,
      caravanBookService,
      stage: lepStage,
      checkLlmAvailability: () =>
        checkLlmAvailability({
          baseUrl: resolvedOllamaBaseUrl,
          chatModel: ingestGenModel,
          embedModel: lepOllama.models.embedding,
        }),
      ollamaBaseUrl: resolvedOllamaBaseUrl,
      disabledCaravanAnalyzers: lepDisabledAnalyzers,
      disabledAggregators: lepDisabledAnalyzers,
      githubPrReview,
      // VS Code 拡張 OllamaProvider が polling して per-phase 表示を更新する
      importAllStatusFilePath: join(dbStorageDir, 'importall-phase-status.json'),
      // stage が memory を含まない run 後に memory scope を skipped 記録する宛先。
      pipelineStatusFilePath: join(dbStorageDir, 'pipeline-status.json'),
      shouldDeferScheduled: () => throttleGovernor.shouldDeferScheduled(),
      openPipelineRunLedger,
    });
    server.setAnalyzeAllRunner(analyzeAllRunner);
    logger.info('analyze-all runner wired', {
      paused: analyzeAllRunner.getStatus().paused,
    });

    startAnalyzeAllScheduler(analyzeAllRunner, {
      cliEnabled: opts.scheduler,
      schedule: lepConfig.schedule,
      logger,
    });

    lc.writeDaemonJson({
      schemaVersion: 1,
      pid: process.pid,
      host: opts.host,
      port: actualPort,
      url,
      version: VERSION,
      startedAt: new Date().toISOString(),
      startedBy: 'cli',
      dbPath: join(dbStorageDir, 'activity.db'),
      gitRoots,
      viewerDistPath: distPath,
      pidStartTime: Date.now(),
    });

    const shutdownDeps: DaemonShutdownDeps = {
      logger,
      lc,
      throttleStatusWriter,
      analyzeAllRunner,
      caravanBookService,
      rebuildSchedulerDisposable,
      chatBridge,
      server,
      trailDb,
      systemRunLedger,
      ledgerCoreDb,
    };
    const shutdown = async (signal: string) => shutdownDaemon(signal, shutdownDeps);
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
  .description('Control analyzeAll pipeline (importAll + trail-caravan-book) on the running daemon');

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

const caravanCmd = program
  .command('caravan')
  .description('Maintenance commands for the caravan-book knowledge graph');

caravanCmd
  .command('purge-foreign-workspace')
  .description(
    '他ワークスペース由来の記憶（会話・レビュー）を数える。' +
      '--apply を付けたときだけ削除する（既定は件数の表示のみ）',
  )
  .option('--apply', '実際に削除する（不可逆。事前にバックアップを取ること）', false)
  .option('--repo <name>', '残す側の repo 名（既定は cwd の basename）')
  .action(async (opts: { apply: boolean; repo?: string }) => {
    const repoName = opts.repo ?? basename(process.cwd());
    const trailDbPath = join(TRAIL_HOME, 'db', 'activity.db');
    const activityPath = existsSync(trailDbPath)
      ? trailDbPath
      : join(process.cwd(), '.anytime', 'trail', 'db', 'activity.db');
    if (!existsSync(activityPath)) {
      console.error(`activity.db が見つかりません: ${activityPath}`);
      process.exit(1);
    }

    const memDb = await openCaravanBookDb(MEMORY_DB_PATH);
    try {
      await attachTrailDbReadOnly(memDb.db, activityPath);
      const scope = ownWorkspaceScope(repoName);
      const counts = countForeignWorkspaceMemory({ db: memDb.db, scope });
      console.log(`repo=${repoName} / caravan-book=${MEMORY_DB_PATH}`);
      console.log(JSON.stringify(counts, null, 2));
      if (!opts.apply) {
        console.log('（表示のみ。削除するには --apply を付ける。事前にバックアップを取ること）');
        return;
      }
      const deleted = unsafePurgeForeignWorkspaceMemory({
        db: memDb.db,
        scope,
        logger: { info: (m) => console.log(m), error: (m, e) => console.error(m, e) },
      });
      console.log('deleted:', JSON.stringify(deleted, null, 2));
      // FTS5 索引の再構築は削除した側の責務。ここを飛ばすと消えた行が全文検索に残る。
      // runRagFtsRebuild は現存行を入れ直すだけで削除済み rowid を落とさないため、
      // 索引ごと作り直す専用の関数を使う。
      const fts = rebuildContentlessFtsIndexes(memDb.db, {
        info: (m) => console.log(m),
        error: (m, e) => console.error(m, e),
      });
      console.log(`fts rebuild: entities=${fts.entities} episodes=${fts.episodes}`);
      memDb.save();
    } finally {
      memDb.close();
    }
  });

caravanCmd
  .command('repair-references')
  .description(
    '参照先を失った行（外部キー違反）を数える。--apply を付けたときだけ修復する' +
      '（既定は件数の表示のみ）',
  )
  .option('--apply', '実際に修復する（事前にバックアップを取ること）', false)
  .action(async (opts: { apply: boolean }) => {
    const memDb = await openCaravanBookDb(MEMORY_DB_PATH);
    try {
      console.log(`caravan-book=${MEMORY_DB_PATH}`);
      console.log(JSON.stringify(countDanglingReferences(memDb.db), null, 2));
      if (!opts.apply) {
        console.log('（表示のみ。修復するには --apply を付ける。事前にバックアップを取ること）');
        return;
      }
      const repaired = unsafeRepairDanglingReferences({
        db: memDb.db,
        logger: { info: (m) => console.log(m), error: (m, e) => console.error(m, e) },
      });
      console.log('repaired:', JSON.stringify(repaired, null, 2));
      // caravan_entities を増やしたので contentless FTS5 索引を作り直す。
      const fts = rebuildContentlessFtsIndexes(memDb.db, {
        info: (m) => console.log(m),
        error: (m, e) => console.error(m, e),
      });
      console.log(`fts rebuild: entities=${fts.entities} episodes=${fts.episodes}`);
      memDb.save();
    } finally {
      memDb.close();
    }
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
      console.error(`HTTP ${res.status} from daemon: ${text.replaceAll(/[\r\n]/g, '')}`);
      process.exit(1);
    }
    const status = await res.json();
    console.log(JSON.stringify(status, null, 2));
  } catch (err) {
    console.error('Failed to reach daemon:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

/** daemon 起動時に lep.json から解決する設定一式。 */
interface DaemonLepSetup {
  readonly lepConfig: LepConfig;
  readonly lepStage: LepStage;
  readonly lepDisabledAnalyzers: readonly string[];
  readonly githubPrReview: AnalyzeAllRunnerOptions['githubPrReview'] | undefined;
}

/**
 * LEP 設定 (lep.json) を解決する。旧 config.json は一度きり lep.json へ移行し以後読まない。
 * workspace ルート未確定・読み込み失敗時は既定値へフォールバックする (warn のみ・daemon は止めない)。
 */
function setupLepForDaemon(
  lepWorkspaceRoot: string | undefined,
  schedulerEnabled: boolean,
  logger: Logger,
): DaemonLepSetup {
  let lepConfig: LepConfig = DEFAULT_LEP_CONFIG;
  let lepStage: LepStage = schedulerEnabled ? 'primary+memory' : 'disabled';
  let lepDisabledAnalyzers: readonly string[] = [];
  let githubPrReview: AnalyzeAllRunnerOptions['githubPrReview'] | undefined;
  if (lepWorkspaceRoot) {
    try {
      // config.json → lep.json 一度きり移行 (欠落セクションのみ gap-fill、完了後 rename)。
      migrateConfigJsonIntoLepJson({
        workspaceRoot: lepWorkspaceRoot,
        analyzeAllEnabled: schedulerEnabled,
        logger,
      });
      const lep = loadLepConfig({ workspaceRoot: lepWorkspaceRoot, logger });
      lepConfig = lep.config;
      lepStage = lep.config.stage;
      lepDisabledAnalyzers = disabledAnalyzerIds(lep.config);
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
  return { lepConfig, lepStage, lepDisabledAnalyzers, githubPrReview };
}

/** Ollama スロットリングの構成物。無効時は factory / statusWriter とも undefined。 */
interface OllamaThrottleSetup {
  readonly governor: OllamaThrottleGovernor;
  readonly factory?: () => ReturnType<typeof createThrottledOllamaClient>;
  readonly statusWriter?: ThrottleStatusWriter;
}

/**
 * Ollama 熱負荷スロットリング (劣化 CPU 延命) を構成する。
 * statusWriter は throttle 状態を OLLAMA パネル (vscode-agent-extension) へ渡す status file writer。
 */
function setupOllamaThrottle(
  cfg: LepConfig['throttle'],
  args: { readonly baseUrl: string; readonly statusFilePath: string; readonly logger: Logger },
): OllamaThrottleSetup {
  const governor = new OllamaThrottleGovernor(cfg);
  if (!cfg.enabled) return { governor };
  args.logger.info('ollama throttle enabled', {
    slowdownFactor: cfg.slowdownFactor,
    cooldownSec: cfg.cooldownSec,
    maxContinuousMin: cfg.maxContinuousMin,
  });
  return {
    governor,
    factory: () =>
      createThrottledOllamaClient(createOllamaClient({ baseUrl: args.baseUrl }), governor),
    statusWriter: new ThrottleStatusWriter(governor, args.statusFilePath, args.logger),
  };
}

/**
 * gitRoots が解決できていれば解析パイプライン (CodeGraphService と各 analyze ハンドラ) を
 * server へ配線する。gitRoots が空なら配線せず warn のみ残す。
 */
function wireAnalyzePipeline(args: {
  readonly effectiveGitRoots: readonly string[];
  readonly lepConfig: LepConfig;
  readonly lepWorkspaceRoot: string | undefined;
  readonly trailDb: TrailDatabase;
  readonly server: TrailDataServer;
  readonly logger: Logger;
}): void {
  const { effectiveGitRoots, lepConfig, lepWorkspaceRoot, trailDb, server, logger } = args;
  if (effectiveGitRoots.length > 0) {
    const codeGraphRepos = effectiveGitRoots.map((p) => ({
      id: basename(p),
      label: basename(p),
      path: p,
    }));
    const primaryGitRoot = effectiveGitRoots[0]!;
    // 除外ルートは lep.json workspace.excludeRoot で一元管理する（空なら undefined →
    // 解析対象リポ自身にフォールバック）。相対は primary gitRoot 起点で絶対化。
    const analyzeExcludeRoot = resolveExcludeRoot(lepConfig, lepWorkspaceRoot);

    const codeGraphService = new CodeGraphService({
      repositories: codeGraphRepos,
      trailDb,
      logger,
      pythonWasmPath: join(__dirname, 'wasm', 'tree-sitter-python.wasm'),
      excludeRoot: analyzeExcludeRoot,
    });
    server.setCodeGraphService(codeGraphService);

    server.onAnalyzeCurrentCode = ({ workspacePath, tsconfigPath }) =>
      runCurrentCodeAnalysis({
        workspacePath,
        tsconfigPath,
        primaryGitRoot,
        excludeRoot: analyzeExcludeRoot,
        trailDb,
        server,
        codeGraphService,
        logger,
      });

    server.onAnalyzeReleaseCode = async (req) => {
      return runAnalyzeReleaseCodePipeline({
        trailDb,
        codeGraphService,
        gitRoot: primaryGitRoot,
        // standalone CLI は非バンドル環境なので computeAnalysis.js を解決できる。
        compute: { kind: 'in-host' },
        scope: toAnalyzeReleaseScope(req.tags),
        logger,
      });
    };

    // Snapshot per Commit: 1 コミット分のみ生成する。
    server.onAnalyzeCommitCode = async (req) => {
      // 保存先は req.repo が決めるので、解析対象の git root も req.repo から引く。
      // primary をそのまま渡すと、別リポジトリ名で primary の断面を保存し得る。
      const commitGitRoot = resolveGitRootForRepo(effectiveGitRoots, req.repo);
      if (!commitGitRoot) throw new UnknownRepoError(req.repo);
      return runAnalyzeCommitCodePipeline({
        trailDb,
        codeGraphService,
        gitRoot: commitGitRoot,
        sha: req.sha,
        repoName: req.repo,
        // standalone CLI は非バンドル環境なので computeAnalysis.js を解決できる。
        compute: { kind: 'in-host' },
        logger,
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
}

/**
 * daemon がホストする trail-caravan-book ingest pipeline のサービスを構成する。
 * gitRoot / ollamaFactory は未解決なら渡さない (CaravanBookService の既定へ委ねる)。
 */
function createCaravanBookService(args: {
  readonly gitRoot: string | undefined;
  readonly trailDbPath: string;
  readonly statePath: string;
  readonly backfillDays: number;
  readonly workspaceScopeMode: 'own' | 'all';
  readonly llm: { readonly baseUrl: string; readonly chatModel: string; readonly embedModel: string };
  readonly ollamaFactory: (() => ReturnType<typeof createThrottledOllamaClient>) | undefined;
  readonly logger: Logger;
}): CaravanBookService {
  const logSink: CaravanBookLogSink = {
    appendLine: (msg: string) => args.logger.info(msg),
  };
  const service = new CaravanBookService({
    logSink,
    trailDbPath: args.trailDbPath,
    ...(args.gitRoot ? { gitRoot: args.gitRoot } : {}),
    statePath: args.statePath,
    backfillDays: args.backfillDays,
    workspaceScopeMode: args.workspaceScopeMode,
    // lep.json の llm を ingest パイプラインへ通す (baseUrl は openCaravanDbSession
    // が resolveOllamaBaseUrl で再解決するため raw 値を渡す)。
    llm: args.llm,
    ...(args.ollamaFactory ? { ollamaFactory: args.ollamaFactory } : {}),
  });
  args.logger.info('trail-caravan-book service constructed (orchestrated by AnalyzeAllRunner)', {
    gitRoot: args.gitRoot ?? null,
  });
  return service;
}

/**
 * 定期実行スケジューラを起動する。`--no-scheduler` と `TRAIL_DISABLE_SCHEDULER=1` の
 * いずれかで無効化し、無効時はどちらが理由かを info ログへ残す。
 */
function startAnalyzeAllScheduler(
  runner: AnalyzeAllRunner,
  args: { readonly cliEnabled: boolean; readonly schedule: LepConfig['schedule']; readonly logger: Logger },
): void {
  const schedulerDisabledByEnv = process.env.TRAIL_DISABLE_SCHEDULER === '1';
  const schedulerEnabled = args.cliEnabled && !schedulerDisabledByEnv;
  if (schedulerEnabled) {
    runner.start(args.schedule.intervalSec * 1000, {
      runOnStart: args.schedule.runOnStart,
      startupDelayMs: args.schedule.startupDelaySec * 1000,
    });
  } else {
    args.logger.info('scheduler disabled', {
      reason: schedulerDisabledByEnv ? 'TRAIL_DISABLE_SCHEDULER=1' : '--no-scheduler',
    });
  }
}

/** daemon 停止時に破棄するリソース群。 */
interface DaemonShutdownDeps {
  readonly logger: Logger;
  readonly lc: DaemonLifecycle;
  readonly throttleStatusWriter: ThrottleStatusWriter | undefined;
  readonly analyzeAllRunner: AnalyzeAllRunner;
  readonly caravanBookService: CaravanBookService;
  readonly rebuildSchedulerDisposable: { dispose(): void };
  readonly chatBridge: ChatBridge;
  readonly server: TrailDataServer;
  readonly trailDb: TrailDatabase;
  readonly systemRunLedger: PipelineRunLedger;
  readonly ledgerCoreDb: { close(): void };
}

/**
 * SIGTERM / SIGINT 時の後始末。各 dispose の失敗は個別に error ログを残して次へ進む
 * (1 つの失敗で以降の解放を止めない)。最後に process.exit(0) する。
 */
async function shutdownDaemon(signal: string, deps: DaemonShutdownDeps): Promise<void> {
  const { logger, lc, trailDb } = deps;
  logger.info('shutdown requested', { signal });
  try { deps.throttleStatusWriter?.stop(); } catch (err) { logger.error('throttle status writer stop failed', err); }
  try { await deps.analyzeAllRunner.dispose(); } catch (err) { logger.error('analyze-all runner dispose failed', err); }
  try { await deps.caravanBookService.dispose(); } catch (err) { logger.error('trail-caravan-book dispose failed', err); }
  try { deps.rebuildSchedulerDisposable.dispose(); } catch (err) { logger.error('rebuild scheduler dispose failed', err); }
  // ChatBridge holds WebSocket connections; dispose after scheduler/ingest stop but before server closes.
  try { await deps.chatBridge.dispose(); } catch (err) { logger.error('chat bridge dispose failed', err); }
  try { await deps.server.stop(); } catch (err) { logger.error('server stop failed', err); }
  lc.removeDaemonJson();
  try {
    const closeFn = (trailDb as unknown as { close?: () => Promise<void> | void }).close;
    if (typeof closeFn === 'function') await closeFn.call(trailDb);
  } catch (err) { logger.error('trail db close failed', err); }
  // daemon の生存期間を表す system run を正常終了として閉じる。閉じないと
  // status='running' のまま残る（watchdog は system wave を失効させないため）。
  try { deps.systemRunLedger.finish('success'); } catch (err) { logger.error('system run finish failed', err); }
  try { deps.ledgerCoreDb.close(); } catch (err) { logger.error('pipeline run ledger db close failed', err); }
  process.exit(0);
}

async function runCurrentCodeAnalysis(args: {
  workspacePath: string | undefined;
  tsconfigPath: string | undefined;
  primaryGitRoot: string;
  excludeRoot: string | undefined;
  trailDb: TrailDatabase;
  server: TrailDataServer;
  codeGraphService: CodeGraphService;
  logger: Logger;
}): Promise<ReturnType<typeof runAnalyzeCurrentCodePipeline>> {
  const { workspacePath, tsconfigPath, primaryGitRoot, excludeRoot, trailDb, server, codeGraphService, logger } = args;
  const analysisRoot = workspacePath ?? primaryGitRoot;
  let rootStat: ReturnType<typeof statSync>;
  try { rootStat = statSync(analysisRoot); }
  catch { throw new Error(`workspace path does not exist: ${analysisRoot}`); }
  if (!rootStat.isDirectory()) {
    throw new Error(`workspace path is not a directory: ${analysisRoot}`);
  }

  let resolvedTsconfig: string | undefined = tsconfigPath;
  if (!resolvedTsconfig) {
    const candidates = findTsconfigCandidates(analysisRoot, excludeRoot);
    if (candidates.length > 0) {
      resolvedTsconfig = candidates[0].fsPath;
    } else if (hasPythonFiles(analysisRoot, excludeRoot)) {
      resolvedTsconfig = undefined; // Python-only 解析
    } else {
      throw new Error(`No tsconfig.json or Python files found under ${analysisRoot}`);
    }
  }

  return runAnalyzeCurrentCodePipeline({
    analysisRoot,
    excludeRoot,
    tsconfigPath: resolvedTsconfig,
    // standalone CLI は在来どおりホスト内で計算する（ソース起動時は computeAnalysis.js を解決できる）。
    // FIXME: webpack バンドル (dist/cli.js) では webpackIgnore により computeAnalysis.js が
    // 出力されないため、この経路はバンドル形態では失敗する（daemon の HTTP 経路と同じ欠陥）。
    // 解消には analyze-child を trail-server の webpack entry に追加し kind:'child' へ切り替える。
    compute: { kind: 'in-host' },
    trailDb,
    callbacks: server,
    codeGraphService,
    logger,
  });
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

/**
 * lep.json `sources.docs.root`（設計書リポジトリ）を commit 取込専用の監視対象へ変換する。
 *
 * 未設定・不在・git working tree でない場合は空配列を返す（警告は残す）。コード解析側
 * （コードグラフ / カバレッジ / リリース）の対象には入れない。
 */
export function resolveDocsCommitWatchRoots(docsRoot: string, logger: Logger): readonly string[] {
  const root = docsRoot.trim();
  if (root === '') return [];

  if (!existsSync(root)) {
    logger.warn('sources.docs.root does not exist; spec commit ingestion disabled', { root });
    return [];
  }
  if (!existsSync(join(root, '.git'))) {
    logger.warn('sources.docs.root is not a git repository; spec commit ingestion disabled', { root });
    return [];
  }

  return [root];
}
