import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { type AcceptanceDecidedBy, type AcceptanceRoute, type AcceptanceVerdict, computeBusFactor, computeFlightOutcome, type CurrentCoverageRow, detectUserFeedback, extractLessonCandidates, extractSelfAssessment, type FlightOutcome, type FlightReviewManualPatch, type RationaleAuditStatus, type ReleaseCoverageRow, type TrailGraph } from '@anytime-markdown/trail-core';
import type { C4Model, C4ModelPayload, DsmMatrix, FeatureMatrix,MessageInput } from '@anytime-markdown/trail-core/c4';
import {
  aggregateCoverageFromDb,
  aggregateHeatmapColumnsToC4,
  buildC4ElementById,
  buildElementTree,
  buildSourceMatrix,
  computeActivityHeatmap,
  computeActivityTrend,
  computeComplexityMatrix,
  computeFileHotspot,
  fetchC4Model,
  fetchC4ModelEntries,
  filterTreeByLevel,
  mapFileToC4Elements,
} from '@anytime-markdown/trail-core/c4';
import type {
  CallHierarchyDirection,
  CallHierarchyIndex,
  CallHierarchyScope,
} from '@anytime-markdown/trail-core/c4/callHierarchy';
import {
  buildCallHierarchyNodeFilter,
  buildIndex as buildCallHierarchyIndex,
  traverse as traverseCallHierarchy,
} from '@anytime-markdown/trail-core/c4/callHierarchy';
import { computeAuthorHeatmap, selectTopSessions } from '@anytime-markdown/trail-core/authorHeatmap';
import type { ClassifiedFunction } from '@anytime-markdown/trail-core/centrality';
import { toCodeGraphNodeId } from '@anytime-markdown/trail-core/codeGraphNodeId';
import { aggregateCentralityToC4, aggregateRolesToC4 } from '@anytime-markdown/trail-core/centrality';
import {
  loadCommitCategories,
  loadCommitCategoriesFromFile,
  loadCommitCategoryLabels,
  loadCommitCategoryLabelsFromFile,
} from '@anytime-markdown/trail-core/commitCategories';
import { aggregateScoresToC4 } from '@anytime-markdown/trail-core/deadCode';
import { computeDeploymentFrequency, computeQualityMetrics, computeReleaseQualityTimeSeries } from '@anytime-markdown/trail-core/domain/metrics';
import {
  loadSkillCategories,
  loadSkillCategoriesFromFile,
  loadSkillCategoryLabels,
  loadSkillCategoryLabelsFromFile,
} from '@anytime-markdown/trail-core/skillCategories';
import {
  loadToolCategories,
  loadToolCategoriesFromFile,
  loadToolCategoryLabels,
  loadToolCategoryLabelsFromFile,
} from '@anytime-markdown/trail-core/toolCategories';
// typescript を引く `analyze` は DI（analyzeReleaseFn）に置換済みのため import しない。
import type { AnalyzeFunction } from '@anytime-markdown/trail-db';
import type { AnalyticsData, CostOptimizationData,MessageRow, SessionCommitRow, SessionRow, TrailDatabase } from '@anytime-markdown/trail-db';
import { MetricsThresholdsLoader } from '@anytime-markdown/trail-db';
import { type WebSocket,WebSocketServer } from 'ws';

import type { C4SourceFileInput } from '../analyze/analyzeChildProtocol';
import type {
  AnalyzeCommitResult,
  AnalyzeCurrentResult,
  AnalyzeReleaseResult,
} from '../analyze/AnalyzePipeline';
import { UnknownRepoError } from '../analyze/AnalyzePipeline';
import type { CodeGraphService } from '../analyze/CodeGraphService';
import { runC4SourceAnalyze } from '../analyze/runC4SourceAnalyze';
import type { AnalyzeAllRunner } from '../runner/AnalyzeAllRunner';
import type { Logger, LogLevel } from '../runtime/Logger';
import type { LogService } from '../services/LogService';
import { combineLoggers,LogSink } from '../services/LogSink';
import { AlignmentApiHandler } from './AlignmentApiHandler';
import { EmergencyApiHandler } from './EmergencyApiHandler';
import { C4ManualApiHandler } from './C4ManualApiHandler';
import { CodeGraphApiHandler } from './CodeGraphApiHandler';
import { DocsApiHandler } from './DocsApiHandler';
import { sendServerError } from './errorResponse';
import { handlePostLogs } from './logsApi';
import { MemoryApiHandler } from './MemoryApiHandler';
import { PromptsApiHandler } from './PromptsApiHandler';
import { ANY_METHOD, createRouteContext, type RouteDescriptor, RouteTable } from './routing';
import type { ClientMessage, ServerMessage } from './types';
import { readWorkspaceTickets } from './workspaceTickets';

const LOG_CLEANUP_INTERVAL_MS = 24 * 3600 * 1000;

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const BIND_HOST = '127.0.0.1';
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX = 60;

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * URL.pathname does not percent-decode, so any `:id` carved out of the path
 * must be decoded before reaching the DB layer — IDs like
 * `drift:entity:pkg:foo:spec_vs_code` always contain `:` (encoded as `%3A`)
 * and may contain `/` (`%2F`), which otherwise won't match the stored value.
 */
export function decodePathParam(pathname: string, prefix: string, suffix = ''): string {
  let raw = pathname.slice(prefix.length);
  if (suffix && raw.endsWith(suffix)) raw = raw.slice(0, -suffix.length);
  return decodeURIComponent(raw);
}

/** @deprecated AnalyzeCurrentResult を直接使う */
export type AnalyzePipelineResult = AnalyzeCurrentResult;

/** @deprecated AnalyzeReleaseResult を直接使う */
export type AnalyzeReleasePipelineResult = AnalyzeReleaseResult;

export interface AnalyzeAllPipelineResult {
  imported: number;
  skipped: number;
  commitsResolved: number;
  releasesResolved: number;
  releasesAnalyzed: number;
  coverageImported: number;
  currentCoverageImported: number;
  messageCommitsBackfilled: number;
  durationMs: number;
}

const HOTSPOT_PERIODS = ['7d', '30d', '90d', 'all'] as const;
type HotspotPeriod = typeof HOTSPOT_PERIODS[number];
const HOTSPOT_GRANULARITIES = ['commit', 'session'] as const;
type HotspotGranularity = typeof HOTSPOT_GRANULARITIES[number];
const ACTIVITY_TREND_GRANULARITIES = ['commit', 'session', 'subagent', 'defect'] as const;
type ActivityTrendGranularity = typeof ACTIVITY_TREND_GRANULARITIES[number];
const ACTIVITY_TREND_SESSION_MODES = ['read', 'write'] as const;
type ActivityTrendSessionMode = typeof ACTIVITY_TREND_SESSION_MODES[number];
const ELEMENT_ID_RE = /^(sys|pkg|comp|code|file)[_:][\w/.:-]+$/;
const ALL_PERIOD_FROM = '1970-01-01T00:00:00.000Z';
const MS_PER_DAY = 86_400_000;

function parseHotspotPeriod(raw: string | null): HotspotPeriod | null {
  if (raw === null) return '30d';
  return (HOTSPOT_PERIODS as readonly string[]).includes(raw) ? (raw as HotspotPeriod) : null;
}

function parseHotspotGranularity(raw: string | null): HotspotGranularity | null {
  if (raw === null) return 'commit';
  return (HOTSPOT_GRANULARITIES as readonly string[]).includes(raw) ? (raw as HotspotGranularity) : null;
}

function parseActivityTrendGranularity(raw: string | null): ActivityTrendGranularity | null {
  if (raw === null) return 'commit';
  return (ACTIVITY_TREND_GRANULARITIES as readonly string[]).includes(raw)
    ? (raw as ActivityTrendGranularity)
    : null;
}

function parseActivityTrendSessionMode(raw: string | null): ActivityTrendSessionMode | null {
  if (raw === null) return 'write';
  return (ACTIVITY_TREND_SESSION_MODES as readonly string[]).includes(raw)
    ? (raw as ActivityTrendSessionMode)
    : null;
}

function computePeriodRangeUtc(period: HotspotPeriod): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  if (period === 'all') return { from: ALL_PERIOD_FROM, to };
  const days30or90 = period === '30d' ? 30 : 90;
  const days = period === '7d' ? 7 : days30or90;
  const from = new Date(now.getTime() - days * MS_PER_DAY).toISOString();
  return { from, to };
}

function collectFilePathsForElement(elementId: string, c4Model: C4Model): string[] {
  const FILE_PREFIX = 'file::';
  const elementById = new Map(c4Model.elements.map((el) => [el.id, el] as const));
  const target = elementById.get(elementId);
  const result = new Set<string>();
  if (target?.type === 'code' && target.id.startsWith(FILE_PREFIX)) {
    result.add(target.id.slice(FILE_PREFIX.length));
    return Array.from(result);
  }
  type C4ElementType = (typeof c4Model.elements)[number];
  const childrenByBoundary = new Map<string, C4ElementType[]>();
  for (const el of c4Model.elements) {
    if (el.boundaryId == null) continue;
    const arr = childrenByBoundary.get(el.boundaryId);
    if (arr) arr.push(el);
    else childrenByBoundary.set(el.boundaryId, [el]);
  }
  const visited = new Set<string>();
  const stack: string[] = [elementId];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined || visited.has(cur)) continue;
    visited.add(cur);
    const children = childrenByBoundary.get(cur);
    if (!children) continue;
    for (const el of children) {
      if (el.type === 'code' && el.id.startsWith(FILE_PREFIX)) {
        result.add(el.id.slice(FILE_PREFIX.length));
      }
      stack.push(el.id);
    }
  }
  return Array.from(result);
}

function clampFloat(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value === '') return fallback;
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// ---------------------------------------------------------------------------
//  DSM level mapping
// ---------------------------------------------------------------------------

const DSM_LEVEL_MAP: Record<string, number> = {
  package: 2,
  component: 3,
};

// ---------------------------------------------------------------------------
//  Provider interface — decouples from C4Panel
// ---------------------------------------------------------------------------

export interface C4DataProvider {
  readonly featureMatrix: FeatureMatrix | undefined;
  readonly sourceMatrix: DsmMatrix | undefined;
  readonly currentDsmLevel: 'component' | 'package';
  readonly trailGraph: TrailGraph | undefined;
  readonly projectRoot: string | undefined;
  handleSetDsmLevel(level: 'component' | 'package'): void;
  handleCluster(enabled: boolean): void;
  handleRefresh(): void;
  handleResetClaudeActivity(): void;
  getManualElements(repoName: string): readonly import('@anytime-markdown/trail-core').ManualElement[];
  getManualRelationships(repoName: string): readonly import('@anytime-markdown/trail-core').ManualRelationship[];
}

// ---------------------------------------------------------------------------
//  TrailDataServer
// ---------------------------------------------------------------------------

export class TrailDataServer {
  private httpServer: http.Server | undefined;
  private wsServer: WebSocketServer | undefined;
  private readonly clients = new Set<WebSocket>();
  private rateLimitCount = 0;
  private rateLimitReset = 0;
  private cachedHtml: string | undefined;
  private getC4Provider: (() => C4DataProvider | undefined) | undefined;
  private lastClaudeActivity: { activeElementIds: readonly string[]; touchedElementIds: readonly string[]; plannedElementIds: readonly string[] } | undefined;
  private lastMultiAgentActivity: { agents: readonly import('./types').AgentActivityEntry[]; conflicts: readonly import('./types').FileConflict[] } | undefined;
  /** /api/c4/call-hierarchy 用の隣接リストキャッシュ。current_graphs ロード後に lazy 構築し、graph 更新時に invalidate */
  private callHierarchyIndex: CallHierarchyIndex | null = null;
  private callHierarchyIndexRepo: string | undefined;
  onOpenDocLink: ((docPath: string) => void) | undefined;
  onOpenFile: ((filePath: string, line?: number) => void) | undefined;
  onAddNotePage: ((payload: { title: string; contextMarkdown: string; imageDataUrl?: string }) => void) | undefined;
  onTokenBudgetExceeded: ((status: import('./types').TokenBudgetUpdatedMessage) => void) | undefined;

  /** POST /api/analyze/current ハンドラ。extension.ts で登録される */
  onAnalyzeCurrentCode:
    | ((req: { workspacePath?: string; tsconfigPath?: string }) => Promise<AnalyzeCurrentResult>)
    | undefined;
  /**
   * POST /api/analyze/release ハンドラ。
   * `tags` 省略時は全量洗い替え、指定時はそのタグのみ削除・再生成する。
   */
  onAnalyzeReleaseCode:
    | ((req: { tags?: readonly string[] }) => Promise<AnalyzeReleaseResult>)
    | undefined;
  /**
   * POST /api/analyze/commit ハンドラ。1 コミット分のスナップショットだけを生成する。
   * `sha` / `repo` はいずれも必須で、省略可能にしない（渡し忘れが別リポジトリへの
   * 書き込みや「現在の断面を過去として保存」に化ける）。
   */
  onAnalyzeCommitCode:
    | ((req: { sha: string; repo: string }) => Promise<AnalyzeCommitResult>)
    | undefined;
  /** POST /api/analyze/all ハンドラ */
  onAnalyzeAll:
    | (() => Promise<AnalyzeAllPipelineResult>)
    | undefined;

  /** 現在進行中の解析タスク種別。並行実行時の 409 判定に使う */
  private analysisInProgress: { kind: 'current' | 'release' | 'commit' | 'all'; startedAt: number } | null = null;
  private tokenBudgetConfig: { dailyLimitTokens: number | null; sessionLimitTokens: number | null; alertThresholdPct: number } = {
    dailyLimitTokens: null,
    sessionLimitTokens: null,
    alertThresholdPct: 80,
  };

  private codeGraphService: CodeGraphService | undefined;
  private analyzeAllRunner: AnalyzeAllRunner | undefined;
  private readonly memoryApi: MemoryApiHandler;
  private chatBridge: import('../memory-chat/chatBridge').ChatBridge | undefined;
  private logService: LogService | undefined;
  private logCleanupTimer: NodeJS.Timeout | null = null;
  private dailyTokensCache: { value: number; expiresAt: number } | null = null;
  private readonly promptsApi: PromptsApiHandler;
  private readonly c4ManualApi: C4ManualApiHandler;
  private readonly codeGraphApi: CodeGraphApiHandler;
  private readonly docsApi: DocsApiHandler;
  private readonly alignmentApi: AlignmentApiHandler;
  private readonly emergencyApi: EmergencyApiHandler;

  constructor(
    private readonly distPath: string,
    private readonly trailDb: TrailDatabase,
    private logger: Logger,
    private readonly gitRoot?: string,
    memoryDbPath?: string,
    /**
     * extension が lep.json / ワークスペースルートから解決して注入する表示用パス群。
     * daemon は fork 時 cwd 未指定でワークスペースを確実に知らないため、これらを明示注入して
     * categories / metrics / trace / デフォルト repo 名を gitRoot 非依存にする。未指定キーは
     * 従来どおり `<gitRoot>/.anytime/<file>` 等にフォールバックする (後方互換)。
     */
    private readonly options?: {
      /** lep.json `workspace.configPaths` から解決した categories / metrics の絶対ファイルパス。 */
      configPaths?: {
        commitCategories?: string;
        toolCategories?: string;
        skillCategories?: string;
        metricsThresholds?: string;
      };
      /** 表示エンドポイントが `?repo=` 未指定時に使うデフォルト repo 名 (`basename(wsRootForDb)`)。 */
      defaultRepoName?: string;
      /** trace 一覧/取得が読む trace ディレクトリの絶対パス (`<trailHome>/trace`)。 */
      traceDir?: string;
    },
    // HTTP refresh での release 解析関数。daemon が analyze-child へ fork する
    // 実装を注入する (typescript を TrailDataServer 経由で静的 import しないため)。
    // 未指定時は handleRefresh で release 解析をスキップする。
    private readonly analyzeReleaseFn?: AnalyzeFunction,
  ) {
    // webpack-bundled VS Code 拡張では bindings package が call stack から
    // `.node` を推測できず crash するため、distPath から絶対パスを組み立てて
    // BetterSqlite3MemoryDb に渡す (memory-core / TrailDatabase と同パターン)。
    const nativeBinding = path.join(
      this.distPath,
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    );
    // バンドル済み .node が distPath 配下に無い環境（テスト・ソース実行）では
    // better-sqlite3 の既定解決へフォールバックする（実在しないパスを渡すと open が常に失敗する）。
    this.memoryApi = new MemoryApiHandler(
      this.logger.child('MemoryApiHandler'),
      // 未指定は「未設定」として明示的に伝える。ハンドラ側で cwd 基準の暗黙解決を
      // させない（解決の責務は注入元にある）。
      memoryDbPath ?? null,
      fs.existsSync(nativeBinding) ? nativeBinding : undefined,
    );
    this.promptsApi = new PromptsApiHandler(this.logger.child('PromptsApiHandler'));
    this.c4ManualApi = new C4ManualApiHandler(
      this.trailDb,
      {
        notifyModelUpdated: () => this.notify('model-updated'),
        notifyCodeGraphUpdated: () => this.notifyCodeGraphUpdated(),
        refreshCodeGraphCache: (repoName?: string) => this.refreshCodeGraphCache(repoName),
      },
      this.logger.child('C4ManualApiHandler'),
    );
    this.codeGraphApi = new CodeGraphApiHandler(this.trailDb, this.logger.child('CodeGraphApiHandler'));
    this.alignmentApi = new AlignmentApiHandler(
      this.trailDb,
      this.logger.child('AlignmentApiHandler'),
      { gitRepoRoot: this.gitRoot },
    );
    this.emergencyApi = new EmergencyApiHandler(
      this.trailDb,
      this.logger.child('EmergencyApiHandler'),
      { gitRepoRoot: this.gitRoot },
    );
    this.docsApi = new DocsApiHandler(
      {
        broadcastDocLinks: (docLinks) => {
          if (this.clients.size === 0) return;
          const payload = JSON.stringify({ type: 'doc-links-updated', docLinks });
          for (const ws of this.clients) ws.send(payload);
        },
      },
      {
        getC4Store: () => this.trailDb.asC4ModelStore(),
        getFeatureMatrix: () => this.getC4Provider?.()?.featureMatrix,
      },
      this.logger.child('DocsApiHandler'),
    );
  }

  /**
   * 表示エンドポイントのデフォルト repo 名。注入された defaultRepoName を優先し、
   * 未指定時のみ `basename(gitRoot)` にフォールバックする (後方互換)。
   */
  private defaultRepo(): string | undefined {
    if (this.options?.defaultRepoName) return this.options.defaultRepoName;
    return this.gitRoot ? path.basename(this.gitRoot) : undefined;
  }

  /**
   * `/api/config/*-categories` の共通レスポンス。configPaths でファイルが指定されていれば
   * そこから、なければ `<gitRoot>/.anytime/<file>` から entries / labels を読んで返す。
   */
  private respondCategories(
    res: http.ServerResponse,
    file: string | undefined,
    loadEntries: (root: string) => ReadonlyMap<string, number>,
    loadEntriesFromFile: (file: string) => ReadonlyMap<string, number>,
    loadLabels: (root: string) => ReadonlyMap<number, string>,
    loadLabelsFromFile: (file: string) => ReadonlyMap<number, string>,
  ): void {
    const root = this.gitRoot ?? process.cwd();
    const entries: Record<string, number> = {};
    for (const [k, v] of file ? loadEntriesFromFile(file) : loadEntries(root)) entries[k] = v;
    const categories: Record<string, string> = {};
    for (const [k, v] of file ? loadLabelsFromFile(file) : loadLabels(root)) categories[String(k)] = v;
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ entries, categories }));
  }

  setCodeGraphService(service: CodeGraphService): void {
    this.codeGraphService = service;
    this.codeGraphApi.setCodeGraphService(service);
  }

  setChatBridge(bridge: import('../memory-chat/chatBridge').ChatBridge): void {
    this.chatBridge = bridge;
  }

  /**
   * analyzeAll runner を wire する。設定後は
   * `/api/analyze-all/{pause,resume,status}` HTTP API が有効化される。
   * runner が未 set のうちは各 endpoint は 503 を返す。
   */
  setAnalyzeAllRunner(runner: AnalyzeAllRunner): void {
    this.analyzeAllRunner = runner;
  }

  /**
   * pipeline_run_logs 永続化用の LogService を wire する。設定後は
   * `POST /api/logs` が有効化され、内部 logger が
   * composite (OutputChannel + pipeline_run_logs) に置き換わる。未設定のうちは 503 を返す。
   *
   * `TRAIL_LOGS_MIN_LEVEL` 環境変数で LogSink の閾値を制御できる ('info'/'warn'/'error'/'debug')。
   */
  setLogService(service: LogService): void {
    this.logService = service;
    const envMin = process.env.TRAIL_LOGS_MIN_LEVEL;
    const minLevel: LogLevel = (envMin === 'info' || envMin === 'warn' || envMin === 'error')
      ? envMin
      : 'debug';
    this.logger = combineLoggers(
      this.logger,
      new LogSink({ service, scope: 'TrailDataServer', minLevel }),
    );
  }

  // -------------------------------------------------------------------------
  //  Public API
  // -------------------------------------------------------------------------

  get isRunning(): boolean {
    return this.httpServer?.listening === true;
  }

  get port(): number {
    const addr = this.httpServer?.address();
    if (addr && typeof addr === 'object') {
      return addr.port;
    }
    return 0;
  }

  async start(port: number): Promise<void> {
    const server = http.createServer((req, res) => {
      this.handleHttp(req, res);
    });
    this.httpServer = server;

    const wss = new WebSocketServer({ server });
    this.wsServer = wss;

    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const origin = req.headers.origin ?? '';
      if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        ws.close(4003, 'Forbidden origin');
        return;
      }

      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('message', (data: unknown) => this.handleWsMessage(data, ws));
      this.sendC4CurrentState(ws);
      void this.chatBridge?.sendStatus(ws);
    });

    return new Promise<void>((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(err);
        }
      });
      server.listen(port, BIND_HOST, () => {
        this.startLogCleanupTimer();
        resolve();
      });
    });
  }

  /**
   * live ログの刈り込みタイマー。刈るのは system run（daemon / 拡張の垂れ流し）に
   * 限られ、analyzer の run に紐づく調査用ログは対象外（LogService.cleanup 参照）。
   */
  private startLogCleanupTimer(): void {
    if (this.logCleanupTimer) return;
    // 起動直後 1 回 + 24h 周期で cleanup
    this.runLogCleanup();
    this.logCleanupTimer = setInterval(() => this.runLogCleanup(), LOG_CLEANUP_INTERVAL_MS);
  }

  private runLogCleanup(): void {
    if (!this.logService) return;
    try {
      this.logService.cleanup();
    } catch (err) {
      this.logger.error('log cleanup failed', err);
    }
  }

  async stop(): Promise<void> {
    if (this.logCleanupTimer) {
      clearInterval(this.logCleanupTimer);
      this.logCleanupTimer = null;
    }
    this.memoryApi.dispose();
    for (const ws of this.clients) {
      ws.close();
    }
    this.clients.clear();

    this.wsServer?.close();
    this.wsServer = undefined;

    return new Promise<void>((resolve, reject) => {
      if (!this.httpServer) {
        resolve();
        return;
      }
      this.httpServer.close((err) => {
        this.httpServer = undefined;
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /** Broadcast sessions-updated to all connected WebSocket clients. */
  notifySessionsUpdated(): void {
    if (this.clients.size === 0) return;
    const payload = JSON.stringify({ type: 'sessions-updated' });
    for (const ws of this.clients) {
      ws.send(payload);
    }
  }

  setTokenBudgetConfig(config: { dailyLimitTokens: number | null; sessionLimitTokens: number | null; alertThresholdPct: number }): void {
    this.tokenBudgetConfig = config;
  }

  setC4Provider(getProvider: () => C4DataProvider | undefined): void {
    this.getC4Provider = getProvider;
  }

  get clientCount(): number { return this.clients.size; }

  notify(type: 'dsm-updated' | 'model-updated'): void {
    if (this.clients.size === 0) return;

    if (type === 'model-updated') {
      const payload = JSON.stringify({ type: 'model-updated' });
      for (const ws of this.clients) {
        ws.send(payload);
      }
      return;
    }

    const provider = this.getC4Provider?.();
    if (!provider) return;

    const message = this.buildNotifyMessage(type, provider);
    if (!message) return;

    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      ws.send(payload);
    }
  }

  notifyProgress(phase: string, percent: number): void {
    if (this.clients.size === 0) return;
    const message: ServerMessage = { type: 'analysis-progress', phase, percent };
    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      ws.send(payload);
    }
  }

  setDocsPath(docsPath: string | undefined): void {
    this.docsApi.setDocsPath(docsPath);
  }

  async scanDocLinks(): Promise<void> {
    await this.docsApi.scan();
  }

  // -------------------------------------------------------------------------
  //  HTTP handler
  // -------------------------------------------------------------------------

  /**
   * ルートテーブル。初回リクエスト時に遅延生成する（コンストラクタのフィールド初期化順に
   * 依存させないため）。
   */
  private routeTable?: RouteTable;

  private getRoutes(): RouteTable {
    if (this.routeTable) return this.routeTable;
    const table = new RouteTable();
    this.registerStaticRoutes(table);
    this.registerTrailRoutes(table);
    this.registerAnalyzeRoutes(table);
    this.registerRecordRoutes(table);
    this.registerEmergencyRoutes(table);
    this.registerOpsRoutes(table);
    this.registerC4ModelRoutes(table);
    this.registerC4AnalysisRoutes(table);
    this.registerC4ManualRoutes(table);
    this.registerCodeGraphRoutes(table);
    this.registerInsightRoutes(table);
    this.registerMemoryDriftRoutes(table);
    this.registerMemoryInsightRoutes(table);
    this.routeTable = table;
    return table;
  }

  /** @internal 登録済みルートの台帳。ゴールデンマスターテストの検査対象。 */
  listRoutes(): readonly RouteDescriptor[] {
    return this.getRoutes().list();
  }

  /** レートリミット。上限超過時に 429 を返して false を返す。 */
  private allowRequest(res: http.ServerResponse): boolean {
    const now = Date.now();
    if (now > this.rateLimitReset) {
      this.rateLimitCount = 0;
      this.rateLimitReset = now + RATE_LIMIT_WINDOW_MS;
    }
    this.rateLimitCount++;
    if (this.rateLimitCount > RATE_LIMIT_MAX) {
      res.writeHead(429, { 'Retry-After': '1' });
      res.end('Too Many Requests');
      return false;
    }
    return true;
  }

  /** CORS: localhost のみ許可する。 */
  private applyCors(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');
  }

  private handleHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    if (!this.allowRequest(res)) return;
    this.applyCors(req, res);

    const url = new URL(req.url ?? '', `http://${BIND_HOST}`);
    const method = req.method ?? 'GET';

    const matched = this.getRoutes().match(method, url.pathname);
    if (!matched) {
      res.writeHead(404);
      res.end();
      return;
    }

    matched.handler(createRouteContext({ req, res, url, method, params: matched.params }));
  }

  // -------------------------------------------------------------------------
  //  Route registration
  //
  //  ルートは判定種別ごとに 3 レイヤー（完全一致 / パターン / 前方一致）へ登録する。
  //  評価順序と衝突しない前提は routing.ts のクラスコメントを参照。
  // -------------------------------------------------------------------------

  /** 静的配信。現行の分岐がメソッドを見ていないため ANY_METHOD で登録する。 */
  private registerStaticRoutes(t: RouteTable): void {
    t.exact(ANY_METHOD, '/', ({ res }) => this.serveStandaloneHtml(res));
    t.exact(ANY_METHOD, '/trailstandalone.js', ({ res }) => this.serveStaticFile(res, 'trailstandalone.js'));
    t.exact(ANY_METHOD, '/trailstandalone.js.map', ({ res }) => this.serveStaticFile(res, 'trailstandalone.js.map'));
  }

  private registerTrailRoutes(t: RouteTable): void {
    t.exact('GET', '/api/trail/sessions', ({ res, url }) => this.handleGetSessions(res, url.searchParams));
    t.exact('GET', '/api/trail/search', (ctx) => this.handleSearch(ctx.res, ctx.query('q', '')));
    t.exact('POST', '/api/trail/refresh', ({ res }) => this.handleRefresh(res));
    t.exact('GET', '/api/trail/prompts', ({ res }) => this.promptsApi.handleGet(res));
    t.exact('GET', '/api/trail/analytics', ({ res }) => this.handleGetAnalytics(res));
    t.exact('GET', '/api/trail/cost-optimization', ({ res }) => this.handleGetCostOptimization(res));
    t.exact('GET', '/api/trail/releases', ({ res }) => this.handleGetReleases(res));
    t.exact('GET', '/api/trail/combined', ({ res, url }) => this.handleGetCombined(res, url.searchParams));
    t.exact('GET', '/api/trail/quality-metrics', ({ res, url }) => this.handleGetQualityMetrics(res, url.searchParams));
    t.exact('GET', '/api/trail/deployment-frequency', ({ res, url }) => this.handleGetDeploymentFrequency(res, url.searchParams));
    t.exact('GET', '/api/trail/deployment-frequency-quality', ({ res, url }) => this.handleGetDeploymentFrequencyQuality(res, url.searchParams));

    // パターン経路は登録順に評価する。`sessions/:id` より前に配下の経路を置く。
    t.pattern('GET', /^\/api\/trail\/sessions\/([^/]+)\/commits$/, ({ res, params }) =>
      this.handleGetSessionCommits(res, decodeURIComponent(params[0])));
    t.pattern('GET', /^\/api\/trail\/sessions\/([^/]+)\/tool-metrics$/, ({ res, params }) =>
      this.handleGetSessionToolMetrics(res, decodeURIComponent(params[0])));
    t.pattern('GET', /^\/api\/trail\/days\/([^/]+)\/tool-metrics$/, ({ res, params }) =>
      this.handleGetDayToolMetrics(res, decodeURIComponent(params[0])));
    t.pattern('GET', /^\/api\/trail\/sessions\/([^/]+)$/, ({ res, params }) =>
      this.handleGetSession(res, decodeURIComponent(params[0])));
  }

  private registerAnalyzeRoutes(t: RouteTable): void {
    t.exact('POST', '/api/analyze/current', ({ req, res }) => this.handleAnalyzeCurrent(req, res));
    t.exact('POST', '/api/analyze/release', ({ req, res }) => this.handleAnalyzeRelease(req, res));
    t.exact('POST', '/api/analyze/commit', ({ req, res }) => this.handleAnalyzeCommit(req, res));
    t.exact('POST', '/api/analyze/all', ({ req, res }) => this.handleAnalyzeAll(req, res));
    t.exact('GET', '/api/analyze/status', ({ res }) => this.handleAnalyzeStatus(res));
    t.exact('POST', '/api/analyze-all/pause', ({ req, res }) => this.handleAnalyzeAllPause(req, res));
    t.exact('POST', '/api/analyze-all/resume', ({ res }) => this.handleAnalyzeAllResume(res));
    t.exact('GET', '/api/analyze-all/status', ({ res }) => this.handleAnalyzeAllStatus(res));
  }

  /** セッション記録系（安全点・緊急ログ・運航後レビュー・ユーザーフィードバック・受入台帳）。 */
  private registerRecordRoutes(t: RouteTable): void {
    t.exact('POST', '/api/trail/token-budget', ({ req, res }) => this.handleTokenBudget(req, res));
    t.exact('POST', '/api/trail/safe-points', ({ req, res }) => this.handleRecordSafePoint(req, res));
    t.exact('GET', '/api/trail/safe-points', ({ res, url }) => this.handleListSafePoints(res, url.searchParams));
    t.exact('POST', '/api/trail/emergency-log', ({ req, res }) => this.handleRecordEmergencyEvent(req, res));
    t.exact('GET', '/api/trail/emergency-log', ({ res, url }) => this.handleListEmergencyEvents(res, url.searchParams));
    t.exact('POST', '/api/trail/flight-reviews', ({ req, res }) => this.handleRecordFlightReview(req, res));
    t.exact('GET', '/api/trail/flight-reviews', ({ res, url }) => this.handleListFlightReviews(res, url.searchParams));
    t.pattern('PATCH', /^\/api\/trail\/flight-reviews\/([^/]+)$/, ({ req, res, params }) =>
      this.handleUpdateFlightReviewManual(req, res, decodeURIComponent(params[0] ?? '')));
    // Flight Record: 指示単位の運航記録。/open は :id パターンより先に登録する
    // （後だと 'open' が指示 ID として食われる）。
    t.exact('GET', '/api/trail/instructions/open', ({ res, url }) => this.handleListOpenInstructions(res, url.searchParams));
    t.exact('GET', '/api/trail/instructions', ({ res, url }) => this.handleListInstructionRecords(res, url.searchParams));
    t.exact('POST', '/api/trail/instructions', ({ req, res }) => this.handleDeclareInstruction(req, res));
    t.pattern('GET', /^\/api\/trail\/instructions\/([^/]+)\/sessions$/, ({ res, params }) =>
      this.handleListInstructionSessions(res, decodeURIComponent(params[0] ?? '')));
    t.exact('POST', '/api/trail/user-feedback', ({ req, res }) => this.handleRecordUserFeedback(req, res));
    t.exact('GET', '/api/trail/user-feedback', ({ res, url }) => this.handleListUserFeedback(res, url.searchParams));
    // 自律受入基盤 S5: 受入台帳（farm と人手記録の書き込み・retro の参照経路）
    t.exact('POST', '/api/trail/acceptance', ({ req, res }) => this.handleUpsertAcceptanceRecord(req, res));
    t.exact('GET', '/api/trail/acceptance', ({ res, url }) => this.handleListAcceptanceRecords(res, url.searchParams));
    t.exact('GET', '/api/trail/acceptance/miss-rate', ({ res, url }) => this.handleAcceptanceMissRate(res, url.searchParams));
    t.exact('POST', '/api/message-commits', ({ req, res }) => {
      if (!this.requireJsonContentType(req, res)) return;
      this.handleInsertMessageCommit(req, res);
    });
  }

  /**
   * Phase 5 S5: trail-viewer の EmergencyPanel 経路。変更系は EmergencyApiHandler 側で
   * Origin allowlist + カスタムヘッダ + Content-Type を検証する（localhost バインドは
   * クロスオリジン送信そのものを防げないため、CSRF 対策をハンドラ内に閉じて持つ）。
   */
  private registerEmergencyRoutes(t: RouteTable): void {
    t.exact('GET', '/api/trail/emergency-state', ({ req, res }) => this.emergencyApi.handleGetState(req, res));
    t.exact('POST', '/api/trail/emergency/kill-switch', ({ req, res }) => void this.emergencyApi.handleKillSwitch(req, res));
    t.exact('POST', '/api/trail/emergency/release', ({ req, res }) => void this.emergencyApi.handleRelease(req, res));
    t.exact('POST', '/api/trail/emergency/rollback', ({ req, res }) => void this.emergencyApi.handleRollback(req, res));
  }

  /** ログ・設定・トレースファイル。 */
  private registerOpsRoutes(t: RouteTable): void {
    t.exact('POST', '/api/logs', ({ req, res }) => this.handlePostLogsRoute(req, res));
    t.exact('GET', '/api/trace/list', ({ res }) => this.handleTraceList(res));
    t.exact('GET', '/api/trace/file', (ctx) => this.handleTraceFile(ctx.res, ctx.query('name', '')));
    t.exact('GET', '/api/config/commit-categories', ({ res }) =>
      this.respondCategories(res, this.options?.configPaths?.commitCategories,
        loadCommitCategories, loadCommitCategoriesFromFile, loadCommitCategoryLabels, loadCommitCategoryLabelsFromFile));
    t.exact('GET', '/api/config/tool-categories', ({ res }) =>
      this.respondCategories(res, this.options?.configPaths?.toolCategories,
        loadToolCategories, loadToolCategoriesFromFile, loadToolCategoryLabels, loadToolCategoryLabelsFromFile));
    t.exact('GET', '/api/config/skill-categories', ({ res }) =>
      this.respondCategories(res, this.options?.configPaths?.skillCategories,
        loadSkillCategories, loadSkillCategoriesFromFile, loadSkillCategoryLabels, loadSkillCategoryLabelsFromFile));
  }

  /** C4 モデル本体（リリース・モデル・DSM・ツリー・ドキュメント紐付け・カバレッジ）。 */
  private registerC4ModelRoutes(t: RouteTable): void {
    t.exact('GET', '/api/c4/releases', ({ res }) => void this.handleC4ReleasesEndpoint(res));
    t.exact('GET', '/api/c4/model', (ctx) =>
      void this.handleC4ModelEndpoint(ctx.res, ctx.query('release', 'current'), ctx.queryOpt('repo')));
    t.exact('GET', '/api/c4/communities', ({ res, url }) => this.c4ManualApi.listCommunities(res, url));
    t.exact('GET', '/api/c4/dsm', (ctx) =>
      this.handleC4DsmEndpoint(ctx.res, ctx.query('release', 'current'), ctx.queryOpt('repo')));
    t.exact('GET', '/api/c4/tree', ({ res }) => void this.handleC4TreeEndpoint(res));
    t.exact('GET', '/api/c4/doc-links', ({ res }) => this.docsApi.handleListDocLinks(res));
    t.exact('GET', '/api/docs-index', (ctx) => void this.docsApi.handleDocsIndex(ctx.res, ctx.queryOpt('repo')));
    t.exact('GET', '/api/c4/coverage', (ctx) =>
      void this.handleC4CoverageEndpoint(ctx.res, ctx.query('release', 'current'), ctx.queryOpt('repo')));
  }

  /** C4 解析系（ファイル・関数・複雑度・呼び出し関係）。 */
  private registerC4AnalysisRoutes(t: RouteTable): void {
    t.exact('GET', '/api/c4/file-analysis', (ctx) =>
      void this.handleC4FileAnalysisEndpoint(ctx.res, ctx.query('tag', 'current'), ctx.queryOpt('repo')));
    t.exact('GET', '/api/c4/function-analysis', (ctx) =>
      void this.handleC4FunctionAnalysisEndpoint(ctx.res, ctx.query('tag', 'current'), ctx.queryOpt('repo')));
    // Complexity は累積指標のため release パラメータは受け取らない
    // (古いクライアントが付与しても無視する)
    t.exact('GET', '/api/c4/complexity', (ctx) => void this.handleC4ComplexityEndpoint(ctx.res, ctx.queryOpt('repo')));
    t.exact('GET', '/api/c4/exports', (ctx) => void this.handleC4ExportsEndpoint(ctx.res, ctx.query('componentId', '')));
    t.exact('GET', '/api/c4/functions', (ctx) => void this.handleC4FunctionsEndpoint(ctx.res, ctx.query('elementId', '')));
    t.exact('GET', '/api/c4/flowchart', (ctx) =>
      void this.handleC4FlowchartEndpoint(
        ctx.res,
        ctx.query('componentId', ''),
        ctx.query('symbolId', ''),
        ctx.query('type', 'control') as 'control' | 'call',
      ));
    t.exact('GET', '/api/c4/sequence', (ctx) => void this.handleC4SequenceEndpoint(ctx.res, ctx.query('elementId', '')));
    t.exact('GET', '/api/c4/function-graph', (ctx) =>
      void this.handleC4FunctionGraphEndpoint(ctx.res, ctx.query('elementId', '')));
    t.exact('GET', '/api/c4/call-hierarchy', (ctx) =>
      void this.handleCallHierarchyEndpoint(ctx.res, {
        file: ctx.query('file', ''),
        fn: ctx.query('fn', ''),
        direction: ctx.query('direction', 'callees'),
        depthParam: ctx.url.searchParams.get('depth'),
        lineParam: ctx.url.searchParams.get('line'),
        scope: ctx.query('scope', 'project'),
        excludeTests: ctx.query('excludeTests', '') === 'true',
      }));
  }

  /** 手動 C4（要素・関係・グループ・コミュニティ要約）。書き込み系は Content-Type を検証する。 */
  private registerC4ManualRoutes(t: RouteTable): void {
    t.exact('POST', '/api/c4/communities/upsert-summaries', ({ req, res, url }) => {
      if (!this.requireJsonContentType(req, res)) return;
      void this.c4ManualApi.upsertCommunitySummaries(req, res, url);
    });
    t.exact('POST', '/api/c4/communities/upsert-mappings', ({ req, res, url }) => {
      if (!this.requireJsonContentType(req, res)) return;
      void this.c4ManualApi.upsertCommunityMappings(req, res, url);
    });
    t.exact('POST', '/api/c4/manual-elements', ({ req, res, url }) => {
      if (!this.requireJsonContentType(req, res)) return;
      void this.c4ManualApi.createElement(req, res, url);
    });
    // ID は percent-decode せずに渡す（現行の挙動を保つ）。
    t.pattern('PATCH', /^\/api\/c4\/manual-elements\/([^/]+)$/, ({ req, res, url, params }) =>
      void this.c4ManualApi.updateElement(req, res, url, params[0]));
    t.pattern('DELETE', /^\/api\/c4\/manual-elements\/([^/]+)$/, ({ res, url, params }) =>
      this.c4ManualApi.deleteElement(res, url, params[0]));
    t.exact('GET', '/api/c4/manual-relationships', ({ res, url }) => this.c4ManualApi.listRelationships(res, url));
    t.exact('POST', '/api/c4/manual-relationships', ({ req, res, url }) =>
      void this.c4ManualApi.createRelationship(req, res, url));
    t.pattern('DELETE', /^\/api\/c4\/manual-relationships\/([^/]+)$/, ({ res, url, params }) =>
      this.c4ManualApi.deleteRelationship(res, url, params[0]));
    t.exact('GET', '/api/c4/manual-groups', ({ res, url }) => this.c4ManualApi.listGroups(res, url));
    t.exact('POST', '/api/c4/manual-groups', ({ req, res, url }) => void this.c4ManualApi.createGroup(req, res, url));
    t.pattern('PATCH', /^\/api\/c4\/manual-groups\/([^/]+)$/, ({ req, res, url, params }) =>
      void this.c4ManualApi.updateGroup(req, res, url, params[0]));
    t.pattern('DELETE', /^\/api\/c4\/manual-groups\/([^/]+)$/, ({ res, url, params }) =>
      this.c4ManualApi.deleteGroup(res, url, params[0]));
  }

  private registerCodeGraphRoutes(t: RouteTable): void {
    t.exact('GET', '/api/code-graph', (ctx) => {
      const commit = ctx.queryOpt('commit');
      const release = ctx.queryOpt('release');
      // release と commit の同時指定は「どちらを優先しても指定と違う時点の絵が出る」形で
      // しか現れないため、優先順位を決めずに断る。
      if (commit !== undefined && release !== undefined) {
        ctx.res.writeHead(400, JSON_HEADERS);
        ctx.res.end(JSON.stringify({ error: 'release and commit are mutually exclusive' }));
        return;
      }
      if (commit !== undefined) {
        this.codeGraphApi.handleGetCommit(ctx.res, commit, ctx.queryOpt('repo'));
        return;
      }
      void this.codeGraphApi.handleGet(ctx.res, release ?? 'current', ctx.queryOpt('repo'));
    });
    t.exact('GET', '/api/code-graph/releases', (ctx) =>
      this.codeGraphApi.handleGetReleases(ctx.res, ctx.queryOpt('repo')));
    t.exact('GET', '/api/code-graph/commits', (ctx) =>
      this.codeGraphApi.handleGetCommits(
        ctx.res, ctx.queryOpt('repo'), ctx.queryOpt('to'), ctx.queryOpt('from')));
    t.exact('GET', '/api/code-graph/query', (ctx) => {
      const depthRaw = ctx.url.searchParams.get('depth');
      const depth = depthRaw === null ? undefined : clampInt(depthRaw, 0, 0, 3);
      void this.codeGraphApi.handleQuery(ctx.res, ctx.query('q', ''), ctx.queryOpt('repo'), depth);
    });
    t.exact('GET', '/api/code-graph/explain', (ctx) =>
      void this.codeGraphApi.handleExplain(ctx.res, ctx.query('id', ''), ctx.queryOpt('repo')));
    t.exact('GET', '/api/code-graph/path', (ctx) =>
      void this.codeGraphApi.handlePath(ctx.res, ctx.query('from', ''), ctx.query('to', ''), ctx.queryOpt('repo')));
  }

  /** リポジトリ分析（結合・欠陥リスク・バス係数・ホットスポット・整合・活動量）。 */
  private registerInsightRoutes(t: RouteTable): void {
    t.exact('GET', '/api/temporal-coupling', ({ res, url }) => this.handleTemporalCoupling(res, url.searchParams));
    t.exact('GET', '/api/defect-risk', ({ res, url }) => this.handleDefectRisk(res, url.searchParams));
    t.exact('GET', '/api/bus-factor', ({ res, url }) => void this.handleBusFactor(res, url.searchParams));
    t.exact('GET', '/api/hotspot', ({ res, url }) => this.handleHotspot(res, url.searchParams));
    t.exact('GET', '/api/alignment', ({ res, url }) => void this.alignmentApi.handle(res, url.searchParams));
    t.exact('GET', '/api/activity-heatmap', ({ res, url }) => this.handleActivityHeatmap(res, url.searchParams));
    t.exact('GET', '/api/activity-trend', ({ res, url }) => this.handleActivityTrend(res, url.searchParams));
    t.exact('GET', '/api/author-heatmap', ({ res, url }) => this.handleAuthorHeatmap(res, url.searchParams));
  }

  /**
   * Memory API の定型応答: 解決値を 200 + JSON、失敗はログ出力のうえ 500（本文なし）。
   * 応答形状がこの型から外れる経路（400 の事前検証・404 分岐・500 に本文を載せるもの）は
   * 個別のハンドラに残す。
   */
  private respondMemoryJson(res: http.ServerResponse, label: string, promise: Promise<unknown>): void {
    void promise.then((data) => {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(data));
    }).catch((err: unknown) => {
      this.logger.error(`[${label}] ${String(err)}`);
      res.writeHead(500); res.end();
    });
  }

  /** Memory API: 状態・根拠・ドリフト。 */
  private registerMemoryDriftRoutes(t: RouteTable): void {
    t.exact('GET', '/api/memory/rationale', (ctx) => {
      const sessionId = ctx.queryOpt('sessionId');
      if (!sessionId) {
        ctx.res.writeHead(400, JSON_HEADERS);
        ctx.res.end(JSON.stringify({ error: 'sessionId required' }));
        return;
      }
      void this.memoryApi.listRationaleNodes({ sessionId }).then((rationale) => {
        ctx.res.writeHead(200, JSON_HEADERS);
        ctx.res.end(JSON.stringify({ rationale }));
      });
    });

    t.exact('GET', '/api/memory/status', ({ res }) =>
      this.respondMemoryJson(res, '/api/memory/status', this.memoryApi.handleStatus()));

    t.exact('GET', '/api/memory/drift/by-day', (ctx) => {
      void this.memoryApi.listDriftHistoryByDay({
        since: ctx.queryOpt('since'),
        until: ctx.queryOpt('until'),
        driftType: ctx.queryOpt('driftType'),
        severity: ctx.queryOpt('severity'),
      }).then((points) => {
        ctx.res.writeHead(200, JSON_HEADERS);
        ctx.res.end(JSON.stringify({ points }));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/drift/by-day] ${String(err)}`);
        ctx.res.writeHead(500, JSON_HEADERS);
        ctx.res.end(JSON.stringify({ error: String(err) }));
      });
    });

    t.exact('GET', '/api/memory/drift/events', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/drift/events', this.memoryApi.listDriftEvents({
        unresolvedOnly: ctx.query('unresolvedOnly', '') === 'true',
        severity: ctx.queryOpt('severity'),
        driftType: ctx.queryOpt('driftType'),
        since: ctx.queryOpt('since'),
        limit: clampInt(ctx.url.searchParams.get('limit'), 50, 1, 200),
      })));

    t.prefix('GET', '/api/memory/drift/events/', (ctx) => {
      const eventId = decodePathParam(ctx.pathname, '/api/memory/drift/events/');
      void this.memoryApi.getDriftEventDetail(eventId).then((data) => {
        if (!data) { ctx.res.writeHead(404); ctx.res.end(); return; }
        ctx.res.writeHead(200, JSON_HEADERS);
        ctx.res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/drift/events/:id] ${String(err)}`);
        ctx.res.writeHead(500); ctx.res.end();
      });
    });

    t.prefix('POST', '/api/memory/drift/events/', (ctx) => {
      if (!this.requireJsonContentType(ctx.req, ctx.res)) return;
      const eventId = decodePathParam(ctx.pathname, '/api/memory/drift/events/', '/resolve');
      void this.readJsonBody(ctx.req).then(async (body) => {
        const note = typeof (body as Record<string, unknown>)['resolutionNote'] === 'string'
          ? (body as Record<string, string>)['resolutionNote']
          : '';
        const data = await this.memoryApi.resolveDriftEvent(eventId, note);
        ctx.res.writeHead(200, JSON_HEADERS);
        ctx.res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/drift/events/:id POST] ${String(err)}`);
        ctx.res.writeHead(500); ctx.res.end();
      });
    });
  }

  /** Memory API: 不具合・レビュー・パイプライン・エンティティ。 */
  private registerMemoryInsightRoutes(t: RouteTable): void {
    t.exact('GET', '/api/memory/bugs/recurring', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/bugs/recurring', this.memoryApi.listRecurringBugs({
        package: ctx.queryOpt('pkg'),
        windowDays: ctx.queryOpt('windowDays')
          ? clampInt(ctx.url.searchParams.get('windowDays'), 90, 1, 365)
          : undefined,
        limit: clampInt(ctx.url.searchParams.get('limit'), 20, 1, 200),
      })));

    t.exact('GET', '/api/memory/bugs/history', (ctx) => {
      // sessionIds は「指定なし（絞り込み無し）」と「指定したが 0 件」を区別する。
      // パラメータ自体が無いときだけ undefined にする（空文字は 0 件の絞り込み）。
      const rawSessionIds = ctx.queryOpt('sessionIds');
      const sessionIds = rawSessionIds === undefined
        ? undefined
        : rawSessionIds.split(',').map((s) => s.trim()).filter(Boolean);
      this.respondMemoryJson(ctx.res, '/api/memory/bugs/history', this.memoryApi.getBugHistory({
        package: ctx.queryOpt('pkg'),
        filePath: ctx.queryOpt('filePath'),
        category: ctx.queryOpt('category'),
        sessionIds,
        limit: clampInt(ctx.url.searchParams.get('limit'), 50, 1, 200),
      }));
    });

    t.exact('GET', '/api/memory/bugs/causal', (ctx) => {
      const bugEntityId = ctx.queryOpt('bugEntityId');
      if (!bugEntityId) {
        ctx.res.writeHead(400, JSON_HEADERS);
        ctx.res.end(JSON.stringify({ error: 'bugEntityId required' }));
        return;
      }
      this.respondMemoryJson(ctx.res, '/api/memory/bugs/causal', this.memoryApi.getBugCausalInfo(bugEntityId));
    });

    t.exact('GET', '/api/memory/reviews/unaddressed', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/reviews/unaddressed', this.memoryApi.listUnaddressedReviewFindings({
        category: ctx.queryOpt('category'),
        severity: ctx.queryOpt('severity'),
        daysSinceMin: ctx.queryOpt('daysSinceMin')
          ? clampInt(ctx.url.searchParams.get('daysSinceMin'), 0, 0, 365)
          : undefined,
        limit: clampInt(ctx.url.searchParams.get('limit'), 50, 1, 200),
      })));

    t.exact('GET', '/api/memory/reviews/history', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/reviews/history', this.memoryApi.getReviewHistory({
        targetFilePath: ctx.queryOpt('targetFilePath'),
        package: ctx.queryOpt('pkg'),
        limit: clampInt(ctx.url.searchParams.get('limit'), 50, 1, 200),
      })));

    // Flight Record（指示単位）へ畳んだレビュー指摘。件数は一覧の列に出すため、
    // limit で欠ける一覧クエリではなく SQL 集計の専用ルートから取る。
    t.exact('GET', '/api/memory/reviews/flight-counts', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/reviews/flight-counts',
        this.memoryApi.getFlightReviewFindingCounts()));

    t.exact('GET', '/api/memory/reviews/flight-findings', (ctx) => {
      const raw = ctx.queryOpt('instructionIds');
      const instructionIds = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      this.respondMemoryJson(ctx.res, '/api/memory/reviews/flight-findings',
        this.memoryApi.getFlightReviewFindings({
          instructionIds,
          limit: clampInt(ctx.url.searchParams.get('limit'), 200, 1, 1000),
        }));
    });

    t.exact('GET', '/api/memory/pipeline/runs/by-day', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/pipeline/runs/by-day', this.memoryApi.listPipelineRunStatsByDay({
        scope: ctx.queryOpt('scope'),
        since: ctx.queryOpt('since'),
      })));

    t.exact('GET', '/api/memory/pipeline/runs', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/pipeline/runs', this.memoryApi.listPipelineRuns({
        since: ctx.queryOpt('since'),
        wave: ctx.queryOpt('wave'),
        status: ctx.queryOpt('status'),
        limit: clampInt(ctx.url.searchParams.get('limit'), 100, 1, 200),
      })));

    t.pattern('GET', /^\/api\/memory\/pipeline\/runs\/([^/]+)\/logs$/, (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/pipeline/runs/:runId/logs', this.memoryApi.listPipelineRunLogs({
        runId: decodeURIComponent(ctx.params[0] ?? ''),
        limit: clampInt(ctx.url.searchParams.get('limit'), 200, 1, 200),
      })));

    t.exact('GET', '/api/memory/pipeline/failed', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/pipeline/failed', this.memoryApi.listFailedItems({
        scope: ctx.queryOpt('scope'),
        limit: clampInt(ctx.url.searchParams.get('limit'), 50, 1, 200),
      })));

    // 消費者は将来のグラフ表示。撤去可否は MemoryApiHandler.listInvalidations のコメント参照
    t.exact('GET', '/api/memory/edges/invalidations', (ctx) =>
      this.respondMemoryJson(ctx.res, '/api/memory/edges/invalidations', this.memoryApi.listInvalidations({
        since: ctx.queryOpt('since'),
        limit: clampInt(ctx.url.searchParams.get('limit'), 50, 1, 200),
      })));
  }

  // -------------------------------------------------------------------------
  //  Code graph endpoints
  // -------------------------------------------------------------------------

  private handleTemporalCoupling(res: http.ServerResponse, params: URLSearchParams): void {
    const repoName = params.get('repo')?.trim() ?? '';
    if (!repoName) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'repo is required' }));
      return;
    }

    const granularityRaw = params.get('granularity');
    if (
      granularityRaw !== null
      && granularityRaw !== 'commit'
      && granularityRaw !== 'session'
      && granularityRaw !== 'subagentType'
    ) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: "granularity must be 'commit', 'session', or 'subagentType'" }));
      return;
    }
    const subagentOrCommit = granularityRaw === 'subagentType' ? 'subagentType' : 'commit';
    const granularity: 'commit' | 'session' | 'subagentType' =
      granularityRaw === 'session' ? 'session' : subagentOrCommit;

    const windowDays = clampInt(params.get('windowDays'), 30, 1, 365);
    const topK = clampInt(params.get('topK'), 50, 1, 500);
    const directional = params.get('directional') === 'true';
    const confidenceThreshold = clampFloat(params.get('confidenceThreshold'), 0.5, 0, 1);
    const directionalDiff = clampFloat(params.get('directionalDiff'), 0.3, 0, 1);

    // 明示指定された場合のみ採用。未指定なら undefined を渡し、TrailDatabase 側の粒度別デフォルトを使う。
    const thresholdRaw = params.get('threshold');
    const threshold = thresholdRaw === null ? undefined : clampFloat(thresholdRaw, 0.5, 0, 1);
    const minChangeRaw = params.get('minChange');
    const minChange = minChangeRaw === null ? undefined : clampInt(minChangeRaw, 5, 1, 1000);

    try {
      const computedAt = new Date().toISOString();
      if (directional) {
        const edges = this.trailDb.fetchTemporalCoupling({
          repoName,
          windowDays,
          minChangeCount: minChange,
          topK,
          directional: true,
          confidenceThreshold,
          directionalDiffThreshold: directionalDiff,
          granularity,
        });
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({
          directional: true,
          granularity,
          edges,
          computedAt,
          windowDays,
          totalPairs: edges.length,
        }));
        return;
      }

      const edges = this.trailDb.fetchTemporalCoupling({
        repoName,
        windowDays,
        minChangeCount: minChange,
        jaccardThreshold: threshold,
        topK,
        granularity,
      });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({
        granularity,
        edges,
        computedAt,
        windowDays,
        totalPairs: edges.length,
      }));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/temporal-coupling failed: ${err.message}\n${err.stack ?? ''}`);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  // -------------------------------------------------------------------------
  //  Hotspot / Activity Map (trail-time-axis-requirements 3.2)
  // -------------------------------------------------------------------------

  private handleHotspot(res: http.ServerResponse, params: URLSearchParams): void {
    const period = parseHotspotPeriod(params.get('period'));
    if (period === null) {
      this.sendError(res, 400, "period must be one of '7d', '30d', '90d', or 'all'");
      return;
    }
    const granularity = parseHotspotGranularity(params.get('granularity'));
    if (granularity === null) {
      this.sendError(res, 400, "granularity must be one of 'commit' or 'session'");
      return;
    }
    const repo = params.get('repo') ?? undefined;
    try {
      const { from, to } = computePeriodRangeUtc(period);
      const rows = this.trailDb.fetchHotspotRows({ from, to, granularity, repo });
      const files = computeFileHotspot(rows);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ period, granularity, from, to, files }));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/hotspot failed: ${err.message}\n${err.stack ?? ''}`);
      this.sendError(res, 500, err.message);
    }
  }

  private async handleActivityHeatmap(res: http.ServerResponse, params: URLSearchParams): Promise<void> {
    const period = parseHotspotPeriod(params.get('period'));
    if (period === null) {
      this.sendError(res, 400, "period must be one of '7d', '30d', '90d', or 'all'");
      return;
    }
    const modeRaw = params.get('mode');
    if (modeRaw !== 'session-file' && modeRaw !== 'subagent-file') {
      this.sendError(res, 400, "mode must be 'session-file' or 'subagent-file'");
      return;
    }
    const topK = clampInt(params.get('topK'), modeRaw === 'session-file' ? 50 : 200, 1, 200);
    const repo = params.get('repo') ?? undefined;
    try {
      const { from, to } = computePeriodRangeUtc(period);
      const rawRows = this.trailDb.fetchActivityHeatmapRows({ from, to, mode: modeRaw, rowLimit: topK });
      const rowLabelByKey = new Map(rawRows.map((r) => [r.rowId, r.rowLabel] as const));
      const intermediate = computeActivityHeatmap({
        rows: rawRows.map((r) => ({ rowKey: r.rowId, filePath: r.filePath, count: r.count })),
        mode: modeRaw,
        topK,
        rowLabelResolver: (key) => rowLabelByKey.get(key) ?? key,
      });
      const c4Model = await this.loadCurrentC4Model(repo);
      const matrix = c4Model
        ? aggregateHeatmapColumnsToC4(intermediate.rows, intermediate.cellsByRowFile, c4Model)
        : { rows: intermediate.rows, columns: [], cells: [], maxValue: intermediate.maxValue };
      res.writeHead(200, JSON_HEADERS);
      res.end(
        JSON.stringify({
          period,
          mode: modeRaw,
          from,
          to,
          rows: matrix.rows,
          columns: matrix.columns,
          cells: matrix.cells,
          maxValue: matrix.maxValue,
        }),
      );
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/activity-heatmap failed: ${err.message}\n${err.stack ?? ''}`);
      this.sendError(res, 500, err.message);
    }
  }

  private async handleActivityTrend(res: http.ServerResponse, params: URLSearchParams): Promise<void> {
    const elementId = (params.get('elementId') ?? '').trim();
    if (!ELEMENT_ID_RE.test(elementId)) {
      this.sendError(res, 400, String.raw`elementId is required and must match ^(sys|pkg|comp|code|file)_[\w/.:-]+$`);
      return;
    }
    const period = parseHotspotPeriod(params.get('period'));
    if (period === null) {
      this.sendError(res, 400, "period must be one of '7d', '30d', '90d', or 'all'");
      return;
    }
    const granularity = parseActivityTrendGranularity(params.get('granularity'));
    if (granularity === null) {
      this.sendError(res, 400, "granularity must be one of 'commit', 'session', 'subagent', or 'defect'");
      return;
    }
    const sessionMode = parseActivityTrendSessionMode(params.get('sessionMode'));
    if (sessionMode === null) {
      this.sendError(res, 400, "sessionMode must be one of 'read' or 'write'");
      return;
    }
    const repo = params.get('repo') ?? undefined;
    try {
      const c4Model = await this.loadCurrentC4Model(repo);
      if (!c4Model) {
        this.sendError(res, 503, 'c4 model not yet available');
        return;
      }
      const { from, to } = computePeriodRangeUtc(period);
      const filePaths = collectFilePathsForElement(elementId, c4Model);
      const rows = this.trailDb.fetchActivityTrendRows({
        from,
        to,
        granularity,
        sessionMode,
        filePathsIn: filePaths,
      });
      const trend = computeActivityTrend({
        rows,
        elementId,
        granularity: granularity === 'defect' ? 'commit' : granularity,
        period,
        from,
        to,
        c4Model,
      });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ elementId, period, granularity, from, to, ...trend }));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/activity-trend failed: ${err.message}\n${err.stack ?? ''}`);
      this.sendError(res, 500, err.message);
    }
  }

  private resolveTraceDir(): string {
    // extension が writer (traceCommands) と同じロジックで解決した trace dir を優先する。
    // daemon は fork 時 cwd 未指定でワークスペースを知らず、gitRoot fallback は writer の
    // wsRoot とズレ得るため、注入値を最優先にする。
    if (this.options?.traceDir) return this.options.traceDir;
    const trailHome = process.env['TRAIL_HOME'] ?? path.join(this.gitRoot ?? process.cwd(), '.anytime', 'trail');
    return path.join(trailHome, 'trace');
  }

  private handleTraceList(res: http.ServerResponse): void {
    const traceDir = this.resolveTraceDir();
    try {
      const files = fs.readdirSync(traceDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const stat = fs.statSync(path.join(traceDir, f));
          return { name: f, mtime: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime));
      const result = files.map(({ name, mtime }) => ({
        name,
        url: `/api/trace/file?name=${encodeURIComponent(name)}`,
        mtime,
      }));
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.writeHead(200, JSON_HEADERS);
        res.end('[]');
        return;
      }
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/trace/list failed: ${err.message}\n${err.stack ?? ''}`);
      this.sendError(res, 500, err.message);
    }
  }

  private handleTraceFile(res: http.ServerResponse, name: string): void {
    if (!name || name.includes('..') || name.includes('/') || !name.endsWith('.json')) {
      this.sendError(res, 400, 'Invalid file name');
      return;
    }
    const traceDir = this.resolveTraceDir();
    // defense-in-depth: 上の name ガード (.. / / / 非.json を reject) に加え、
    // 解決後の絶対パスが traceDir 配下に収まることを検証する (path injection / S2083)。
    const resolvedDir = path.resolve(traceDir);
    const filePath = path.resolve(resolvedDir, name);
    if (!filePath.startsWith(resolvedDir + path.sep)) {
      this.sendError(res, 400, 'Invalid file name');
      return;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(content);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') { this.sendError(res, 404, 'File not found'); return; }
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/trace/file failed: ${filePath}: ${err.message}\n${err.stack ?? ''}`);
      this.sendError(res, 500, err.message);
    }
  }

  private sendError(res: http.ServerResponse, status: number, message: string): void {
    res.writeHead(status, JSON_HEADERS);
    res.end(JSON.stringify({ error: message }));
  }

  private async loadCurrentC4Model(repoName?: string): Promise<C4Model | null> {
    const resolvedRepo = repoName ?? (this.defaultRepo());
    if (!resolvedRepo) return null;
    try {
      const store = this.trailDb.asC4ModelStore();
      const result = await Promise.resolve(store.getCurrentC4Model(resolvedRepo));
      return result?.model ?? null;
    } catch (e) {
      this.logger.warn(`asC4ModelStore.getCurrentC4Model failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private handleDefectRisk(res: http.ServerResponse, params: URLSearchParams): void {
    const windowDays = clampInt(params.get('windowDays'), 90, 1, 365);
    const halfLifeDays = clampInt(params.get('halfLifeDays'), 90, 1, 730);
    const repo = params.get('repo') ?? undefined;

    try {
      const entries = this.trailDb.fetchDefectRisk({ windowDays, halfLifeDays, repo });
      const computedAt = new Date().toISOString();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ entries, computedAt, windowDays, halfLifeDays, totalFiles: entries.length }));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/defect-risk failed: ${err.message}\n${err.stack ?? ''}`);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  /**
   * Phase 6 S5-B: 属人度（Bus Factor）を返す。
   *
   * `unit=c4` では C4 要素単位の集約をサーバー側で行う。生行をクライアントへ送って
   * 再集計させる方式は、大規模リポジトリで転送量が跳ね上がり上限での切り詰めを招き、
   * 切り詰めた行から算出した属人度は誤値になるため採用しない（要素へ写してから
   * 著者×コミットを合算し score を再計算する。ファイル単位の結果の足し合わせでは、
   * 1 コミットが同一要素内の複数ファイルを触ったときに二重計上になる）。
   */
  private async handleBusFactor(res: http.ServerResponse, params: URLSearchParams): Promise<void> {
    const windowDays = clampInt(params.get('windowDays'), 365, 1, 3650);
    const minCommits = clampInt(params.get('minCommits'), 5, 1, 1000);
    const repo = params.get('repo') ?? undefined;
    const unit = params.get('unit') === 'c4' ? 'c4' : 'file';
    // viewer が表示中のモデルと要素 ID を揃える（リリース表示中はそのリリースのモデル）
    const release = params.get('release') || 'current';

    try {
      const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
      const rows = this.trailDb.fetchFileAuthorCommits({ repo, sinceIso });

      let entries = computeBusFactor(rows, { minCommits });
      let c4ModelAvailable: boolean | undefined;
      if (unit === 'c4') {
        const c4Model = (await this.resolveC4ModelPayload(release, repo))?.model ?? null;
        c4ModelAvailable = c4Model !== null;
        if (c4Model) {
          const elementById = buildC4ElementById(c4Model.elements);
          entries = computeBusFactor(rows, {
            minCommits,
            unitsOf: (filePath) => mapFileToC4Elements(filePath, elementById).map((m) => m.elementId),
          });
        } else {
          // モデルが無い状態でファイル単位の結果を返すと、要素 ID を期待する呼び出し側が
          // 全件未一致を「属人度なし」と誤読する。集約できない事実を明示して空で返す。
          this.logger.warn(`/api/bus-factor: C4 model unavailable (release=${release}, repo=${repo ?? 'default'})`);
          entries = [];
        }
      }

      res.writeHead(200, JSON_HEADERS);
      res.end(
        JSON.stringify({
          entries,
          computedAt: new Date().toISOString(),
          windowDays,
          minCommits,
          unit,
          totalUnits: entries.length,
          ...(c4ModelAvailable === undefined ? {} : { c4ModelAvailable }),
        }),
      );
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/bus-factor failed: ${err.message}\n${err.stack ?? ''}`);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  /**
   * Author Heatmap: コードグラフのノードごとの最終編集セッション・編集頻度・属人度。
   *
   * コードグラフのノード集合で集計を絞る（グラフに無いファイルの行を返しても viewer が
   * 使えないうえ、被覆率の分母が狂う）。repo 未指定・コードグラフ未生成は 200 + 空で返す。
   * ここを 4xx にすると、まだ解析していないだけのワークスペースでグラフ描画ごと壊れる。
   */
  private handleAuthorHeatmap(res: http.ServerResponse, params: URLSearchParams): void {
    const repo = params.get('repo') ?? '';
    const topSessions = clampInt(params.get('topSessions'), 8, 1, 32);

    try {
      const graph = repo ? this.trailDb.getCurrentCodeGraph(repo) : null;
      if (!graph) {
        if (repo) {
          this.logger.warn(`/api/author-heatmap: no current code graph for repo=${repo}`);
        }
        res.writeHead(200, JSON_HEADERS);
        res.end(
          JSON.stringify({
            entries: [],
            topSessions: [],
            coveredNodes: 0,
            totalNodes: 0,
            computedAt: new Date().toISOString(),
          }),
        );
        return;
      }

      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      const rows = this.trailDb.fetchFileSessionCommits({ repo });
      const entries = computeAuthorHeatmap(rows, {
        toNodeId: (filePath) => toCodeGraphNodeId(repo, filePath),
        isKnownNode: (nodeId) => nodeIds.has(nodeId),
      });

      res.writeHead(200, JSON_HEADERS);
      res.end(
        JSON.stringify({
          entries,
          topSessions: selectTopSessions(entries, topSessions),
          coveredNodes: entries.length,
          totalNodes: nodeIds.size,
          computedAt: new Date().toISOString(),
        }),
      );
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error(`/api/author-heatmap failed: ${err.message}\n${err.stack ?? ''}`);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  notifyCodeGraphUpdated(): void {
    this.callHierarchyIndex = null;
    this.callHierarchyIndexRepo = undefined;
    this.codeGraphApi.invalidate();
    if (this.clients.size === 0) return;
    const payload = JSON.stringify({ type: 'code-graph-updated' } satisfies ServerMessage);
    for (const ws of this.clients) ws.send(payload);
  }

  /**
   * C4 モデル更新を viewer へ通知する (`model-updated` WS イベント)。
   * AnalyzePipelineCallbacks の一員として解析パイプラインから呼ばれ、viewer は
   * これを受けて C4 モデルを再 fetch する (手動 CRUD の model-updated と同じ経路)。
   */
  notifyModelUpdated(): void {
    this.notify('model-updated');
  }

  notifyCodeGraphProgress(phase: string, percent: number): void {
    if (this.clients.size === 0) return;
    const message: ServerMessage = { type: 'code-graph-progress', phase, percent };
    const payload = JSON.stringify(message);
    for (const ws of this.clients) ws.send(payload);
  }

  // -------------------------------------------------------------------------
  //  Standalone HTML
  // -------------------------------------------------------------------------

  private serveStandaloneHtml(res: http.ServerResponse): void {
    this.cachedHtml ??= buildStandaloneHtml();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(this.cachedHtml);
  }

  // -------------------------------------------------------------------------
  //  Static files
  // -------------------------------------------------------------------------

  private serveStaticFile(res: http.ServerResponse, filename: string): void {
    const filePath = path.join(this.distPath, filename);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      const contentType = filename.endsWith('.map') ? 'application/json' : 'application/javascript';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
      res.end(data);
    });
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/sessions
  // -------------------------------------------------------------------------

  private handleGetSessions(
    res: http.ServerResponse,
    params: URLSearchParams,
  ): void {
    try {
      const filters: {
        branch?: string;
        model?: string;
        repository?: string;
        from?: string;
        to?: string;
      } = {};

      const branch = params.get('branch');
      const model = params.get('model');
      const repository = params.get('repository');
      const from = params.get('from');
      const to = params.get('to');

      if (branch) filters.branch = branch;
      if (model) filters.model = model;
      if (repository) filters.repository = repository;
      if (from) filters.from = from;
      if (to) filters.to = to;

      const rawSessions = this.trailDb.getSessions(filters);
      const sessionIds = rawSessions.map((s) => s.id);
      const rawSessionById = new Map(rawSessions.map((s) => [s.id, s] as const));
      const commitStats = this.trailDb.getSessionCommitStats(sessionIds);
      const distinctAgentIdCounts = this.trailDb.getSessionDistinctAgentIdCounts(sessionIds);
      const delegatedTrackCounts = this.trailDb.getSessionDelegatedTrackCounts(sessionIds);
      const nonCodexIds = rawSessions
        .filter((s) => s.source !== 'codex')
        .map((s) => s.id);
      const linkedMapByParent = this.trailDb.fetchLinkedCodexSessionMapForCcSessions(nonCodexIds);
      const linkedCodexSessionIdsByParent = new Map<string, Set<string>>();
      const consumedCodexSessionIds = new Set<string>();
      for (const parentId of nonCodexIds) {
        const linked = linkedMapByParent.get(parentId) ?? new Map<string, string>();
        const ids = new Set<string>();
        for (const sid of linked.values()) {
          ids.add(sid);
          consumedCodexSessionIds.add(sid);
        }
        linkedCodexSessionIdsByParent.set(parentId, ids);
      }

      const sessions = rawSessions
        .filter((s) => !(s.source === 'codex' && consumedCodexSessionIds.has(s.id)))
        .map((s) => {
        const cStats = commitStats.get(s.id);
        const distinctAgentIdCount = distinctAgentIdCounts.get(s.id) ?? 0;
        const delegatedTrackCount = delegatedTrackCounts.get(s.id) ?? 0;
        const linkedCodexIds = linkedCodexSessionIdsByParent.get(s.id) ?? new Set<string>();
        const linkedCodexCount = linkedCodexIds.size;
        let linkedInputTokens = 0;
        let linkedOutputTokens = 0;
        let linkedCacheReadTokens = 0;
        let linkedCacheCreationTokens = 0;
        let linkedEstimatedCostUsd = 0;
        let linkedMessageCount = 0;
        for (const linkedId of linkedCodexIds) {
          const linkedSession = rawSessionById.get(linkedId);
          if (!linkedSession) continue;
          linkedInputTokens += linkedSession.input_tokens ?? 0;
          linkedOutputTokens += linkedSession.output_tokens ?? 0;
          linkedCacheReadTokens += linkedSession.cache_read_tokens ?? 0;
          linkedCacheCreationTokens += linkedSession.cache_creation_tokens ?? 0;
          linkedEstimatedCostUsd += linkedSession.estimated_cost_usd ?? 0;
          linkedMessageCount += linkedSession.message_count ?? 0;
        }
        const codexTrackCount = Math.max(linkedCodexCount, delegatedTrackCount);
        const resolvedSubAgentCount = Math.max(s.sub_agent_count ?? 0, distinctAgentIdCount + codexTrackCount);
        const interruptionReason = (s.interruption_reason ?? null) as 'max_tokens' | 'no_response' | null;
        return {
          id: s.id,
          slug: s.slug,
          repoName: s.repo_name ?? '',
          gitBranch: s.git_branch ?? '',
          model: s.model,
          version: s.version,
          startTime: s.start_time,
          endTime: s.end_time,
          messageCount: (s.message_count ?? 0) + linkedMessageCount,
          peakContextTokens: s.peak_context_tokens ?? 0,
          initialContextTokens: s.initial_context_tokens ?? 0,
          interruption: interruptionReason
            ? { interrupted: true, reason: interruptionReason, contextTokens: s.interruption_context_tokens ?? 0 }
            : undefined,
          usage: {
            inputTokens: (s.input_tokens ?? 0) + linkedInputTokens,
            outputTokens: (s.output_tokens ?? 0) + linkedOutputTokens,
            cacheReadTokens: (s.cache_read_tokens ?? 0) + linkedCacheReadTokens,
            cacheCreationTokens: (s.cache_creation_tokens ?? 0) + linkedCacheCreationTokens,
          },
          estimatedCostUsd: (s.estimated_cost_usd ?? 0) + linkedEstimatedCostUsd,
          source: (s.source as 'claude_code' | 'codex' | undefined) ?? 'claude_code',
          commitStats: cStats
            ? { commits: cStats.commits, linesAdded: cStats.linesAdded,
                linesDeleted: cStats.linesDeleted, filesChanged: cStats.filesChanged }
            : undefined,
          errorCount: s.error_count != null && s.error_count > 0 ? s.error_count : undefined,
          subAgentCount: resolvedSubAgentCount > 0 ? resolvedSubAgentCount : undefined,
          compactCount: s.compact_count != null && s.compact_count > 0 ? s.compact_count : undefined,
          assistantMessageCount: s.assistant_message_count != null && s.assistant_message_count > 0
            ? s.assistant_message_count : undefined,
        };
        });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ sessions }));
    } catch (err) {
      this.logger.error('[/api/trail/sessions] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to read sessions' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/sessions/:id
  // -------------------------------------------------------------------------

  private handleGetSession(
    res: http.ServerResponse,
    sessionId: string,
  ): void {
    try {
      const sessions = this.trailDb.getSessions();
      const session: SessionRow | undefined = sessions.find((s) => s.id === sessionId);
      if (!session) {
        res.writeHead(404, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      const rawMessages: MessageRow[] = this.trailDb.getMessages(sessionId);
      const codexSessionByAssistantUuid = this.trailDb.getLinkedCodexSessionByAssistantUuid(sessionId);
      const toolExecMsMap = this.trailDb.getTurnExecMsBySession(sessionId);
      const skillsMap = this.trailDb.getSkillsBySession(sessionId);
      const messageCommits = this.trailDb.getMessageCommitsBySession(sessionId);
      const errorUuids = this.trailDb.getErrorMessageUuids(sessionId);
      const gitCommitUuids = this.trailDb.getGitCommitMessageUuids(sessionId);
      const commitsByMessageUuid = new Map<string, string[]>();
      for (const mc of messageCommits) {
        const arr = commitsByMessageUuid.get(mc.messageUuid) ?? [];
        arr.push(mc.commitHash);
        commitsByMessageUuid.set(mc.messageUuid, arr);
      }
      // message_commits stores user message UUIDs; map back to the parent assistant UUID
      const commitsByAssistantUuid = new Map<string, string[]>();
      for (const m of rawMessages) {
        const hashes = commitsByMessageUuid.get(m.uuid);
        if (hashes && m.parent_uuid) commitsByAssistantUuid.set(m.parent_uuid, hashes);
      }
      // Fallback: for sessions where message_commits is not yet backfilled,
      // match git-commit assistant messages to session_commits by timestamp proximity.
      if (commitsByAssistantUuid.size === 0) {
        const sessionCommitsList = this.trailDb.getSessionCommits(sessionId);
        if (sessionCommitsList.length > 0) {
          for (const m of rawMessages) {
            if (!gitCommitUuids.has(m.uuid) || !m.timestamp) continue;
            const msgTime = new Date(m.timestamp).getTime();
            let closest: SessionCommitRow | null = null;
            let closestDiff = Infinity;
            for (const sc of sessionCommitsList) {
              if (!sc.committed_at) continue;
              const diff = new Date(sc.committed_at).getTime() - msgTime;
              if (diff >= 0 && diff < 300_000 && diff < closestDiff) {
                closest = sc;
                closestDiff = diff;
              }
            }
            if (closest) commitsByAssistantUuid.set(m.uuid, [closest.commit_hash]);
          }
        }
      }
      const messages = rawMessages.map((m) => {
        const linkedCodexSessionId = codexSessionByAssistantUuid.get(m.uuid);
        const agentId = m.agent_id ?? (linkedCodexSessionId ? `codex:${linkedCodexSessionId}` : undefined);
        const agentDescription = m.agent_description ?? (linkedCodexSessionId
          ? `Codex delegated session ${linkedCodexSessionId.slice(0, 8)}`
          : undefined);
        return {
        uuid: m.uuid,
        parentUuid: m.parent_uuid,
        type: m.type,
        subtype: m.subtype,
        textContent: m.text_content,
        userContent: m.user_content,
        toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
        model: m.model,
        usage: (m.input_tokens || m.output_tokens || m.cache_read_tokens)
          ? {
            inputTokens: m.input_tokens,
            outputTokens: m.output_tokens,
            cacheReadTokens: m.cache_read_tokens,
            cacheCreationTokens: m.cache_creation_tokens,
          }
          : undefined,
        timestamp: m.timestamp,
        isSidechain: m.is_sidechain === 1,
        triggerCommitHashes: commitsByAssistantUuid.get(m.uuid) ?? commitsByMessageUuid.get(m.uuid),
        hasToolError: errorUuids.has(m.uuid) ? true : undefined,
        hasCommit: gitCommitUuids.has(m.uuid) ? true : undefined,
        agentId,
        agentDescription,
        codexSessionId: linkedCodexSessionId,
        toolExecMs: toolExecMsMap.get(m.uuid),
        skill: skillsMap.get(m.uuid),
        };
      });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ session, messages }));
    } catch (err) {
      this.logger.error('[/api/trail/sessions/:id] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to read session' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/sessions/:id/commits
  // -------------------------------------------------------------------------

  private handleGetSessionCommits(res: http.ServerResponse, sessionId: string): void {
    try {
      const commits = this.trailDb.getSessionCommits(sessionId);
      const mapped = commits.map((c) => ({
        commitHash: c.commit_hash,
        commitMessage: c.commit_message,
        author: c.author,
        committedAt: c.committed_at,
        isAiAssisted: c.is_ai_assisted === 1,
        filesChanged: c.files_changed,
        linesAdded: c.lines_added,
        linesDeleted: c.lines_deleted,
        repoName: c.repo_name ?? '',
      }));
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ commits: mapped }));
    } catch (err) {
      this.logger.error('[/api/trail/sessions/:id/commits] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get commits' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/sessions/:id/tool-metrics
  // -------------------------------------------------------------------------

  private handleGetSessionToolMetrics(
    res: http.ServerResponse,
    sessionId: string,
  ): void {
    try {
      const metrics = this.trailDb.computeToolMetrics(sessionId);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(metrics));
    } catch (err) {
      this.logger.error('[/api/trail/sessions/:id/tool-metrics] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get tool metrics' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/days/:date/tool-metrics
  // -------------------------------------------------------------------------

  private handleGetDayToolMetrics(
    res: http.ServerResponse,
    date: string,
  ): void {
    try {
      const metrics = this.trailDb.getDayToolMetrics(date);
      if (metrics === null) {
        res.writeHead(500, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'Failed to get day tool metrics' }));
        return;
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(metrics));
    } catch (err) {
      this.logger.error('[/api/trail/days/:date/tool-metrics] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get day tool metrics' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: C4 endpoints
  // -------------------------------------------------------------------------

  /**
   * viewer へ配信するのと同じ C4 モデルを解決する（手動要素のマージ込み）。
   * 要素 ID を揃える必要があるメトリクス集約（例: /api/bus-factor?unit=c4）も同じ経路を使う。
   */
  private async resolveC4ModelPayload(releaseId: string, repo?: string): Promise<C4ModelPayload | null> {
    // trail-core の fetchC4Model 経由でストアから取得（pure 関数 + IC4ModelStore アダプタ）
    const repoName = repo ?? (this.defaultRepo());
    const provider = this.getC4Provider?.();
    const store = this.trailDb.asC4ModelStore();
    const manualProvider = repoName ? {
      getElements: async (repo: string) =>
        provider ? provider.getManualElements(repo) : this.trailDb.getManualElements(repo),
      getRelationships: async (repo: string) =>
        provider ? provider.getManualRelationships(repo) : this.trailDb.getManualRelationships(repo),
    } : undefined;
    const featureMatrix = provider?.featureMatrix ?? this.trailDb.getCurrentFeatureMatrix() ?? undefined;
    return fetchC4Model(store, releaseId, repoName, featureMatrix, manualProvider);
  }

  private async handleC4ModelEndpoint(res: http.ServerResponse, releaseId: string, repo?: string): Promise<void> {
    const payload = await this.resolveC4ModelPayload(releaseId, repo);
    if (payload) {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(payload));
      return;
    }

    res.writeHead(204);
    res.end();
  }

  private async handleC4ReleasesEndpoint(res: http.ServerResponse): Promise<void> {
    try {
      const store = this.trailDb.asC4ModelStore();
      const entries = await fetchC4ModelEntries(store);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(entries));
    } catch (err) {
      this.logger.error('[/api/c4/releases] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get C4 releases' }));
    }
  }

  private handleC4DsmEndpoint(res: http.ServerResponse, releaseId: string, repo?: string): void {
    try {
      // current: 解析直後のメモリを優先し、なければ SQLite の current_graphs
      // release: SQLite の release_graphs から取得
      let matrix: DsmMatrix | undefined;
      if (releaseId === 'current') {
        matrix = this.getC4Provider?.()?.sourceMatrix;
        if (!matrix) {
          const graph = this.trailDb.getCurrentGraph(repo);
          if (graph) matrix = buildSourceMatrix(graph, 'component');
        }
      } else {
        const graph = this.trailDb.getReleaseGraph(releaseId);
        if (graph) matrix = buildSourceMatrix(graph, 'component');
      }

      if (!matrix) {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ matrix }));
    } catch (e) {
      this.logger.error('Failed to build DSM', e);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to build DSM' }));
    }
  }

  private async handleC4TreeEndpoint(res: http.ServerResponse): Promise<void> {
    const repoName = this.defaultRepo();
    const provider = this.getC4Provider?.();
    const store = this.trailDb.asC4ModelStore();
    const featureMatrix = provider?.featureMatrix ?? this.trailDb.getCurrentFeatureMatrix() ?? undefined;
    const payload = await fetchC4Model(store, 'current', repoName, featureMatrix);

    if (!payload) {
      res.writeHead(204);
      res.end();
      return;
    }

    const level = DSM_LEVEL_MAP[provider?.currentDsmLevel ?? 'component'] ?? 3;
    const boundaries = payload.boundaries ?? [];
    const fullTree = buildElementTree(payload.model, boundaries);
    const tree = filterTreeByLevel(fullTree, level);

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ tree }));
  }

  private async handleC4CoverageEndpoint(res: http.ServerResponse, releaseId: string, repo?: string): Promise<void> {
    try {
      const provider = this.getC4Provider?.();
      const repoName = repo ?? (this.defaultRepo());
      const store = this.trailDb.asC4ModelStore();
      const payload = await fetchC4Model(store, releaseId, repoName, provider?.featureMatrix);
      if (!payload) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ coverageMatrix: null, coverageDiff: null }));
        return;
      }

      // 特定リリース要求: release_coverage を repo 帰属確認のうえ取得
      // ファイルスキャンへのフォールバックは行わない（過去スナップショットと現在ファイルが混ざる不整合を防止）
      if (releaseId !== 'current') {
        const releaseTagBelongsToRepo = this.trailDb.getReleases()
          .some((r) => r.tag === releaseId && (!repoName || r.repo_name === repoName));
        if (!releaseTagBelongsToRepo) {
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ coverageMatrix: null, coverageDiff: null }));
          return;
        }
        const dbRows = this.trailDb.getCoverageByTag(releaseId);
        if (dbRows.length === 0) {
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ coverageMatrix: null, coverageDiff: null }));
          return;
        }
        const coverageMatrix = aggregateCoverageFromDb(dbRows, payload.model);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ coverageMatrix, coverageDiff: null }));
        return;
      }

      // current 要求: current_coverage を読む (他の current 系と同じく DB-only)。
      if (repoName) {
        const currentRows = this.trailDb.getCurrentCoverage(repoName);
        if (currentRows.length > 0) {
          const asReleaseRows: ReleaseCoverageRow[] = currentRows.map((r: CurrentCoverageRow) => ({
            release_tag: '__current__',
            package: r.package,
            file_path: r.file_path,
            lines_total: r.lines_total,
            lines_covered: r.lines_covered,
            lines_pct: r.lines_pct,
            statements_total: r.statements_total,
            statements_covered: r.statements_covered,
            statements_pct: r.statements_pct,
            functions_total: r.functions_total,
            functions_covered: r.functions_covered,
            functions_pct: r.functions_pct,
            branches_total: r.branches_total,
            branches_covered: r.branches_covered,
            branches_pct: r.branches_pct,
          }));
          const coverageMatrix = aggregateCoverageFromDb(asReleaseRows, payload.model);
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ coverageMatrix, coverageDiff: null }));
          return;
        }
      }

      // current_coverage が空 (import 未実行) の場合は他の current 系と同じく空を返す。
      // 旧 FS フォールバック (packages/*/coverage/coverage-final.json スキャン) は廃止し DB-only に統一。
      // これにより current 系の表示は「DB が単一の真実源」に一本化され、gitRoot 依存も解消する。
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ coverageMatrix: null, coverageDiff: null }));
    } catch (e) {
      this.logger.error('[/api/c4/coverage] failed', e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ coverageMatrix: null, coverageDiff: null }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/c4/file-analysis?repo=<name>&tag=<current|release>
  // -------------------------------------------------------------------------

  private async handleC4FileAnalysisEndpoint(
    res: http.ServerResponse,
    tag: string,
    repoName: string | undefined,
  ): Promise<void> {
    if (!repoName) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'repo query parameter is required' }));
      return;
    }
    try {
      const rows = tag === 'current'
        ? this.trailDb.getCurrentFileAnalysis(repoName)
        : this.trailDb.getReleaseFileAnalysis(tag, repoName);

      // C4 model 取得
      const store = this.trailDb.asC4ModelStore();
      const payload = await fetchC4Model(store, tag, repoName);
      const elements = payload?.model?.elements ?? [];

      // file → element 集約 (importance / deadCodeScore / centrality)
      const importanceFileScores: Record<string, number> = {};
      const deadCodeFileScores: Record<string, number> = {};
      const centralityFileScores: Record<string, number> = {};
      for (const r of rows) {
        importanceFileScores[r.filePath] = r.importanceScore;
        deadCodeFileScores[r.filePath] = r.deadCodeScore;
        centralityFileScores[r.filePath] = r.crossPkgInCount;
      }
      const importance = aggregateScoresToC4(importanceFileScores, elements);
      // dead-code-score は importance と同じく親要素にも伝播させ、
      // viewer 側で levelTargetType に応じてフィルタする（フレーム着色防止のため）
      const deadCode = aggregateScoresToC4(deadCodeFileScores, elements);
      const centrality = aggregateCentralityToC4(centralityFileScores, elements);

      // functionRoles 集計
      const fnRows = tag === 'current'
        ? this.trailDb.getCurrentFunctionAnalysis(repoName)
        : this.trailDb.getReleaseFunctionAnalysis(tag, repoName);
      const classified: ClassifiedFunction[] = fnRows.map((r) => ({
        filePath: r.filePath,
        functionName: r.functionName,
        role: r.functionRole,
      }));
      const functionRoles = aggregateRolesToC4(classified, elements);

      const entries = rows.map((r) => ({
        filePath: r.filePath,
        importanceScore: r.importanceScore,
        fanInTotal: r.fanInTotal,
        cognitiveComplexityMax: r.cognitiveComplexityMax,
        lineCount: r.lineCount,
        functionCount: r.functionCount,
        deadCodeScore: r.deadCodeScore,
        signals: r.signals,
        isIgnored: r.isIgnored,
        ignoreReason: r.ignoreReason,
        centralityScore: r.centralityScore,
        crossPkgInCount: r.crossPkgInCount,
        externalConsumerPkgs: r.externalConsumerPkgs,
        isBarrel: r.isBarrel,
        category: r.category,
        newlyActive: r.newlyActive,
      }));

      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({
        entries,
        elementMatrix: { importance, deadCodeScore: deadCode, centrality, functionRoles },
      }));
    } catch (err) {
      this.logger.error('[/api/c4/file-analysis] failed', err);
      sendServerError(res, 'file-analysis failed');
    }
  }

  private async handleC4FunctionAnalysisEndpoint(
    res: http.ServerResponse,
    tag: string,
    repoName: string | undefined,
  ): Promise<void> {
    if (!repoName) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'repo query parameter is required' }));
      return;
    }
    try {
      const rows = tag === 'current'
        ? this.trailDb.getCurrentFunctionAnalysis(repoName)
        : this.trailDb.getReleaseFunctionAnalysis(tag, repoName);

      const entries = rows.map((r) => ({
        filePath: r.filePath,
        functionName: r.functionName,
        startLine: r.startLine,
        endLine: r.endLine,
        language: r.language,
        fanIn: r.fanIn,
        fanOut: r.fanOut,
        distinctCallees: r.distinctCallees,
        cognitiveComplexity: r.cognitiveComplexity,
        dataMutationScore: r.dataMutationScore,
        sideEffectScore: r.sideEffectScore,
        lineCount: r.lineCount,
        importanceScore: r.importanceScore,
        functionRole: r.functionRole,
        signals: { fanInZero: r.signalFanInZero },
      }));

      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ entries }));
    } catch (err) {
      this.logger.error('[/api/c4/function-analysis] failed', err);
      sendServerError(res, 'function-analysis failed');
    }
  }

  private async handleC4ComplexityEndpoint(res: http.ServerResponse, repo?: string): Promise<void> {
    try {
      const repoName = repo ?? (this.defaultRepo());
      const store = this.trailDb.asC4ModelStore();
      const provider = this.getC4Provider?.();

      // Complexity は累積指標のため、C4 モデルは常に current を使用
      // (release で時間窓を切る意味がないため)
      const payload = await fetchC4Model(store, 'current', repoName, provider?.featureMatrix);
      const elements = payload?.model.elements ?? [];

      // メッセージから ComplexityMatrix を計算
      const rows = this.trailDb.getAllAssistantMessages();
      const messages: MessageInput[] = rows.map(row => {
        let toolCallNames: string[] = [];
        let editedFilePaths: string[] = [];
        if (row.tool_calls) {
          try {
            const calls = JSON.parse(String(row.tool_calls)) as { name?: string; input?: Record<string, unknown> }[];
            if (Array.isArray(calls)) {
              toolCallNames = calls.map(c => c.name ?? '').filter(Boolean);
              editedFilePaths = calls
                .filter(c => c.name === 'Edit' || c.name === 'Write')
                .map(c => (typeof c.input?.file_path === 'string' ? c.input.file_path : ''))
                .filter(Boolean);
            }
          } catch {
            // malformed tool_calls — skip
          }
        }
        return { outputTokens: Number(row.output_tokens), toolCallNames, editedFilePaths };
      });

      const complexityMatrix = computeComplexityMatrix(messages, elements);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ complexityMatrix }));
    } catch (e) {
      this.logger.error('[/api/c4/complexity] failed', e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ complexityMatrix: null }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/search?q=...
  // -------------------------------------------------------------------------

  private handleSearch(
    res: http.ServerResponse,
    query: string,
  ): void {
    if (!query.trim()) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Missing query parameter q' }));
      return;
    }

    try {
      const results = this.trailDb.searchMessages(query);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ results }));
    } catch (err) {
      this.logger.error('[/api/trail/search] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Search failed' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: POST /api/trail/refresh
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/prompts
  // -------------------------------------------------------------------------


  // -------------------------------------------------------------------------
  //  API: GET /api/trail/analytics
  // -------------------------------------------------------------------------

  private handleGetAnalytics(res: http.ServerResponse): void {
    try {
      const analytics: AnalyticsData = this.trailDb.getAnalytics();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(analytics));
    } catch (err) {
      this.logger.error('[/api/trail/analytics] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get analytics' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/cost-optimization
  // -------------------------------------------------------------------------

  private handleGetCostOptimization(res: http.ServerResponse): void {
    try {
      const data: CostOptimizationData = this.trailDb.getCostOptimization();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(data));
    } catch (err) {
      this.logger.error('[/api/trail/cost-optimization] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get cost optimization data' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/combined?period=day&rangeDays=30&workspace=<name>
  // -------------------------------------------------------------------------

  private handleGetCombined(res: http.ServerResponse, params: URLSearchParams): void {
    const period = (params.get('period') ?? 'day') as 'day' | 'week';
    const rangeDaysRaw = Number.parseInt(params.get('rangeDays') ?? '30', 10);
    const rangeDays = ([30, 90].includes(rangeDaysRaw) ? rangeDaysRaw : 30) as 30 | 90;
    // workspace: 正規化済みワークスペース名（未指定・空は全体集計）
    const workspaceRaw = params.get('workspace')?.trim();
    const workspace = workspaceRaw ? workspaceRaw : undefined;
    try {
      const data = this.trailDb.getCombinedData(period, rangeDays, workspace);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(data));
    } catch (e) {
      this.logger.error('handleGetCombined failed', e);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get combined data' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/quality-metrics?from=ISO&to=ISO
  // -------------------------------------------------------------------------

  private handleGetQualityMetrics(res: http.ServerResponse, params: URLSearchParams): void {
    const from = params.get('from');
    const to = params.get('to');
    if (!from || !to) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'from and to are required' }));
      return;
    }
    try {
      const metricsFile = this.options?.configPaths?.metricsThresholds;
      const loader = metricsFile
        ? MetricsThresholdsLoader.fromFile(metricsFile)
        : MetricsThresholdsLoader.fromWorkspaceRoot(this.gitRoot ?? process.cwd());
      const thresholds = loader.load();

      // Compute previous range (same duration before current range)
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      const duration = toMs - fromMs;
      const prevTo = new Date(fromMs - 1).toISOString();
      const prevFrom = new Date(fromMs - 1 - duration).toISOString();

      const raw = this.trailDb.getQualityMetricsInputs(from, to, prevFrom, prevTo);
      const tickets = readWorkspaceTickets(this.gitRoot ?? process.cwd(), (m) => this.logger.info(m));
      const metrics = computeQualityMetrics({ ...raw, tickets }, { from, to }, thresholds);

      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(metrics));
    } catch (e) {
      this.logger.error('handleGetQualityMetrics failed', e);
      sendServerError(res, 'Failed to get quality metrics');
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/deployment-frequency-quality?from=ISO&to=ISO&bucket=day|week
  // -------------------------------------------------------------------------

  private handleGetDeploymentFrequencyQuality(res: http.ServerResponse, params: URLSearchParams): void {
    const from = params.get('from');
    const to = params.get('to');
    const bucket: 'day' | 'week' = params.get('bucket') === 'week' ? 'week' : 'day';
    if (!from || !to) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'from and to are required' }));
      return;
    }
    try {
      const inputs = this.trailDb.getReleaseQualityInputs(from, to);
      const result = computeReleaseQualityTimeSeries(inputs, { from, to }, bucket);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
    } catch (e) {
      this.logger.error('handleGetDeploymentFrequencyQuality failed', e);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get deployment frequency quality' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/deployment-frequency?from=ISO&to=ISO&bucket=day|week
  // -------------------------------------------------------------------------

  private handleGetDeploymentFrequency(res: http.ServerResponse, params: URLSearchParams): void {
    const from = params.get('from');
    const to = params.get('to');
    const bucket: 'day' | 'week' = params.get('bucket') === 'week' ? 'week' : 'day';
    if (!from || !to) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'from and to are required' }));
      return;
    }
    try {
      const releases = this.trailDb.getReleasesInRange(from, to);
      const { timeSeries } = computeDeploymentFrequency(
        releases.map((r) => ({ tag_date: r.released_at })),
        { from, to },
        { from, to },
        bucket,
      );
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(timeSeries));
    } catch (e) {
      this.logger.error('handleGetDeploymentFrequency failed', e);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get deployment frequency' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/releases
  // -------------------------------------------------------------------------

  private handleGetReleases(res: http.ServerResponse): void {
    try {
      const rows = this.trailDb.getReleases();
      const releases = rows.map((row) => ({
        tag: row.tag,
        releasedAt: row.released_at,
        prevTag: row.prev_tag,
        repoName: row.repo_name ?? null,
        packageTags: JSON.parse(row.package_tags) as string[],
        commitCount: row.commit_count,
        filesChanged: row.files_changed,
        linesAdded: row.lines_added,
        linesDeleted: row.lines_deleted,
        // ReleasesPanel が release.totalLines.toLocaleString() を呼ぶため number で返す。
        // total_lines マイグレーション以前の行や未集計行では NULL になり得るので 0 にフォールバック。
        totalLines: row.total_lines ?? 0,
        featCount: row.feat_count,
        fixCount: row.fix_count,
        refactorCount: row.refactor_count,
        testCount: row.test_count,
        otherCount: row.other_count,
        affectedPackages: JSON.parse(row.affected_packages) as string[],
        durationDays: row.duration_days,
        releaseTimeMin: row.release_time_min ?? null,
      }));
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(releases));
    } catch (err) {
      this.logger.error('[/api/trail/releases] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get releases' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: POST /api/trail/refresh
  // -------------------------------------------------------------------------

  private handleRefresh(res: http.ServerResponse): void {
    // 監視 repo 一覧を持たない fallback パス。HTTP 経由 refresh は主リポジトリのみ対象。
    // multi-repo 取り込みは onAnalyzeAll 経由（extension.ts で resolveWatchedRepos を使う）に乗せる。
    const gitRoots = this.gitRoot ? [this.gitRoot] : undefined;
    this.trailDb
      .importAll(undefined, gitRoots, undefined, this.analyzeReleaseFn)
      .then((result) => {
        this.notifySessionsUpdated();
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(result));
      })
      .catch((err: unknown) => {
        this.logger.error('[/api/trail/refresh] importAll failed', err);
        res.writeHead(500, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'Refresh failed' }));
      });
  }

  // ---------------------------------------------------------------------------
  //  JSONL real-time token helpers
  // ---------------------------------------------------------------------------

  private static parseJsonlSession(jsonlPath: string): { contextTokens: number; turnCount: number; messageCount: number } {
    let contextTokens = 0;
    let turnCount = 0;
    let messageCount = 0;
    try {
      const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as { type?: string; message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } } };
          if (entry.type === 'user') {
            turnCount++;
            messageCount++;
          } else if (entry.type === 'assistant') {
            messageCount++;
            const u = entry.message?.usage;
            if (u !== undefined) {
              contextTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            }
          }
        } catch { /* skip malformed line */ }
      }
    } catch { /* ignore */ }
    return { contextTokens, turnCount, messageCount };
  }

  private static getSessionStatsFromJsonl(sessionId: string): { contextTokens: number; turnCount: number; messageCount: number } {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    try {
      for (const dir of fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
        const p = path.join(projectsDir, dir, `${sessionId}.jsonl`);
        if (fs.existsSync(p)) return TrailDataServer.parseJsonlSession(p);
      }
    } catch { /* ignore */ }
    return { contextTokens: 0, turnCount: 0, messageCount: 0 };
  }

  // 'sv-SE' ロケールは ISO 8601 互換の YYYY-MM-DD 形式を返す
  private static readonly jstDateFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  private static formatJstDate(ms: number): string {
    return TrailDataServer.jstDateFormatter.format(ms);
  }

  private getDailyTokensFromJsonl(): number {
    const DAILY_TOKENS_TTL_MS = 30_000;
    const now = Date.now();
    if (this.dailyTokensCache && now < this.dailyTokensCache.expiresAt) {
      return this.dailyTokensCache.value;
    }

    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const todayJst = TrailDataServer.formatJstDate(now);
    let total = 0;
    try {
      for (const dir of fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
        const dirPath = path.join(projectsDir, dir);
        for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'))) {
          const filePath = path.join(dirPath, file);
          const mtimeJst = TrailDataServer.formatJstDate(fs.statSync(filePath).mtimeMs);
          if (mtimeJst === todayJst) {
            total += TrailDataServer.parseJsonlSession(filePath).contextTokens;
          }
        }
      }
    } catch (err) {
      this.logger.warn(`[getDailyTokensFromJsonl] scan failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.dailyTokensCache = { value: total, expiresAt: now + DAILY_TOKENS_TTL_MS };
    return total;
  }

  private handleTokenBudget(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { sessionId } = JSON.parse(body) as { sessionId: string };
        if (!sessionId) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'sessionId required' }));
          return;
        }
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'Invalid sessionId' }));
          return;
        }

        const { contextTokens, turnCount, messageCount } = TrailDataServer.getSessionStatsFromJsonl(sessionId);
        const dbDaily = this.trailDb.getDailyTokensToday();
        const dailyTokens = dbDaily > 0 ? dbDaily : this.getDailyTokensFromJsonl();
        const { dailyLimitTokens, sessionLimitTokens, alertThresholdPct } = this.tokenBudgetConfig;

        const status: import('./types').TokenBudgetUpdatedMessage = {
          type: 'token-budget-updated',
          sessionId,
          sessionTokens: contextTokens,
          dailyTokens,
          dailyLimitTokens,
          sessionLimitTokens,
          alertThresholdPct,
          turnCount,
          messageCount,
        };

        const payload = JSON.stringify(status);
        for (const ws of this.clients) {
          ws.send(payload);
        }

        const threshold = alertThresholdPct / 100;
        const dailyExceeded = dailyLimitTokens !== null && dailyTokens >= dailyLimitTokens * threshold;
        const sessionExceeded = sessionLimitTokens !== null && contextTokens >= sessionLimitTokens * threshold;
        if (dailyExceeded || sessionExceeded) {
          this.onTokenBudgetExceeded?.(status);
        }

        // 応答に観測値を載せるのは、フック（~/.claude/scripts/session-hygiene.sh）が同じ値で
        // 衛生の閾値判定をするため。値を JSONL から二重に数え直すと、集計条件のずれが
        // 「viewer とフックで違う数字が出る」形で表面化する（T-17 / proposal
        // 20260805-session-hygiene-delegation-decay）。ok は既存クライアント互換のため残す。
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true, ...status }));
      } catch (err) {
        this.logger.warn(`[handleTokenBudget] non-critical error, returning ok anyway: ${err instanceof Error ? err.message : String(err)}`);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
      }
    });
  }

  private handleInsertMessageCommit(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { messageUuid, sessionId, commitHash, matchConfidence } = JSON.parse(body) as {
          messageUuid: string;
          sessionId: string;
          commitHash: string;
          matchConfidence: string;
        };
        if (!messageUuid || !sessionId || !commitHash) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'messageUuid, sessionId, commitHash required' }));
          return;
        }
        this.trailDb.insertMessageCommit({
          messageUuid,
          sessionId,
          commitHash,
          detectedAt: new Date().toISOString(),
          matchConfidence: (matchConfidence ?? 'realtime') as import('@anytime-markdown/trail-core').MessageCommitMatchConfidence,
        });
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        this.logger.error('upsertMessageCommit failed', e);
        sendServerError(res, 'upsertMessageCommit failed');
      }
    });
  }

  // -------------------------------------------------------------------------
  //  API: /api/trail/safe-points, /api/trail/emergency-log (Phase 5 S1)
  // -------------------------------------------------------------------------

  /**
   * 状態変更 POST の CSRF 対策。Content-Type: application/json を必須にすることで、
   * クロスサイトの「simple request」（text/plain 等・preflight 不要）を弾く。
   * application/json はブラウザに preflight を強制させ、CORS の origin 許可リストで遮断される。
   * 正規クライアント（フック curl・拡張の fetch）はいずれも application/json を送るため影響しない。
   */
  private requireJsonContentType(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const mediaType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
      res.writeHead(415, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
      return false;
    }
    return true;
  }

  private handleRecordSafePoint(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.requireJsonContentType(req, res)) {
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        const source = parsed['source'];
        if (
          typeof parsed['createdAt'] !== 'string' ||
          typeof parsed['commitHash'] !== 'string' ||
          parsed['commitHash'] === '' ||
          (source !== 'stop_hook' && source !== 'manual')
        ) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'createdAt, commitHash, source(stop_hook|manual) required' }));
          return;
        }
        this.trailDb.recordSafePoint({
          createdAt: parsed['createdAt'],
          commitHash: parsed['commitHash'],
          branch: typeof parsed['branch'] === 'string' ? parsed['branch'] : '',
          worktree: typeof parsed['worktree'] === 'string' ? parsed['worktree'] : '',
          label: typeof parsed['label'] === 'string' ? parsed['label'] : '',
          source,
          sessionId: typeof parsed['sessionId'] === 'string' && parsed['sessionId'] !== '' ? parsed['sessionId'] : null,
        });
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        this.logger.error('handleRecordSafePoint failed', e);
        sendServerError(res, 'Failed to record safe point');
      }
    });
  }

  private handleListSafePoints(res: http.ServerResponse, params: URLSearchParams): void {
    try {
      const limit = Number.parseInt(params.get('limit') ?? '100', 10);
      const safePoints = this.trailDb.listSafePoints(Number.isNaN(limit) ? 100 : limit);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ safePoints }));
    } catch (e) {
      this.logger.error('handleListSafePoints failed', e);
      sendServerError(res, 'Failed to list safe points');
    }
  }

  private static readonly EMERGENCY_EVENT_KINDS = new Set([
    'kill_switch_on',
    'kill_switch_off',
    'rollback_executed',
    'anomaly_detected',
    'section_lock_denied',
    'section_lock_tamper',
  ]);

  private static readonly EMERGENCY_ACTORS = new Set(['human', 'claude', 'agent']);

  private handleRecordEmergencyEvent(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.requireJsonContentType(req, res)) {
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        const event = parsed['event'];
        const actor = parsed['actor'] ?? 'human';
        if (
          typeof parsed['occurredAt'] !== 'string' ||
          typeof event !== 'string' ||
          !TrailDataServer.EMERGENCY_EVENT_KINDS.has(event) ||
          typeof actor !== 'string' ||
          !TrailDataServer.EMERGENCY_ACTORS.has(actor)
        ) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'occurredAt, event(kind), actor(human|claude|agent) required' }));
          return;
        }
        const detailJson = typeof parsed['detailJson'] === 'string' ? parsed['detailJson'] : '{}';
        this.trailDb.recordEmergencyEvent({
          occurredAt: parsed['occurredAt'],
          event: event as import('@anytime-markdown/trail-core').EmergencyEventKind,
          reason: typeof parsed['reason'] === 'string' ? parsed['reason'] : '',
          actor: actor as import('@anytime-markdown/trail-core').EmergencyActor,
          sessionId: typeof parsed['sessionId'] === 'string' && parsed['sessionId'] !== '' ? parsed['sessionId'] : null,
          detailJson,
        });
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        this.logger.error('handleRecordEmergencyEvent failed', e);
        sendServerError(res, 'Failed to record emergency event');
      }
    });
  }

  private handleListEmergencyEvents(res: http.ServerResponse, params: URLSearchParams): void {
    try {
      const limit = Number.parseInt(params.get('limit') ?? '100', 10);
      const events = this.trailDb.listEmergencyEvents(Number.isNaN(limit) ? 100 : limit);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ events }));
    } catch (e) {
      this.logger.error('handleListEmergencyEvents failed', e);
      sendServerError(res, 'Failed to list emergency events');
    }
  }

  // -------------------------------------------------------------------------
  //  API: /api/trail/flight-reviews (Phase 6 S1)
  // -------------------------------------------------------------------------

  /** transcript 読取の上限。超過時は集計せず最小行に縮退する（Stop フックの fail-open を保つ）。 */
  private static readonly FLIGHT_REVIEW_TRANSCRIPT_MAX_BYTES = 50 * 1024 * 1024;

  private handleRecordFlightReview(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.requireJsonContentType(req, res)) {
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        const sessionId = parsed['sessionId'];
        const endedAt = parsed['endedAt'];
        if (typeof sessionId !== 'string' || sessionId === '' || typeof endedAt !== 'string' || endedAt === '') {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'sessionId, endedAt required' }));
          return;
        }
        const transcriptPath = typeof parsed['transcriptPath'] === 'string' ? parsed['transcriptPath'] : '';
        const workspacePath = typeof parsed['cwd'] === 'string' ? parsed['cwd'] : '';
        const lines = this.readFlightTranscriptLines(transcriptPath);
        const aggregate = computeFlightOutcome(lines);
        this.trailDb.upsertFlightReviewFromMachine({
          sessionId,
          workspacePath,
          startedAt: aggregate.startedAt,
          endedAt: aggregate.endedAt ?? endedAt,
          durationSeconds: aggregate.durationSeconds,
          toolCallCount: aggregate.toolCallCount,
          toolFailureCount: aggregate.toolFailureCount,
          reworkCount: aggregate.reworkCount,
        });
        // Phase 6 S2: 自己評価と学習候補は付加情報。失敗しても機械集計行（主効果）は
        // 既に成立しているため、記録全体を失敗にしない（warn ログのみ）。
        try {
          const assessment = extractSelfAssessment(lines);
          if (assessment !== null) {
            this.trailDb.applySelfAssessmentToFlightReview(sessionId, assessment);
          }
          const feedbackEntries = this.trailDb.listUserFeedbackEntries({ sessionId });
          const candidates = extractLessonCandidates({ lines, feedbackEntries });
          if (candidates.length > 0) {
            this.trailDb.saveFlightReviewLessonCandidates(sessionId, candidates);
          }
        } catch (e) {
          this.logger.warn(`[handleRecordFlightReview] debrief enrichment failed for ${sessionId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        this.logger.error('handleRecordFlightReview failed', e);
        sendServerError(res, 'Failed to record flight review');
      }
    });
  }

  /**
   * transcript JSONL を行配列として読む（機械集計・自己評価抽出・学習候補抽出で共用）。
   * 読取不能・巨大ファイルは空配列に縮退する（最小行の記録は落とさない。FR-4）。
   */
  private readFlightTranscriptLines(transcriptPath: string): string[] {
    if (transcriptPath === '') {
      return [];
    }
    try {
      const stat = fs.statSync(transcriptPath);
      if (!stat.isFile() || stat.size > TrailDataServer.FLIGHT_REVIEW_TRANSCRIPT_MAX_BYTES) {
        this.logger.warn(`[handleRecordFlightReview] transcript skipped (size=${stat.size}): ${transcriptPath}`);
        return [];
      }
      return fs.readFileSync(transcriptPath, 'utf8').split('\n');
    } catch (e) {
      this.logger.warn(`[handleRecordFlightReview] transcript read failed: ${transcriptPath}: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  private handleRecordUserFeedback(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.requireJsonContentType(req, res)) {
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        const sessionId = parsed['sessionId'];
        const occurredAt = parsed['occurredAt'];
        const prompt = parsed['prompt'];
        if (
          typeof sessionId !== 'string' || sessionId === '' ||
          typeof occurredAt !== 'string' || occurredAt === '' ||
          typeof prompt !== 'string'
        ) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'sessionId, occurredAt, prompt required' }));
          return;
        }
        // 判定の正はサーバー側 detectUserFeedback。フックのプレフィルタと不一致なら破棄する
        const match = detectUserFeedback(prompt);
        if (match === null) {
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ ok: true, recorded: false }));
          return;
        }
        this.trailDb.recordUserFeedbackEntry({
          sessionId,
          occurredAt,
          promptExcerpt: prompt.slice(0, TrailDataServer.USER_FEEDBACK_EXCERPT_MAX_CHARS),
          matchedPattern: match.matchedPattern,
        });
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true, recorded: true }));
      } catch (e) {
        this.logger.error('handleRecordUserFeedback failed', e);
        sendServerError(res, 'Failed to record user feedback');
      }
    });
  }

  /** prompt_excerpt の保存上限（提示用の抜粋。全文は保存しない）。 */
  private static readonly USER_FEEDBACK_EXCERPT_MAX_CHARS = 500;

  private handleListUserFeedback(res: http.ServerResponse, params: URLSearchParams): void {
    try {
      const limit = Number.parseInt(params.get('limit') ?? '100', 10);
      const userFeedback = this.trailDb.listUserFeedbackEntries({
        sessionId: params.get('sessionId') ?? undefined,
        limit: Number.isNaN(limit) ? 100 : limit,
      });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ userFeedback }));
    } catch (e) {
      this.logger.error('handleListUserFeedback failed', e);
      sendServerError(res, 'Failed to list user feedback');
    }
  }

  // -------------------------------------------------------------------------
  //  API: /api/trail/acceptance (自律受入基盤 S5: 受入台帳)
  // -------------------------------------------------------------------------

  private static readonly ACCEPTANCE_ROUTES: string[] = ['auto', 'machine', 'human'];

  private static readonly ACCEPTANCE_VERDICTS: string[] = ['pass', 'fail', 'pending', 'not_run'];

  private static readonly ACCEPTANCE_DECIDED_BY: string[] = ['farm', 'human'];

  private static readonly ACCEPTANCE_NOTES_MAX_CHARS = 2000;

  /** 検証はサーバー側が正 — farm スクリプトの入力を境界と見なさない（flight-reviews と同方針）。 */
  private handleUpsertAcceptanceRecord(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.requireJsonContentType(req, res)) {
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        const commitSha = parsed['commitSha'];
        const route = parsed['route'];
        const verdict = parsed['verdict'];
        const decidedBy = parsed['decidedBy'];
        if (
          typeof commitSha !== 'string' || commitSha === '' ||
          typeof route !== 'string' || !TrailDataServer.ACCEPTANCE_ROUTES.includes(route) ||
          typeof verdict !== 'string' || !TrailDataServer.ACCEPTANCE_VERDICTS.includes(verdict) ||
          typeof decidedBy !== 'string' || !TrailDataServer.ACCEPTANCE_DECIDED_BY.includes(decidedBy)
        ) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'commitSha, route(auto|machine|human), verdict(pass|fail|pending|not_run), decidedBy(farm|human) required' }));
          return;
        }
        const failedTestsRaw = parsed['failedTests'];
        if (failedTestsRaw !== undefined && (!Array.isArray(failedTestsRaw) || failedTestsRaw.some((t) => typeof t !== 'string'))) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'failedTests must be string[]' }));
          return;
        }
        const notes = typeof parsed['notes'] === 'string' ? parsed['notes'].slice(0, TrailDataServer.ACCEPTANCE_NOTES_MAX_CHARS) : undefined;
        const quarantinedCountRaw = parsed['quarantinedCount'];
        this.trailDb.upsertAcceptanceRecord({
          commitSha,
          route: route as AcceptanceRoute,
          verdict: verdict as AcceptanceVerdict,
          decidedBy: decidedBy as AcceptanceDecidedBy,
          decidedAt: typeof parsed['decidedAt'] === 'string' && parsed['decidedAt'] !== '' ? parsed['decidedAt'] : null,
          repoName: typeof parsed['repoName'] === 'string' ? parsed['repoName'] : undefined,
          farmRunRef: typeof parsed['farmRunRef'] === 'string' ? parsed['farmRunRef'] : undefined,
          failedTests: failedTestsRaw as string[] | undefined,
          vrtDiff: parsed['vrtDiff'] === true,
          quarantinedCount: typeof quarantinedCountRaw === 'number' && Number.isFinite(quarantinedCountRaw) ? quarantinedCountRaw : undefined,
          notes,
        });
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        this.logger.error('handleUpsertAcceptanceRecord failed', e);
        sendServerError(res, 'Failed to record acceptance');
      }
    });
  }

  private handleListAcceptanceRecords(res: http.ServerResponse, params: URLSearchParams): void {
    try {
      const routeParam = params.get('route');
      if (routeParam !== null && !TrailDataServer.ACCEPTANCE_ROUTES.includes(routeParam)) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'invalid route' }));
        return;
      }
      const limit = Number.parseInt(params.get('limit') ?? '100', 10);
      const acceptanceRecords = this.trailDb.listAcceptanceRecords({
        commitSha: params.get('commitSha') ?? undefined,
        route: (routeParam as AcceptanceRoute | null) ?? undefined,
        since: params.get('since') ?? undefined,
        until: params.get('until') ?? undefined,
        // windowDays（1..365）と同様に境界を持たせる（増分蓄積テーブルのため上限必須）
        limit: Number.isNaN(limit) ? 100 : Math.min(Math.max(limit, 1), 1000),
      });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ acceptanceRecords }));
    } catch (e) {
      this.logger.error('handleListAcceptanceRecords failed', e);
      sendServerError(res, 'Failed to list acceptance records');
    }
  }

  private handleAcceptanceMissRate(res: http.ServerResponse, params: URLSearchParams): void {
    try {
      const windowDays = Number.parseInt(params.get('windowDays') ?? '14', 10);
      if (Number.isNaN(windowDays) || windowDays < 1 || windowDays > 365) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'windowDays must be 1..365' }));
        return;
      }
      const missRates = this.trailDb.computeAcceptanceMissRate(windowDays);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ missRates }));
    } catch (e) {
      this.logger.error('handleAcceptanceMissRate failed', e);
      sendServerError(res, 'Failed to compute acceptance miss rate');
    }
  }

  private handleListFlightReviews(res: http.ServerResponse, params: URLSearchParams): void {
    try {
      const outcomeParam = params.get('outcome');
      if (outcomeParam !== null && !TrailDataServer.FLIGHT_REVIEW_FILTER_OUTCOMES.includes(outcomeParam)) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'invalid outcome' }));
        return;
      }
      const limit = Number.parseInt(params.get('limit') ?? '100', 10);
      const flightReviews = this.trailDb.listFlightReviews({
        sessionId: params.get('sessionId') ?? undefined,
        since: params.get('since') ?? undefined,
        until: params.get('until') ?? undefined,
        outcome: (outcomeParam as FlightOutcome | null) ?? undefined,
        tag: params.get('tag') ?? undefined,
        limit: Number.isNaN(limit) ? 100 : limit,
      });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ flightReviews }));
    } catch (e) {
      this.logger.error('handleListFlightReviews failed', e);
      sendServerError(res, 'Failed to list flight reviews');
    }
  }

  // ---------------------------------------------------------------------------
  //  Flight Record: 指示（instructions）
  // ---------------------------------------------------------------------------

  private static readonly INSTRUCTION_SUMMARY_MAX_CHARS = 500;

  private static readonly INSTRUCTION_PROMPT_MAX_CHARS = 2000;

  private handleListInstructionRecords(res: http.ServerResponse, params: URLSearchParams): void {
    try {
      const outcomeParam = params.get('outcome');
      if (outcomeParam !== null && !TrailDataServer.FLIGHT_REVIEW_FILTER_OUTCOMES.includes(outcomeParam)) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'invalid outcome' }));
        return;
      }
      const limit = Number.parseInt(params.get('limit') ?? '100', 10);
      const instructions = this.trailDb.listInstructionRecords({
        since: params.get('since') ?? undefined,
        until: params.get('until') ?? undefined,
        outcome: (outcomeParam as FlightOutcome | null) ?? undefined,
        tag: params.get('tag') ?? undefined,
        workspacePath: params.get('workspacePath') ?? undefined,
        limit: Number.isNaN(limit) ? 100 : limit,
      });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ instructions }));
    } catch (e) {
      this.logger.error('handleListInstructionRecords failed', e);
      sendServerError(res, 'Failed to list instruction records');
    }
  }

  /** 継続宣言の候補（未完了の指示）。 */
  private handleListOpenInstructions(res: http.ServerResponse, params: URLSearchParams): void {
    try {
      const limit = Number.parseInt(params.get('limit') ?? '10', 10);
      const instructions = this.trailDb.listOpenInstructions(
        params.get('workspacePath') ?? undefined,
        Number.isNaN(limit) ? 10 : limit,
      );
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ instructions }));
    } catch (e) {
      this.logger.error('handleListOpenInstructions failed', e);
      sendServerError(res, 'Failed to list open instructions');
    }
  }

  private handleListInstructionSessions(res: http.ServerResponse, instructionId: string): void {
    try {
      const sessions = this.trailDb.listInstructionSessions(instructionId);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ sessions }));
    } catch (e) {
      this.logger.error('handleListInstructionSessions failed', e);
      sendServerError(res, 'Failed to list instruction sessions');
    }
  }

  /**
   * 指示の宣言（mode=new / continue / close）。
   * 検証はサーバー側が正 — MCP ツールの zod スキーマを境界と見なさない（flight-reviews と同方針）。
   */
  private handleDeclareInstruction(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.requireJsonContentType(req, res)) {
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        const mode = parsed['mode'];
        if (mode !== 'new' && mode !== 'continue' && mode !== 'close') {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'mode must be one of new|continue|close' }));
          return;
        }
        const now = new Date().toISOString();

        if (mode === 'close') {
          const instructionId = parsed['instructionId'];
          if (typeof instructionId !== 'string' || instructionId === '') {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'instructionId required' }));
            return;
          }
          if (!this.trailDb.closeInstruction(instructionId, now)) {
            res.writeHead(404, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'instruction not found' }));
            return;
          }
          this.trailDb.save();
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ ok: true, instructionId }));
          return;
        }

        const sessionId = parsed['sessionId'];
        if (typeof sessionId !== 'string' || sessionId === '') {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'sessionId required' }));
          return;
        }

        if (mode === 'continue') {
          const instructionId = parsed['instructionId'];
          if (typeof instructionId !== 'string' || instructionId === '') {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'instructionId required' }));
            return;
          }
          const declaredWorkspace = typeof parsed['workspacePath'] === 'string' ? parsed['workspacePath'] : '';
          if (!this.trailDb.continueInstruction({
            instructionId,
            sessionId,
            declaredAt: now,
            ...(declaredWorkspace === '' ? {} : { workspacePath: declaredWorkspace }),
          })) {
            // 存在しない指示・別ワークスペースの指示を黙って受け入れない
            // （取り違えた ID がそのまま台帳に増え、混入行は絞り込みでも落とせない）
            res.writeHead(404, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'instruction not found in this workspace' }));
            return;
          }
          this.trailDb.save();
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ ok: true, instructionId }));
          return;
        }

        const summary = parsed['summary'];
        if (typeof summary !== 'string' || summary.trim() === '') {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'summary required' }));
          return;
        }
        const workspacePath = typeof parsed['workspacePath'] === 'string' ? parsed['workspacePath'] : '';
        const providedId = parsed['instructionId'];
        const instructionId =
          typeof providedId === 'string' && providedId !== '' ? providedId : randomUUID();
        this.trailDb.openInstruction({
          id: instructionId,
          sessionId,
          workspacePath,
          workspaceName:
            typeof parsed['workspaceName'] === 'string' && parsed['workspaceName'] !== ''
              ? parsed['workspaceName']
              : path.basename(workspacePath),
          summary: summary.slice(0, TrailDataServer.INSTRUCTION_SUMMARY_MAX_CHARS),
          originPrompt:
            typeof parsed['originPrompt'] === 'string'
              ? parsed['originPrompt'].slice(0, TrailDataServer.INSTRUCTION_PROMPT_MAX_CHARS)
              : '',
          startedAt: now,
        });
        this.trailDb.save();
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true, instructionId }));
      } catch (e) {
        this.logger.error('handleDeclareInstruction failed', e);
        sendServerError(res, 'Failed to declare instruction');
      }
    });
  }

  /** GET フィルタで受け付ける outcome（unknown を含む全 enum。手動訂正の入力とは別物）。 */
  private static readonly FLIGHT_REVIEW_FILTER_OUTCOMES: string[] = [
    'achieved',
    'partial',
    'unachieved',
    'unknown',
  ];

  /** 手動訂正（PATCH）で受け付ける outcome。unknown へ戻す操作は提供しない（FlightReviewManualPatch と同期）。 */
  private static readonly FLIGHT_REVIEW_MANUAL_OUTCOMES: string[] = ['achieved', 'partial', 'unachieved'];

  /** Rationale Audit（S4）で受け付ける監査ステータス（RationaleAuditStatus と同期）。 */
  private static readonly FLIGHT_REVIEW_AUDIT_STATUSES: string[] = ['unaudited', 'valid', 'needs_fix', 'rejected'];

  private static readonly FLIGHT_REVIEW_NOTES_MAX_CHARS = 2000;

  private static readonly FLIGHT_REVIEW_TAGS_MAX_COUNT = 50;

  private static readonly FLIGHT_REVIEW_TAG_MAX_CHARS = 200;

  /**
   * Phase 6 S3: 手動訂正（Manual Outcome Tagging）。
   * 検証はサーバー側が正 — UI の select 制約を境界と見なさない（localhost バインドは根拠にならない）。
   */
  private handleUpdateFlightReviewManual(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    sessionId: string,
  ): void {
    if (!this.requireJsonContentType(req, res)) {
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        const patch: FlightReviewManualPatch = {};
        const outcome = parsed['outcome'];
        if (outcome !== undefined) {
          if (typeof outcome !== 'string' || !TrailDataServer.FLIGHT_REVIEW_MANUAL_OUTCOMES.includes(outcome)) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'invalid outcome' }));
            return;
          }
          patch.outcome = outcome as FlightReviewManualPatch['outcome'];
        }
        const tags = parsed['tags'];
        if (tags !== undefined) {
          const valid =
            Array.isArray(tags) &&
            tags.length <= TrailDataServer.FLIGHT_REVIEW_TAGS_MAX_COUNT &&
            tags.every(
              (t) => typeof t === 'string' && t.length > 0 && t.length <= TrailDataServer.FLIGHT_REVIEW_TAG_MAX_CHARS,
            );
          if (!valid) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'invalid tags' }));
            return;
          }
          patch.tags = tags as string[];
        }
        const notes = parsed['notes'];
        if (notes !== undefined) {
          if (typeof notes !== 'string' || notes.length > TrailDataServer.FLIGHT_REVIEW_NOTES_MAX_CHARS) {
            res.writeHead(400, JSON_HEADERS);
            res.end(JSON.stringify({ error: 'invalid notes' }));
            return;
          }
          patch.notes = notes;
        }
        // Rationale Audit（S4）: outcome 系とは別経路で適用する（outcome_source を manual 化しない）
        const auditStatus = parsed['rationaleAuditStatus'];
        if (auditStatus !== undefined && (typeof auditStatus !== 'string' || !TrailDataServer.FLIGHT_REVIEW_AUDIT_STATUSES.includes(auditStatus))) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'invalid rationaleAuditStatus' }));
          return;
        }
        const hasManualField = patch.outcome !== undefined || patch.tags !== undefined || patch.notes !== undefined;
        if (!hasManualField && auditStatus === undefined) {
          res.writeHead(400, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'no updatable field (outcome / tags / notes / rationaleAuditStatus)' }));
          return;
        }
        const manualOk = hasManualField ? this.trailDb.updateFlightReviewManual(sessionId, patch) : true;
        const auditOk = auditStatus !== undefined
          ? this.trailDb.markRationaleAudit(sessionId, auditStatus as RationaleAuditStatus)
          : true;
        if (!manualOk || !auditOk) {
          res.writeHead(404, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'flight review not found' }));
          return;
        }
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        this.logger.error('handleUpdateFlightReviewManual failed', e);
        sendServerError(res, 'Failed to update flight review');
      }
    });
  }

  // -------------------------------------------------------------------------
  //  C4 WebSocket handling
  // -------------------------------------------------------------------------

  private sendC4CurrentState(ws: WebSocket): void {
    const provider = this.getC4Provider?.();

    if (provider) {
      const dsmMsg = this.buildDsmMessage(provider);
      if (dsmMsg) {
        ws.send(JSON.stringify(dsmMsg));
      }
    }

    const currentDocLinks = this.docsApi.getCurrent();
    if (currentDocLinks.length > 0) {
      const docMsg: ServerMessage = { type: 'doc-links-updated', docLinks: currentDocLinks };
      ws.send(JSON.stringify(docMsg));
    }

    if (this.lastClaudeActivity) {
      const activityMsg: ServerMessage = {
        type: 'claude-activity-updated',
        activeElementIds: this.lastClaudeActivity.activeElementIds,
        touchedElementIds: this.lastClaudeActivity.touchedElementIds,
        plannedElementIds: this.lastClaudeActivity.plannedElementIds,
      };
      ws.send(JSON.stringify(activityMsg));
    }

    if (this.lastMultiAgentActivity && this.lastMultiAgentActivity.agents.length > 0) {
      const multiMsg: ServerMessage = {
        type: 'multi-agent-activity-updated',
        agents: this.lastMultiAgentActivity.agents,
        conflicts: this.lastMultiAgentActivity.conflicts,
      };
      ws.send(JSON.stringify(multiMsg));
    }
  }

  private handleWsMessage(data: unknown, ws?: WebSocket): void {
    const parsed = this.parseWsClientMessage(data);
    if (!parsed) return;

    // provider 不要のメッセージは先に処理する。
    // C4Panel 撤去後 setC4Provider を呼ぶ箇所が無く provider が常に undefined のため、
    // ファイルを開くだけのコマンドを provider 必須ロジックに巻き込まれて drop させない。
    switch (parsed.type) {
      case 'chat.send':
        if (this.chatBridge && ws) void this.chatBridge.handleSend(parsed.query, ws);
        return;
      case 'chat.abort':
        this.chatBridge?.handleAbort();
        return;
      case 'provider.recheck':
        void this.chatBridge?.recheck([...this.clients]);
        return;
      case 'generate-code-graph':
        this.handleWsGenerateCodeGraph();
        return;
      case 'open-doc-link':
        this.onOpenDocLink?.(parsed.path);
        return;
      case 'open-file':
        this.onOpenFile?.(parsed.filePath, typeof parsed.line === 'number' ? parsed.line : undefined);
        return;
      case 'add-note-page':
        this.onAddNotePage?.({ title: parsed.title, contextMarkdown: parsed.contextMarkdown, imageDataUrl: parsed.imageDataUrl });
        return;
      case 'perf-report':
        // TRAIL_DEBUG_PERF=1 の時のみ OutputChannel に出力（既定で常時 silent）
        this.logger.debug('[perf-report]', { metric: String(parsed.metric), ms: Number(parsed.ms) });
        return;
    }

    // provider 必須メッセージ: provider が無ければ drop
    const provider = this.getC4Provider?.();
    if (!provider) return;
    switch (parsed.type) {
      case 'set-level':
        provider.handleSetDsmLevel(parsed.level);
        return;
      case 'cluster':
        provider.handleCluster(parsed.enabled);
        return;
      case 'refresh':
        provider.handleRefresh();
        return;
      case 'reset-claude-activity':
        provider.handleResetClaudeActivity();
        return;
    }
  }

  private parseWsClientMessage(data: unknown): ClientMessage | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return null;
    }
    return isClientMessage(parsed) ? parsed : null;
  }

  private handleWsGenerateCodeGraph(): void {
    if (!this.codeGraphService) return;
    void this.codeGraphService
      .generate((phase, percent) => this.notifyCodeGraphProgress(phase, percent))
      .then(() => this.notifyCodeGraphUpdated())
      .catch((err) => this.logger.error('Failed to generate code graph', err));
  }

  notifyClaudeActivity(
    activeElementIds: readonly string[],
    touchedElementIds: readonly string[],
    plannedElementIds: readonly string[],
  ): void {
    this.lastClaudeActivity = { activeElementIds, touchedElementIds, plannedElementIds };
    if (this.clients.size === 0) return;
    const message: ServerMessage = {
      type: 'claude-activity-updated',
      activeElementIds,
      touchedElementIds,
      plannedElementIds,
    };
    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      ws.send(payload);
    }
  }

  notifyMultiAgentActivity(agents: readonly import('./types').AgentActivityEntry[], conflicts: readonly import('./types').FileConflict[]): void {
    this.lastMultiAgentActivity = { agents, conflicts };
    if (this.clients.size === 0) return;
    const message: ServerMessage = {
      type: 'multi-agent-activity-updated',
      agents,
      conflicts,
    };
    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      ws.send(payload);
    }
  }

  // -------------------------------------------------------------------------
  //  C4 notification message builders
  // -------------------------------------------------------------------------

  private buildNotifyMessage(
    type: 'dsm-updated',
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    return this.buildDsmMessage(provider);
  }

  private buildDsmMessage(
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    const matrix = provider.sourceMatrix;
    if (!matrix) return undefined;
    return { type: 'dsm-updated', matrix };
  }

  /** model / trailGraph を SQLite およびプロバイダから取得 */
  private async resolveModelAndGraph(): Promise<{ model: import('@anytime-markdown/trail-core/c4').C4Model; graph: import('@anytime-markdown/trail-core').TrailGraph } | null> {
    const provider = this.getC4Provider?.();
    const repoName = this.defaultRepo();

    const store = this.trailDb.asC4ModelStore();
    const payload = await fetchC4Model(store, 'current', repoName, provider?.featureMatrix);
    const model = payload?.model;

    const graph = provider?.trailGraph ?? (this.trailDb.getCurrentGraph(repoName) ?? undefined);

    if (!model || !graph) return null;
    return { model, graph };
  }

  /** analyze-child.js の絶対パス。対話的ソース解析（typescript）を child へ委譲するため使う。 */
  private analyzeChildScriptPath(): string {
    return path.join(this.distPath, 'analyze-child.js');
  }

  /**
   * projectRoot 配下の code 要素ノードのソースを読み、`{filePath, content}[]` を返す。
   * createSourceFile（typescript）は呼ばず、child へ渡すための内容収集のみ行う。
   */
  private readComponentSourceFiles(
    graph: import('@anytime-markdown/trail-core').TrailGraph,
    nodeFilter: (nodeId: string) => boolean,
    logTag: string,
  ): C4SourceFileInput[] {
    const { projectRoot } = graph.metadata;
    const normalizedRoot = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;
    const files: C4SourceFileInput[] = [];
    for (const node of graph.nodes) {
      if (!nodeFilter(node.id)) continue;
      const absolutePath = path.resolve(projectRoot, node.filePath);
      if (!absolutePath.startsWith(normalizedRoot)) {
        this.logger.warn(`[${logTag}] path traversal blocked: ${node.filePath}`);
        continue;
      }
      try {
        files.push({ filePath: node.filePath, content: fs.readFileSync(absolutePath, 'utf-8') });
      } catch (e) {
        this.logger.error(`[${logTag}] failed to read file: ${node.filePath}`, e);
      }
    }
    return files;
  }

  private async handleC4ExportsEndpoint(
    res: http.ServerResponse,
    componentId: string,
  ): Promise<void> {
    try {
      const resolved = await this.resolveModelAndGraph();

      if (!resolved) {
        this.logger.warn(`[/api/c4/exports] model or graph not available for componentId=${componentId}`);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ symbols: [] }));
        return;
      }

      const { model, graph } = resolved;
      const codeElementIds = new Set(
        model.elements
          .filter(el => el.type === 'code' && el.boundaryId === componentId)
          .map(el => el.id),
      );
      const files = this.readComponentSourceFiles(graph, id => codeElementIds.has(id), '/api/c4/exports');

      // createSourceFile + ExportExtractor は typescript 依存のため analyze-child へ委譲する。
      const result = await runC4SourceAnalyze(this.analyzeChildScriptPath(), {
        kind: 'exports',
        files,
        componentId,
      });
      const symbols = result.kind === 'exports' ? result.symbols : [];
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ symbols }));
    } catch (e) {
      this.logger.error(`[/api/c4/exports] error: componentId=${componentId}`, e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ symbols: [] }));
    }
  }

  private async handleC4FunctionsEndpoint(
    res: http.ServerResponse,
    elementId: string,
  ): Promise<void> {
    try {
      if (!elementId) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'elementId is required' }));
        return;
      }
      const resolved = await this.resolveModelAndGraph();
      if (!resolved) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ symbols: [] }));
        return;
      }
      const { graph } = resolved;
      const { projectRoot } = graph.metadata;
      const node = graph.nodes.find(n => n.id === elementId);
      if (!node) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ symbols: [] }));
        return;
      }
      const normalizedRoot = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;
      const absolutePath = path.resolve(projectRoot, node.filePath);
      if (!absolutePath.startsWith(normalizedRoot)) {
        this.logger.warn(`[/api/c4/functions] path traversal blocked: ${node.filePath}`);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ symbols: [] }));
        return;
      }
      let content: string;
      try {
        content = fs.readFileSync(absolutePath, 'utf-8');
      } catch (e) {
        this.logger.error(`[/api/c4/functions] failed to read file: ${node.filePath}`, e);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ symbols: [] }));
        return;
      }
      // Python は tree-sitter ベースの PythonExportExtractor（typescript 非依存、daemon 内で実行）、
      // それ以外は TS の ExportExtractor を analyze-child へ委譲する。
      let symbols: readonly unknown[];
      if (node.filePath.endsWith('.py')) {
        const { createPythonParser, PythonExportExtractor } = await import('@anytime-markdown/code-analysis-python');
        const parser = await createPythonParser(this.codeGraphService?.getPythonWasmPath());
        const tree = parser.parse(content);
        symbols = tree ? PythonExportExtractor.extract(node.filePath, tree.rootNode) : [];
        tree?.delete();
      } else {
        const result = await runC4SourceAnalyze(this.analyzeChildScriptPath(), {
          kind: 'exports',
          files: [{ filePath: node.filePath, content }],
          componentId: elementId,
        });
        symbols = result.kind === 'exports' ? result.symbols : [];
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ symbols }));
    } catch (e) {
      this.logger.error(`[/api/c4/functions] error: elementId=${elementId}`, e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ symbols: [] }));
    }
  }

  private async handleC4FunctionGraphEndpoint(
    res: http.ServerResponse,
    elementId: string,
  ): Promise<void> {
    try {
      if (!elementId) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'elementId is required' }));
        return;
      }
      const resolved = await this.resolveModelAndGraph();
      if (!resolved) {
        this.logger.warn(`[/api/c4/function-graph] model or graph not available for elementId=${elementId}`);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ elementId, nodes: [], edges: [] }));
        return;
      }
      const { model, graph } = resolved;
      const { filterTrailGraphByElement } = await import('@anytime-markdown/trail-core/c4');
      const out = filterTrailGraphByElement(graph, elementId, model);
      if (out.nodes.length === 0) {
        this.logger.warn(`[/api/c4/function-graph] empty result for elementId=${elementId}`);
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(out));
    } catch (e) {
      this.logger.error(`[/api/c4/function-graph] error: elementId=${elementId}`, e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ elementId, nodes: [], edges: [] }));
    }
  }

  private async handleC4FlowchartEndpoint(
    res: http.ServerResponse,
    componentId: string,
    symbolId: string,
    type: 'control' | 'call',
  ): Promise<void> {
    const EMPTY_GRAPH = { nodes: [], edges: [] };
    try {
      const resolved = await this.resolveModelAndGraph();

      if (!resolved) {
        this.logger.warn(`[/api/c4/flowchart] model or graph not available for componentId=${componentId}`);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ graph: EMPTY_GRAPH }));
        return;
      }

      const { model, graph } = resolved;
      const codeElementIds = new Set(
        model.elements
          .filter(el => el.type === 'code' && el.boundaryId === componentId)
          .map(el => el.id),
      );
      const files = this.readComponentSourceFiles(graph, id => codeElementIds.has(id), '/api/c4/flowchart');

      // FlowAnalyzer / createSourceFile は typescript 依存のため analyze-child へ委譲する。
      const result =
        type === 'control'
          ? await runC4SourceAnalyze(this.analyzeChildScriptPath(), {
              kind: 'flowchartControl',
              files,
              filePart: symbolId.split('::')[0],
              funcName: symbolId.split('::').at(-1) ?? '',
            })
          : await runC4SourceAnalyze(this.analyzeChildScriptPath(), {
              kind: 'flowchartCall',
              files,
              symbolId,
            });
      const flowGraph = result.kind === 'flowchart' ? result.graph : EMPTY_GRAPH;

      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ graph: flowGraph }));
    } catch (e) {
      this.logger.error(`[/api/c4/flowchart] error: componentId=${componentId}, symbolId=${symbolId}`, e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ graph: EMPTY_GRAPH }));
    }
  }

  private async handleC4SequenceEndpoint(
    res: http.ServerResponse,
    elementId: string,
  ): Promise<void> {
    const emptyModel = {
      version: 1 as const,
      rootElementId: elementId,
      participants: [],
      root: { kind: 'sequence' as const, steps: [] },
    };
    try {
      if (!elementId) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'elementId is required' }));
        return;
      }

      const resolved = await this.resolveModelAndGraph();
      if (!resolved) {
        this.logger.warn(`[/api/c4/sequence] model or graph not available for elementId=${elementId}`);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(emptyModel));
        return;
      }

      const { model, graph } = resolved;

      // 起点要素 + In/Out 関連要素配下の code 要素を全部対象にしてソースを読む
      const involvedComponentIds = new Set<string>([elementId]);
      for (const r of model.relationships) {
        if (r.from === elementId) involvedComponentIds.add(r.to);
        if (r.to === elementId) involvedComponentIds.add(r.from);
      }
      const codeElementIds = new Set(
        model.elements
          .filter(el => el.type === 'code' && el.boundaryId !== undefined && involvedComponentIds.has(el.boundaryId))
          .map(el => el.id),
      );
      const files = this.readComponentSourceFiles(graph, id => codeElementIds.has(id), '/api/c4/sequence');

      // SequenceAnalyzer / createSourceFile は typescript 依存のため analyze-child へ委譲する。
      const result = await runC4SourceAnalyze(this.analyzeChildScriptPath(), {
        kind: 'sequence',
        files,
        elementId,
        model,
        graph,
      });
      const sequenceModel = result.kind === 'sequence' ? result.model : emptyModel;
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(sequenceModel));
    } catch (e) {
      this.logger.error(`[/api/c4/sequence] error: elementId=${elementId}`, e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(emptyModel));
    }
  }

  private getOrBuildCallHierarchyIndex(repoName: string | undefined): CallHierarchyIndex | null {
    if (this.callHierarchyIndex && this.callHierarchyIndexRepo === repoName) {
      return this.callHierarchyIndex;
    }
    const provider = this.getC4Provider?.();
    const graph = provider?.trailGraph ?? this.trailDb.getCurrentGraph(repoName) ?? undefined;
    if (!graph) return null;
    this.callHierarchyIndex = buildCallHierarchyIndex({
      nodes: graph.nodes,
      edges: graph.edges,
    });
    this.callHierarchyIndexRepo = repoName;
    return this.callHierarchyIndex;
  }

  private handleCallHierarchyEndpoint(
    res: http.ServerResponse,
    params: Readonly<{
      file: string;
      fn: string;
      direction: string;
      depthParam: string | null;
      lineParam: string | null;
      scope: string;
      excludeTests: boolean;
    }>,
  ): void {
    const { file, fn, direction, depthParam, lineParam, scope, excludeTests } = params;
    try {
      if (!file || !fn) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'file and fn query params are required' }));
        return;
      }
      if (direction !== 'callers' && direction !== 'callees') {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'direction must be callers or callees' }));
        return;
      }
      if (scope !== 'project' && scope !== 'package' && scope !== 'file') {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'scope must be project, package, or file' }));
        return;
      }
      const depth = clampInt(depthParam, 1, 0, 10);
      const requestedLine = lineParam !== null && lineParam !== '' ? Number.parseInt(lineParam, 10) : undefined;

      const repoName = this.defaultRepo();
      const index = this.getOrBuildCallHierarchyIndex(repoName);
      if (!index) {
        res.writeHead(503, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'graph not available' }));
        return;
      }

      let target: { id: string; filePath: string } | undefined;
      let fallback: { id: string; filePath: string } | undefined;
      for (const node of index.nodes.values()) {
        if (node.type !== 'function') continue;
        if (node.filePath !== file) continue;
        if (node.label !== fn) continue;
        if (typeof requestedLine === 'number' && Number.isFinite(requestedLine)) {
          if (node.line === requestedLine) {
            target = node;
            break;
          }
          fallback ??= node;
        } else {
          target = node;
          break;
        }
      }
      target ??= fallback;

      if (!target) {
        res.writeHead(404, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'function not found', file, fn }));
        return;
      }

      const nodeFilter = buildCallHierarchyNodeFilter({
        scope: scope as CallHierarchyScope,
        excludeTests,
        rootFilePath: target.filePath,
      });

      const tree = traverseCallHierarchy(
        index,
        target.id,
        direction as CallHierarchyDirection,
        depth,
        nodeFilter ? { nodeFilter } : undefined,
      );
      if (!tree) {
        res.writeHead(404, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'function not in index' }));
        return;
      }

      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(tree));
    } catch (e) {
      this.logger.error('[/api/c4/call-hierarchy] failed', e);
      sendServerError(res, 'call-hierarchy failed');
    }
  }

  /**
   * codeGraphService の in-memory cache を最新の DB 状態で再構築する。
   * MCP/HTTP 経由でコミュニティ name/summary/mappings_json が更新されたとき、
   * 直接 sql.js の DB ファイルが書き換わったとしても、
   * 拡張プロセスの cached graph は変わらないため、明示的に load し直す必要がある。
   * 失敗してもレスポンスは成功扱い（cache 不整合でも DB は正しいため、Reload で復帰可能）。
   */
  private async refreshCodeGraphCache(repoName?: string): Promise<void> {
    if (!this.codeGraphService) return;
    try {
      await this.codeGraphService.loadFromDb(repoName);
    } catch (err) {
      const repoSuffix = repoName ? `(${repoName})` : '';
      this.logger.warn(`[community-upsert] cache compose failed (loadFromDb${repoSuffix}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -------------------------------------------------------------------------
  //  Analyze pipeline handlers (POST /api/analyze/*)
  // -------------------------------------------------------------------------

  private async handleAnalyzeCurrent(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (!this.onAnalyzeCurrentCode) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analyze handler not registered' }));
      return;
    }
    if (this.analysisInProgress) {
      res.writeHead(409, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analysis in progress', current: this.analysisInProgress }));
      return;
    }
    let body: { workspacePath?: string; tsconfigPath?: string } = {};
    try {
      const parsed = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      if (typeof parsed.workspacePath === 'string') body.workspacePath = parsed.workspacePath;
      if (typeof parsed.tsconfigPath === 'string') body.tsconfigPath = parsed.tsconfigPath;
    } catch {
      // 空 body 許容（全引数省略時はサーバー側で workspacePath を解決）
      body = {};
    }
    this.analysisInProgress = { kind: 'current', startedAt: Date.now() };
    try {
      const result = await this.onAnalyzeCurrentCode(body);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
    } catch (err) {
      this.logger.error('handleAnalyzeCurrent failed', err);
      sendServerError(res, 'analyze current failed');
    } finally {
      this.analysisInProgress = null;
    }
  }

  private async handleAnalyzeRelease(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (!this.onAnalyzeReleaseCode) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analyze handler not registered' }));
      return;
    }
    if (this.analysisInProgress) {
      res.writeHead(409, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analysis in progress', current: this.analysisInProgress }));
      return;
    }
    // tags は外部入力。文字列配列でなければ「指定なし（全量）」ではなく 400 で弾く。
    // 型を取り違えた要求を黙って全量洗い替えへ落とすと、既存グラフを消してしまう。
    // 壊れた JSON も同じ理由で 400 にする（空ボディだけが「指定なし」を意味する）。
    let tags: readonly string[] | undefined;
    let parsed: Record<string, unknown>;
    try {
      parsed = await this.readJsonObjectBodyAllowEmpty(req);
    } catch (err) {
      this.logger.warn(
        `[/api/analyze/release] invalid JSON body: ${err instanceof Error ? err.message : String(err)}`,
      );
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'invalid JSON body' }));
      return;
    }
    if (parsed.tags !== undefined) {
      if (!Array.isArray(parsed.tags) || parsed.tags.some((t) => typeof t !== 'string' || t === '')) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'tags must be an array of non-empty strings' }));
        return;
      }
      tags = parsed.tags as string[];
    }
    this.analysisInProgress = { kind: 'release', startedAt: Date.now() };
    try {
      const result = await this.onAnalyzeReleaseCode({ tags });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
    } catch (err) {
      this.logger.error('handleAnalyzeRelease failed', err);
      sendServerError(res, 'analyze release failed');
    } finally {
      this.analysisInProgress = null;
    }
  }

  /**
   * POST /api/analyze/commit — 1 コミット分のコードグラフを生成する。
   *
   * `sha` / `repo` はどちらも必須。省略を「現在の断面」や「既定リポジトリ」へ縮退させない
   * （release 側で同種の縮退が既存キャッシュの全消去を招いた）。
   */
  private async handleAnalyzeCommit(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (!this.onAnalyzeCommitCode) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analyze handler not registered' }));
      return;
    }
    if (this.analysisInProgress) {
      res.writeHead(409, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analysis in progress', current: this.analysisInProgress }));
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = await this.readJsonObjectBodyAllowEmpty(req);
    } catch (err) {
      this.logger.warn(
        `[/api/analyze/commit] invalid JSON body: ${err instanceof Error ? err.message : String(err)}`,
      );
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'invalid JSON body' }));
      return;
    }
    const { sha, repo } = parsed;
    if (typeof sha !== 'string' || sha === '' || typeof repo !== 'string' || repo === '') {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'sha and repo must be non-empty strings' }));
      return;
    }
    // sha は git へそのまま渡り worktree のパスにもなる。オプション風の文字列やパス区切りを
    // 通すと ref 解決とパス生成の双方で意図しない挙動になるため、16 進の commit hash に限る。
    if (!/^[0-9a-f]{7,40}$/.test(sha)) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'sha must be a hexadecimal commit hash' }));
      return;
    }
    this.analysisInProgress = { kind: 'commit', startedAt: Date.now() };
    try {
      const result = await this.onAnalyzeCommitCode({ sha, repo });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
    } catch (err) {
      // 構成に無い repo は要求側の誤りで、再試行しても成功しない。サーバ障害（500）と
      // 区別して 400 で返す（UI が「別の解析が走っている」等と誤って案内しないため）。
      if (err instanceof UnknownRepoError) {
        this.logger.warn(`[/api/analyze/commit] unknown repo: ${repo}`);
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: `unknown repo: ${repo}` }));
        return;
      }
      this.logger.error('handleAnalyzeCommit failed', err);
      sendServerError(res, 'analyze commit failed');
    } finally {
      this.analysisInProgress = null;
    }
  }

  private async handleAnalyzeAll(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (!this.onAnalyzeAll) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analyze handler not registered' }));
      return;
    }
    if (this.analysisInProgress) {
      res.writeHead(409, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analysis in progress', current: this.analysisInProgress }));
      return;
    }
    this.analysisInProgress = { kind: 'all', startedAt: Date.now() };
    try {
      const result = await this.onAnalyzeAll();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
    } catch (err) {
      this.logger.error('handleAnalyzeAll failed', err);
      sendServerError(res, 'analyze all failed');
    } finally {
      this.analysisInProgress = null;
    }
  }

  private handleAnalyzeStatus(res: http.ServerResponse): void {
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ inProgress: this.analysisInProgress }));
  }

  private async handleAnalyzeAllPause(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    if (!this.analyzeAllRunner) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analyze-all runner not registered' }));
      return;
    }
    let by = 'http-api';
    try {
      const parsed = (await this.readJsonBody(req).catch(() => ({}))) as Record<string, unknown>;
      if (typeof parsed.by === 'string' && parsed.by.length > 0) by = parsed.by;
    } catch {
      // 空 body 許容
    }
    try {
      const status = await this.analyzeAllRunner.pause(by);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(status));
    } catch (err) {
      this.logger.error('handleAnalyzeAllPause failed', err);
      sendServerError(res, 'analyze-all pause failed');
    }
  }

  private async handleAnalyzeAllResume(res: http.ServerResponse): Promise<void> {
    if (!this.analyzeAllRunner) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analyze-all runner not registered' }));
      return;
    }
    try {
      const status = await this.analyzeAllRunner.resume();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(status));
    } catch (err) {
      this.logger.error('handleAnalyzeAllResume failed', err);
      sendServerError(res, 'analyze-all resume failed');
    }
  }

  private handleAnalyzeAllStatus(res: http.ServerResponse): void {
    if (!this.analyzeAllRunner) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'analyze-all runner not registered' }));
      return;
    }
    const status = this.analyzeAllRunner.getStatus();
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(status));
  }

  private handlePostLogsRoute(req: http.IncomingMessage, res: http.ServerResponse): void {
    const logService = this.logService;
    if (!logService) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'log service not registered' }));
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      const result = handlePostLogs(body, logService);
      const headers = result.headers ?? {};
      res.writeHead(result.status, headers);
      if (result.body) res.end(result.body);
      else res.end();
    });
    req.on('error', (err) => {
      this.logger.error('handlePostLogsRoute request error', err);
      try {
        res.writeHead(500, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'request error' }));
      } catch {
        // best-effort
      }
    });
  }

  /**
   * ボディを JSON オブジェクトとして読む。**空ボディは `{}`、非空でパースできなければ throw** する。
   *
   * `readJsonBody` は `JSON.parse('')` が投げるため空ボディも reject し、呼び出し側は
   * `.catch(() => ({}))` で「指定が無い」と「壊れた指定」を同一視せざるを得ない。既定が
   * 破壊的な側（全量洗い替え）に倒れるエンドポイントでは、その同一視が事故経路になる。
   */
  private readJsonObjectBodyAllowEmpty(
    req: http.IncomingMessage,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8').trim();
        if (raw.length === 0) {
          resolve({});
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          reject(e);
          return;
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          reject(new Error('body must be a JSON object'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      });
      req.on('error', reject);
    });
  }

  private readJsonBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c as Buffer));
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }
}

// ---------------------------------------------------------------------------
//  Helper: ClientMessage type guard
// ---------------------------------------------------------------------------

export function isClientMessage(data: unknown): data is ClientMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  const validTypes = [
    'set-level',
    'cluster',
    'refresh',
    'open-doc-link',
    'reset-claude-activity',
    'generate-code-graph',
    'open-file',
    'add-note-page',
    'perf-report',
    'chat.send',
    'chat.abort',
    'provider.recheck',
  ];
  return typeof msg.type === 'string' && validTypes.includes(msg.type);
}

// ---------------------------------------------------------------------------
//  Standalone HTML builder
// ---------------------------------------------------------------------------

function buildStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trail Viewer</title>
  <style>html, body, #root { margin: 0; padding: 0; height: 100%; }</style>
</head>
<body>
  <div id="root"></div>
  <script src="/trailstandalone.js"></script>
</body>
</html>`;
}
