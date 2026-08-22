// trail-daemon child process のエントリ。
//
// host (extension) から fork され、IPC で `HostRequest` を受けて `DaemonResponse` を返す。
// 内部で CaravanBookService + AnalyzeAllRunner を構築・管理する。
//
// バンドルは vscode-trail-extension/webpack.config.js の `trailDaemonConfig` 経由で
// `dist/trail-daemon.js` として生成され、TrailDaemonHost が fork する。

import * as path from 'node:path';

import {
  openCaravanBookDb,
  type CaravanBookDb,
  type PipelineRunLedgerFactory,
} from '@anytime-markdown/trail-caravan-book';
import {
  CaravanBookService,
  PipelineRunLedger,
  createPipelineRunLedgerFactory,
} from '@anytime-markdown/trail-caravan-book/pipeline';
import { makeChildAnalyzeFn } from '../analyze/childAnalyzeFn';
import { resolveBundledNativeBinding, TrailDatabase } from '@anytime-markdown/trail-db';

import { checkLlmAvailability } from '../lep/LlmAvailability';
import { AnalyzeAllRunner } from '../runner/AnalyzeAllRunner';
import { TrailDataServer } from '../server/TrailDataServer';
import { CodeGraphService } from '../analyze/CodeGraphService';
import { ChatBridge } from '../caravan-chat/chatBridge';
import { RebuildScheduler } from '../caravan-chat/rebuildScheduler';
import { LogService } from '../services/LogService';
import { DaemonScheduler } from '../runtime/DaemonScheduler';
import {
  createKnowledgeGraphLayoutJob,
  type KnowledgeGraphLayoutJobHandle,
} from '../pipeline/knowledgeGraphLayoutJob';
import { createOllamaClient } from '@anytime-markdown/agent-core';
import type { Logger } from '../runtime/Logger';
import {
  resolveGitRootForRepo,
  runAnalyzeCurrentCodePipeline,
  runAnalyzeCommitCodePipeline,
  runAnalyzeReleaseCodePipeline,
  toAnalyzeReleaseScope,
  UnknownRepoError,
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

/** 構造化ロガー (log event ブリッジ)。CaravanBookService / AnalyzeAllRunner の logSink から呼ばれる。 */
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

let caravanBookService: CaravanBookService | null = null;
let analyzeAllRunner: AnalyzeAllRunner | null = null;
/**
 * AnalyzeAllRunner の PR レビュー系（PrReviewImporter / PrReviewFindingAnalyzer /
 * CrossSourceCorrelator の PR 相関）が読む caravan-book.db 接続。PR レビューの永続化先を
 * caravan_reviews へ統合（2026-08-07）した配線で、LogService と同じ openCaravanBookDb 前例。
 * 接続の所有は daemon 側（rebuild ごとに開き直し、disposeAll で閉じる）。
 */
let analyzeCaravanBookDb: CaravanBookDb | null = null;

function closeAnalyzeCaravanBookDb(): void {
  if (analyzeCaravanBookDb) {
    try {
      analyzeCaravanBookDb.close();
    } catch (err) {
      daemonLogger.error(`[daemon] analyze caravan-book.db close error: ${formatError(err)}`);
    }
    analyzeCaravanBookDb = null;
  }
}
/**
 * 直近 configure() で受け取った import パイプライン設定。
 *
 * 拡張は configure() → startHttpServer() の順に呼ぶため、configure() 時点では httpTrailDb が
 * 未構築 (trailDb=undefined で import パイプライン無効)。startHttpServer() が httpTrailDb を
 * 確定した後に本 cfg で runner を再構築し、同一 TrailDatabase インスタンスを共有させる。
 */
let lastAnalyzeAllCfg: SerializableAnalyzeAllConfig | null = null;
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
/** startHttpServer() で構築した知識グラフレイアウト job（scheduler と DB 接続を持つ）。 */
let httpKnowledgeGraphLayout: {
  scheduler: DaemonScheduler;
  job: KnowledgeGraphLayoutJobHandle;
} | null = null;
/** startHttpServer() で構築した ChatBridge。dispose() で SQLite WAL をフラッシュする。 */
let httpChatBridge: ChatBridge | null = null;
/** startHttpServer() で構築した LogService 用 caravan-book.db 接続。 */
let httpLogLedgerDb: CaravanBookDb | null = null;
/** daemon の生存期間を表す wave='system' の run。disposeAll() で閉じる。 */
let httpSystemRunLedger: PipelineRunLedger | null = null;
// daemon_session run の生存証明。これが止まったまま systemTimeoutMinutes を超えると
// pipelineWatchdog が run をゴーストとして回収する（クラッシュ時の 'running' 恒久残留対策）。
// 間隔は trail-caravan-book pipelineWatchdog の systemTimeoutMinutes 既定 30 分と結合しており、
// 「間隔 × 3 <= 閾値」を割ると正常稼働中の daemon が偽 timeout になる。変更時は両方を見る。
let httpSystemRunHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
const SYSTEM_RUN_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
/**
 * Wave 1/2/4 の実行台帳ファクトリ。LogService と同じ caravan-book.db 接続を共有するため
 * startHttpServer() で確定し、その後の rebuildAnalyzeAllRunner() が LepOrchestrator へ注入する。
 */
let httpPipelineRunLedgerFactory: PipelineRunLedgerFactory | null = null;

/** テスト用: 状態リセット。 */
export function _resetForTest(): void {
  caravanBookService = null;
  analyzeAllRunner = null;
  lastAnalyzeAllCfg = null;
  httpServer = null;
  httpCodeGraphService = null;
  httpTrailDb = null;
  httpPort = null;
  httpRebuildSchedulerDisposable = null;
  httpKnowledgeGraphLayout = null;
  httpChatBridge = null;
  httpLogLedgerDb = null;
  httpPipelineRunLedgerFactory = null;
}

/** テスト用: 現在の AnalyzeAllRunner を返す (import パイプライン配線の検証用)。 */
export function _getAnalyzeAllRunnerForTest(): AnalyzeAllRunner | null {
  return analyzeAllRunner;
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
  if (caravanBookService) {
    await caravanBookService.dispose();
    caravanBookService = null;
  }

  // CaravanBookService (cfg.caravanBook が null なら memory pipeline をスキップ)
  if (cfg.caravanBook) {
    caravanBookService = new CaravanBookService({
      logSink: { appendLine: (m: string) => daemonLogger.info(`[mcs] ${m}`) },
      trailDbPath: cfg.caravanBook.trailDbPath,
      dbPath: cfg.caravanBook.dbPath,
      nativeBinding: cfg.caravanBook.nativeBinding,
      gitRoot: cfg.caravanBook.gitRoot,
      docsRoot: cfg.caravanBook.docsRoot,
      backfillDays: cfg.caravanBook.backfillDays,
      workspaceScopeMode: cfg.caravanBook.workspaceScopeMode,
      llm: cfg.caravanBook.llm,
      backupGenerations: cfg.caravanBook.backupGenerations,
      backupIntervalDays: cfg.caravanBook.backupIntervalDays,
    });
  }

  // import パイプライン設定を保持し、現時点で利用可能な trailDb (= 既に startHttpServer 済みなら
  // httpTrailDb) で runner を構築する。通常順 (configure → startHttpServer) では httpTrailDb は
  // まだ null のため trailDb=undefined となり、startHttpServer() 側で trailDb 付きに再構築される。
  lastAnalyzeAllCfg = cfg;
  await rebuildAnalyzeAllRunner(httpTrailDb ?? undefined);
}

/**
 * import パイプラインの `AnalyzeAllRunner` を `lastAnalyzeAllCfg` から (再)構築する。
 *
 * `trailDb` を渡すと Layer 1/2 (取込・primary 解析) が有効化される。`undefined` の場合は
 * trail-caravan-book ステップのみ実行する。startHttpServer() が httpTrailDb を確定した後に本関数を
 * trailDb 付きで呼び直すことで、Data Server と同一 TrailDatabase インスタンスを共有し、
 * 取込結果が即時に Data Server へ反映される (`bb0a0345` で configure から HTTP を切り離した際に
 * 落ちていた trailDb 配線の復旧)。
 */
async function rebuildAnalyzeAllRunner(trailDb: TrailDatabase | undefined): Promise<void> {
  if (analyzeAllRunner) {
    await analyzeAllRunner.dispose();
    analyzeAllRunner = null;
  }
  const cfg = lastAnalyzeAllCfg;
  if (!cfg) return;

  // PR レビュー系 analyzer 用の caravan-book.db 接続（開けない場合は analyzer 側が
  // 「caravanDb connection 無し」の info ログを出して skip する — silent skip にしない）
  closeAnalyzeCaravanBookDb();
  if (cfg.caravanBook) {
    try {
      analyzeCaravanBookDb = await openCaravanBookDb(cfg.caravanBook.dbPath, {
        nativeBinding: cfg.caravanBook.nativeBinding,
      });
    } catch (err) {
      daemonLogger.error(`[daemon] analyze caravan-book.db open failed: ${formatError(err)}`);
    }
  }

  analyzeAllRunner = new AnalyzeAllRunner({
    logSink: { appendLine: (m: string) => daemonLogger.info(`[runner] ${m}`) },
    gitRoot: cfg.gitRoot,
    statePath: cfg.statePath,
    trailDb,
    gitRoots: cfg.gitRoots,
    commitWatchRoots: cfg.commitWatchRoots,
    claudeProjectsDir: cfg.claudeProjectsDir,
    codexSessionsDir: cfg.codexSessionsDir,
    caravanBookService: caravanBookService ?? undefined,
    stage: cfg.stage,
    checkLlmAvailability: cfg.caravanBook
      ? () =>
          checkLlmAvailability({
            baseUrl: cfg.ollamaBaseUrl,
            chatModel: cfg.caravanBook!.llm.chatModel,
            embedModel: cfg.caravanBook!.llm.embedModel,
          })
      : undefined,
    ollamaBaseUrl: cfg.ollamaBaseUrl,
    disabledCaravanAnalyzers: cfg.disabledCaravanAnalyzers,
    disabledAggregators: cfg.disabledAggregators,
    // 拡張は disabledCaravanAnalyzers に「全 disabled id」を渡すため (memory/aggregator/primary
    // を区別せず disabledAnalyzerIds の結果)、Layer 2 toggle 用にも同じ全リストを流用する。
    disabledPrimaryAnalyzers: cfg.disabledCaravanAnalyzers,
    githubPrReview: undefined,
    caravanDbPath: cfg.caravanBook?.dbPath,
    // openCaravanBookDb は conn と db に同一参照を入れる。?? で併記すると「2 つの供給元」に
    // 誤読されるため db（常に存在する側）に一本化する
    caravanDb: analyzeCaravanBookDb ? analyzeCaravanBookDb.db : undefined,
    importAllStatusFilePath: cfg.importAllStatusFilePath,
    pipelineStatusFilePath: cfg.pipelineStatusFilePath,
    // startHttpServer() 後に呼び直される再構築で確定する (LogService と同じ接続)。
    openPipelineRunLedger: httpPipelineRunLedgerFactory ?? undefined,
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
    opts.caravanDbPath,
    {
      configPaths: opts.configPaths,
      defaultRepoName: opts.defaultRepoName,
      traceDir: opts.traceDir,
    },
    childAnalyzeFn,
  );
  server.setCodeGraphService(codeGraphService);

  // ---- 付属オブジェクトの構築と wire ----

  await wireLogService(server, opts);
  wireOptionalDaemonServices(server, opts);
  wireVsCodeBridgeCallbacks(server);
  wireAnalyzeCallbacks(server, opts);

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

  const startedPort = await bindHttpPort(server, opts.preferredPort);

  // 成功 — モジュールスコープに保持し dispose で後始末できるようにする。
  httpServer = server;
  httpCodeGraphService = codeGraphService;
  httpTrailDb = trailDb;
  httpPort = startedPort;

  // import パイプラインの trailDb を確定する。configure() は startHttpServer() より前に
  // 呼ばれ、その時点では httpTrailDb が未構築のため runner は trailDb=undefined で作られている
  // (= 取込スキップ)。ここで同一 TrailDatabase インスタンスを共有させて runner を再構築し、
  // Layer 1/2 (取込・primary 解析) を有効化する。
  if (lastAnalyzeAllCfg) {
    await rebuildAnalyzeAllRunner(httpTrailDb);
    if (analyzeAllRunner) {
      server.setAnalyzeAllRunner(analyzeAllRunner);
    }
  }

  sendEvent('httpReady', { port: startedPort, url: `http://localhost:${startedPort}` });
}

/**
 * LogService と Wave 1/2/4 の実行台帳 (PipelineRunLedger) を wire する。
 * opts.logService 未指定なら何もしない。
 */
async function wireLogService(
  server: TrailDataServer,
  opts: SerializableHttpServerOptions,
): Promise<void> {
  if (opts.logService) {
    const lsCfg = opts.logService;
    if (!opts.caravanDbPath) {
      throw new Error('logService requires caravanDbPath');
    }
    // 実在確認込みで解決する。実在しないパスを渡すと openCaravanBookDb は必ず失敗するため、
    // 見つからないときは undefined を渡して better-sqlite3 の既定解決へ落とす。
    const nativeBinding = lsCfg.nativeBinding ?? resolveBundledNativeBinding(opts.distPath) ?? undefined;
    const logLedgerCoreDb = await openCaravanBookDb(opts.caravanDbPath, { nativeBinding });
    const logLedgerDb = logLedgerCoreDb.conn ?? logLedgerCoreDb.db;
    const systemRunLedger = new PipelineRunLedger({
      db: logLedgerDb,
      scope: 'daemon_session',
      wave: 'system',
      tier: 0,
      logger: daemonLoggerAsLogger,
    });
    const systemRunId = systemRunLedger.start();
    httpSystemRunLedger = systemRunLedger;
    // 生存 heartbeat。shutdown で finish() できずに死んだ場合も watchdog が回収できるようにする。
    httpSystemRunHeartbeatTimer = setInterval(() => {
      try {
        systemRunLedger.heartbeat();
      } catch (err) {
        daemonLogger.error(`[daemon] system run heartbeat error: ${formatError(err)}`);
      }
    }, SYSTEM_RUN_HEARTBEAT_INTERVAL_MS);
    httpSystemRunHeartbeatTimer.unref?.();
    const logService = new LogService(logLedgerDb, systemRunId);
    server.setLogService(logService);
    httpLogLedgerDb = logLedgerCoreDb;
    // Wave 1/2/4 の台帳も同じ接続を使う。CLI 経路 (cli.ts) だけがこれを注入しており、
    // production 経路である daemon では落ちていたため sources / primary / derived の run が
    // 1 行も残っていなかった。
    httpPipelineRunLedgerFactory = createPipelineRunLedgerFactory({
      db: logLedgerDb,
      logger: daemonLoggerAsLogger,
    });
    daemonLogger.info(`[daemon] LogService wired: ${opts.caravanDbPath}`);
  }
}

/** ChatBridge / RebuildScheduler / 知識グラフレイアウト job を、指定があるものだけ wire する。 */
function wireOptionalDaemonServices(
  server: TrailDataServer,
  opts: SerializableHttpServerOptions,
): void {
  // ChatBridge
  if (opts.chatBridge) {
    const cbCfg = opts.chatBridge;
    const chatBridge = new ChatBridge({
      caravanDbPath: cbCfg.caravanDbPath,
      caravanNativeBinding: cbCfg.caravanNativeBinding,
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
      caravanDbPath: rsCfg.caravanDbPath,
      caravanNativeBinding: rsCfg.caravanNativeBinding,
      logger: daemonLoggerAsLogger.child('rebuildScheduler'),
    });
    const intervalMs = rsCfg.intervalMs ?? 60 * 60 * 1000; // default 60 min
    httpRebuildSchedulerDisposable = rebuildScheduler.start(intervalMs);
    daemonLogger.info('[daemon] RebuildScheduler wired');
  }

  // 知識グラフのレイアウト事前計算。DaemonScheduler は job 単位の起動遅延・間隔・多重実行防止を
  // 持つため、RebuildScheduler のような専用クラスを増やさずここへ載せる（RebuildScheduler も
  // 将来この scheduler へ寄せられるが、本変更では触らない）。
  if (opts.knowledgeGraphLayout) {
    const kgCfg = opts.knowledgeGraphLayout;
    const layoutJob = createKnowledgeGraphLayoutJob({
      caravanDbPath: kgCfg.caravanDbPath,
      caravanNativeBinding: kgCfg.caravanNativeBinding,
      intervalMs: kgCfg.intervalMs,
      logger: daemonLoggerAsLogger.child('knowledgeGraphLayout'),
    });
    const scheduler = new DaemonScheduler([layoutJob.job], daemonLoggerAsLogger);
    scheduler.start();
    httpKnowledgeGraphLayout = { scheduler, job: layoutJob };
    daemonLogger.info('[daemon] knowledge graph layout job wired');
  }
}

/**
 * VS Code API 非依存コールバックの wire。
 * onOpenDocLink / onOpenFile は VS Code API を使えないため IPC イベントとして返す。
 * extension (host) 側 (M2 で実装) がこのイベントを受けて VS Code API を呼び出す。
 */
function wireVsCodeBridgeCallbacks(server: TrailDataServer): void {
  server.onOpenDocLink = (docPath: string) => {
    sendEvent('openDocLink', { docPath });
  };
  server.onOpenFile = (filePath: string, line?: number) => {
    sendEvent('openFile', line === undefined ? { filePath } : { filePath, line });
  };
  server.onAddNotePage = (payload) => {
    sendEvent('addNotePage', payload);
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
}

/** analyze 系ハンドラの前提。HTTP サーバの状態が揃っていなければ throw する。 */
function requireHttpAnalyzeState(): { trailDb: TrailDatabase; codeGraphService: CodeGraphService } {
  if (httpTrailDb === null || httpCodeGraphService === null) {
    throw new Error('http server state not ready');
  }
  return { trailDb: httpTrailDb, codeGraphService: httpCodeGraphService };
}

/** startHttpServer に gitRoot が渡されていることを要求する。 */
function requireStartHttpServerGitRoot(opts: SerializableHttpServerOptions): string {
  if (!opts.gitRoot) {
    throw new Error('gitRoot not configured; pass gitRoot to startHttpServer first');
  }
  return opts.gitRoot;
}

/**
 * analyze コールバックの wire。
 * onAnalyzeCurrentCode / onAnalyzeReleaseCode は daemon 内部の pipeline 関数で処理する。
 * onAnalyzeAll は daemon 内部の AnalyzeAllRunner 経由。
 */
function wireAnalyzeCallbacks(
  server: TrailDataServer,
  opts: SerializableHttpServerOptions,
): void {
  // HTTP request shape (webview → TrailDataServer): workspacePath / tsconfigPath のみ。
  // IPC dispatch 'analyzeCurrentCode' arm は SerializableAnalyzeCurrentCodeRequest を受け
  // analysisRoot / excludeRoot / analyzeChildPath まで渡す。意図的に異なるシグネチャ。
  server.onAnalyzeCurrentCode = async (req) => {
    const state = requireHttpAnalyzeState();
    // gitRoot は startHttpServer の opts から取得 (lastCfg 非依存)。opts.gitRoot は optional のため
    // workspacePath も未指定なら解決不能としてエラーにする。
    const analysisRoot = req.workspacePath ?? opts.gitRoot;
    if (!analysisRoot) {
      throw new Error('analysisRoot not resolvable: pass workspacePath or startHttpServer gitRoot');
    }
    const opts2: AnalyzeCurrentOpts = {
      analysisRoot,
      tsconfigPath: req.tsconfigPath,
      // daemon はバンドル出力 (trail-daemon.js) で動くため常に解析子プロセスへ隔離する。
      // HTTP request shape には analyzeChildPath が無く、module const の dist/analyze-child.js を使う。
      compute: { kind: 'child', analyzeChildPath },
      trailDb: state.trailDb,
      codeGraphService: state.codeGraphService,
      callbacks: server,
      logger: daemonLoggerAsLogger,
      onProgress: emitAnalyzeCurrentProgress,
    };
    return runAnalyzeCurrentCodePipeline(opts2);
  };

  // HTTP request shape (webview → TrailDataServer): tags のみ (gitRoot は opts から取得)。
  // IPC dispatch 'analyzeReleaseCode' arm は SerializableAnalyzeReleaseCodeRequest で gitRoot を受ける。
  server.onAnalyzeReleaseCode = async (req) => {
    const state = requireHttpAnalyzeState();
    const opts3: AnalyzeReleaseOpts = {
      trailDb: state.trailDb,
      codeGraphService: state.codeGraphService,
      gitRoot: requireStartHttpServerGitRoot(opts),
      // daemon はバンドル環境なので TS 解析は必ず子プロセスへ隔離する。
      compute: { kind: 'child', analyzeChildPath },
      scope: toAnalyzeReleaseScope(req.tags),
      logger: daemonLoggerAsLogger,
      onProgress: emitAnalyzeReleaseProgress,
    };
    return runAnalyzeReleaseCodePipeline(opts3);
  };

  // Snapshot per Commit: 1 コミット分のみ生成する。release と違い全量ループは持たない。
  server.onAnalyzeCommitCode = async (req) => {
    const state = requireHttpAnalyzeState();
    const primaryGitRoot = requireStartHttpServerGitRoot(opts);
    // 保存先は req.repo が決めるので、解析対象の git root も req.repo から引く。
    // primary をそのまま渡すと、別リポジトリ名で primary の断面を保存し得る。
    const gitRoot = resolveGitRootForRepo([primaryGitRoot], req.repo);
    if (!gitRoot) throw new UnknownRepoError(req.repo);
    return runAnalyzeCommitCodePipeline({
      trailDb: state.trailDb,
      codeGraphService: state.codeGraphService,
      gitRoot,
      sha: req.sha,
      repoName: req.repo,
      // daemon はバンドル環境なので TS 解析は必ず子プロセスへ隔離する。
      compute: { kind: 'child', analyzeChildPath },
      logger: daemonLoggerAsLogger,
      onProgress: emitAnalyzeReleaseProgress,
    });
  };

  server.onAnalyzeAll = async () => {
    if (!analyzeAllRunner) {
      throw new Error('AnalyzeAllRunner not configured; call configure() first');
    }
    const startedAt = Date.now();
    await analyzeAllRunner.runOnce('import');
    const result = analyzeAllRunner.getLastImportResult();
    if (!result) {
      throw new Error('importAll did not produce a result');
    }
    return { ...result, durationMs: Date.now() - startedAt };
  };
}

/**
 * ポートを試みる: preferredPort → preferred+1..+9 → 0 (OS 任意)。
 * 'already in use' 以外の失敗は即 throw し、全候補が塞がっていれば最後のエラーを throw する。
 */
async function bindHttpPort(
  server: TrailDataServer,
  preferredPort: number | undefined,
): Promise<number> {
  const preferred = preferredPort ?? 19841;
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
  return startedPort;
}

/**
 * 非同期の後始末を実行する。失敗はログのみ残して次へ進む (1 件の失敗で以降の解放を止めない)。
 * 呼び出し側で await しないと try/catch が reject を捕捉できない (S4822) ため必ず await する。
 */
async function disposeQuietly(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    daemonLogger.error(`[daemon] ${label} error: ${formatError(err)}`);
  }
}

/** 同期の後始末。失敗はログのみ残して次へ進む。 */
function disposeQuietlySync(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    daemonLogger.error(`[daemon] ${label} error: ${formatError(err)}`);
  }
}

async function disposeAll(): Promise<void> {
  if (analyzeAllRunner) {
    await analyzeAllRunner.dispose();
    analyzeAllRunner = null;
  }
  closeAnalyzeCaravanBookDb();
  lastAnalyzeAllCfg = null;
  if (caravanBookService) {
    await caravanBookService.dispose();
    caravanBookService = null;
  }
  if (httpRebuildSchedulerDisposable) {
    httpRebuildSchedulerDisposable.dispose();
    httpRebuildSchedulerDisposable = null;
  }
  if (httpKnowledgeGraphLayout) {
    // scheduler を先に止めてから接続を閉じる（逆順だと実行中の run が閉じた接続を触る）。
    const layout = httpKnowledgeGraphLayout;
    await disposeQuietly('knowledge graph layout scheduler stop', () => layout.scheduler.stop());
    layout.job.dispose();
    httpKnowledgeGraphLayout = null;
  }
  if (httpChatBridge) {
    const chatBridge = httpChatBridge;
    await disposeQuietly('ChatBridge dispose', () => chatBridge.dispose());
    httpChatBridge = null;
  }
  if (httpServer) {
    const server = httpServer;
    await disposeQuietly('HTTP server stop', () => server.stop());
    httpServer = null;
  }
  if (httpSystemRunHeartbeatTimer) {
    clearInterval(httpSystemRunHeartbeatTimer);
    httpSystemRunHeartbeatTimer = null;
  }
  if (httpSystemRunLedger) {
    // system run を正常終了として閉じる。閉じずに死んだ場合は heartbeat の停止を
    // pipelineWatchdog (systemTimeoutMinutes) が検知して回収する。
    const systemRunLedger = httpSystemRunLedger;
    disposeQuietlySync('system run finish', () => systemRunLedger.finish('success'));
    httpSystemRunLedger = null;
  }
  if (httpLogLedgerDb) {
    const logLedgerDb = httpLogLedgerDb;
    disposeQuietlySync('log ledger db close', () => logLedgerDb.close());
    httpLogLedgerDb = null;
  }
  // ファクトリは上の接続をクロージャで掴んでいるため、接続と同時に手放す。残すと次の
  // startHttpServer() が閉じた接続の台帳を注入し、runLedgerEnabled が true を返したまま
  // 記録は 1 行も残らない（配線漏れを観測するための getter が嘘をつく）。
  httpPipelineRunLedgerFactory = null;
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
        // 呼び出し元 (extension) が渡した dist パスを優先し、無ければ daemon 自身の dist を使う。
        compute: { kind: 'child', analyzeChildPath: req.analyzeChildPath ?? analyzeChildPath },
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
        // daemon はバンドル環境なので TS 解析は必ず子プロセスへ隔離する。
        // request shape に analyzeChildPath は無く、module const の dist/analyze-child.js を使う。
        compute: { kind: 'child', analyzeChildPath },
        scope: toAnalyzeReleaseScope(req.tags),
        logger: daemonLoggerAsLogger,
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
