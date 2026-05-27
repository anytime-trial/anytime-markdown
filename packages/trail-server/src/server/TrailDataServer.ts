import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import {
  aggregateCoverage,
  aggregateCoverageFromDb,
  aggregateHeatmapColumnsToC4,
  buildElementTree,
  buildSourceMatrix,
  computeActivityHeatmap,
  computeActivityTrend,
  computeComplexityMatrix,
  computeFileHotspot,
  fetchC4Model,
  fetchC4ModelEntries,
  filterTreeByLevel,
  parseCoverage,
} from '@anytime-markdown/trail-core/c4';
import { analyze } from '@anytime-markdown/trail-core/analyze';
import { loadCommitCategories, loadCommitCategoryLabels } from '@anytime-markdown/trail-core/commitCategories';
import { loadToolCategories, loadToolCategoryLabels } from '@anytime-markdown/trail-core/toolCategories';
import { loadSkillCategories, loadSkillCategoryLabels } from '@anytime-markdown/trail-core/skillCategories';
import {
  buildIndex as buildCallHierarchyIndex,
  buildCallHierarchyNodeFilter,
  traverse as traverseCallHierarchy,
} from '@anytime-markdown/trail-core/c4/callHierarchy';
import type {
  CallHierarchyDirection,
  CallHierarchyIndex,
  CallHierarchyScope,
} from '@anytime-markdown/trail-core/c4/callHierarchy';
import type { FileCoverage, MessageInput, C4Model, DsmMatrix, FeatureMatrix } from '@anytime-markdown/trail-core/c4';
import type { TrailGraph, ReleaseCoverageRow, CurrentCoverageRow } from '@anytime-markdown/trail-core';
import { WebSocketServer, type WebSocket } from 'ws';

import type { ClientMessage, ServerMessage } from './types';
import type { TrailDatabase, SessionRow, MessageRow, SessionCommitRow, AnalyticsData, CostOptimizationData } from '@anytime-markdown/trail-db';
import { MetricsThresholdsLoader } from '@anytime-markdown/trail-db';
import { computeDeploymentFrequency, computeQualityMetrics, computeReleaseQualityTimeSeries } from '@anytime-markdown/trail-core/domain/metrics';
import { aggregateScoresToC4 } from '@anytime-markdown/trail-core/deadCode';
import { aggregateCentralityToC4, aggregateRolesToC4 } from '@anytime-markdown/trail-core/centrality';
import type { ClassifiedFunction } from '@anytime-markdown/trail-core/centrality';
import type { Logger, LogLevel } from '../runtime/Logger';
import type { CodeGraphService } from '../analyze/CodeGraphService';
import type { AnalyzeCurrentResult, AnalyzeReleaseResult } from '../analyze/AnalyzePipeline';
import type { AnalyzeAllRunner } from '../runner/AnalyzeAllRunner';
import { MemoryApiHandler } from './MemoryApiHandler';
import { PromptsApiHandler } from './PromptsApiHandler';
import { C4ManualApiHandler } from './C4ManualApiHandler';
import { CodeGraphApiHandler } from './CodeGraphApiHandler';
import { DocsApiHandler } from './DocsApiHandler';
import type { LogService, PersistedLogEntry } from '../services/LogService';
import { LogSink, combineLoggers } from '../services/LogSink';
import { handleGetLogs, handlePostLogs } from './logsApi';
import { sendServerError } from './errorResponse';

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
  private importanceComputing = false;
  /** /api/c4/call-hierarchy 用の隣接リストキャッシュ。current_graphs ロード後に lazy 構築し、graph 更新時に invalidate */
  private callHierarchyIndex: CallHierarchyIndex | null = null;
  private callHierarchyIndexRepo: string | undefined;
  onOpenDocLink: ((docPath: string) => void) | undefined;
  onOpenFile: ((filePath: string) => void) | undefined;
  onTokenBudgetExceeded: ((status: import('./types').TokenBudgetUpdatedMessage) => void) | undefined;

  /** POST /api/analyze/current ハンドラ。extension.ts で登録される */
  onAnalyzeCurrentCode:
    | ((req: { workspacePath?: string; tsconfigPath?: string }) => Promise<AnalyzeCurrentResult>)
    | undefined;
  /** POST /api/analyze/release ハンドラ */
  onAnalyzeReleaseCode:
    | (() => Promise<AnalyzeReleaseResult>)
    | undefined;
  /** POST /api/analyze/all ハンドラ */
  onAnalyzeAll:
    | (() => Promise<AnalyzeAllPipelineResult>)
    | undefined;

  /** 現在進行中の解析タスク種別。並行実行時の 409 判定に使う */
  private analysisInProgress: { kind: 'current' | 'release' | 'all'; startedAt: number } | null = null;
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

  constructor(
    private readonly distPath: string,
    private readonly trailDb: TrailDatabase,
    private logger: Logger,
    private readonly gitRoot?: string,
    memoryDbPath?: string,
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
    this.memoryApi = new MemoryApiHandler(
      this.logger.child('MemoryApiHandler'),
      memoryDbPath,
      nativeBinding,
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
   * extension_logs ストリーミング用の LogService を wire する。設定後は
   * `POST /api/logs` と `GET /api/logs` が有効化され、内部 logger が
   * composite (OutputChannel + extension_logs) に置き換わる。未設定のうちは 503 を返す。
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

  /** Broadcast log-batch to all connected WebSocket clients. */
  notifyLog(entries: PersistedLogEntry[]): void {
    if (this.clients.size === 0 || entries.length === 0) return;
    const payload = JSON.stringify({ type: 'log-batch', logs: entries });
    for (const ws of this.clients) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(payload);
      }
    }
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

  private handleHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    // Rate limiting
    const now = Date.now();
    if (now > this.rateLimitReset) {
      this.rateLimitCount = 0;
      this.rateLimitReset = now + RATE_LIMIT_WINDOW_MS;
    }
    this.rateLimitCount++;
    if (this.rateLimitCount > RATE_LIMIT_MAX) {
      res.writeHead(429, { 'Retry-After': '1' });
      res.end('Too Many Requests');
      return;
    }

    // CORS: localhost only
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');

    const rawUrl = req.url ?? '';
    const parsed = new URL(rawUrl, `http://${BIND_HOST}`);
    const pathname = parsed.pathname;
    const method = req.method ?? 'GET';

    // Static routes
    if (pathname === '/') {
      this.serveStandaloneHtml(res);
      return;
    }
    if (pathname === '/trailstandalone.js' || pathname === '/trailstandalone.js.map') {
      this.serveStaticFile(res, pathname.slice(1));
      return;
    }

    // API routes
    if (pathname === '/api/trail/sessions' && method === 'GET') {
      this.handleGetSessions(res, parsed.searchParams);
      return;
    }
    if (pathname === '/api/trail/search' && method === 'GET') {
      this.handleSearch(res, parsed.searchParams.get('q') ?? '');
      return;
    }
    if (pathname === '/api/trail/refresh' && method === 'POST') {
      this.handleRefresh(res);
      return;
    }

    if (pathname === '/api/analyze/current' && method === 'POST') {
      this.handleAnalyzeCurrent(req, res);
      return;
    }
    if (pathname === '/api/analyze/release' && method === 'POST') {
      this.handleAnalyzeRelease(req, res);
      return;
    }
    if (pathname === '/api/analyze/all' && method === 'POST') {
      this.handleAnalyzeAll(req, res);
      return;
    }
    if (pathname === '/api/analyze/status' && method === 'GET') {
      this.handleAnalyzeStatus(res);
      return;
    }

    if (pathname === '/api/analyze-all/pause' && method === 'POST') {
      this.handleAnalyzeAllPause(req, res);
      return;
    }
    if (pathname === '/api/analyze-all/resume' && method === 'POST') {
      this.handleAnalyzeAllResume(res);
      return;
    }
    if (pathname === '/api/analyze-all/status' && method === 'GET') {
      this.handleAnalyzeAllStatus(res);
      return;
    }

    if (pathname === '/api/logs' && method === 'POST') {
      this.handlePostLogsRoute(req, res);
      return;
    }
    if (pathname === '/api/logs' && method === 'GET') {
      this.handleGetLogsRoute(res, parsed.searchParams);
      return;
    }

    if (pathname === '/api/trail/token-budget' && method === 'POST') {
      this.handleTokenBudget(req, res);
      return;
    }

    if (pathname === '/api/message-commits' && method === 'POST') {
      this.handleInsertMessageCommit(req, res);
      return;
    }

    if (pathname === '/api/trail/prompts' && method === 'GET') {
      this.promptsApi.handleGet(res);
      return;
    }

    if (pathname === '/api/trail/analytics' && method === 'GET') {
      this.handleGetAnalytics(res);
      return;
    }

    if (pathname === '/api/trail/cost-optimization' && method === 'GET') {
      this.handleGetCostOptimization(res);
      return;
    }

    if (pathname === '/api/trail/releases' && method === 'GET') {
      this.handleGetReleases(res);
      return;
    }

    if (pathname === '/api/trail/combined' && method === 'GET') {
      this.handleGetCombined(res, parsed.searchParams);
      return;
    }

    if (pathname === '/api/trail/quality-metrics' && method === 'GET') {
      this.handleGetQualityMetrics(res, parsed.searchParams);
      return;
    }

    if (pathname === '/api/trail/deployment-frequency' && method === 'GET') {
      this.handleGetDeploymentFrequency(res, parsed.searchParams);
      return;
    }

    if (pathname === '/api/trail/deployment-frequency-quality' && method === 'GET') {
      this.handleGetDeploymentFrequencyQuality(res, parsed.searchParams);
      return;
    }


    const commitsMatch = /^\/api\/trail\/sessions\/([^/]+)\/commits$/.exec(pathname);
    if (commitsMatch && method === 'GET') {
      this.handleGetSessionCommits(res, decodeURIComponent(commitsMatch[1]));
      return;
    }

    const toolMetricsMatch = /^\/api\/trail\/sessions\/([^/]+)\/tool-metrics$/.exec(pathname);
    if (toolMetricsMatch && method === 'GET') {
      this.handleGetSessionToolMetrics(res, decodeURIComponent(toolMetricsMatch[1]));
      return;
    }

    const dayToolMetricsMatch = /^\/api\/trail\/days\/([^/]+)\/tool-metrics$/.exec(pathname);
    if (dayToolMetricsMatch && method === 'GET') {
      this.handleGetDayToolMetrics(res, decodeURIComponent(dayToolMetricsMatch[1]));
      return;
    }

    const sessionMatch = /^\/api\/trail\/sessions\/([^/]+)$/.exec(pathname);
    if (sessionMatch && method === 'GET') {
      this.handleGetSession(res, decodeURIComponent(sessionMatch[1]));
      return;
    }

    if (pathname === '/api/c4/releases' && method === 'GET') {
      void this.handleC4ReleasesEndpoint(res);
      return;
    }

    if (pathname === '/api/c4/model' && method === 'GET') {
      const releaseId = parsed.searchParams.get('release') ?? 'current';
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.handleC4ModelEndpoint(res, releaseId, repo);
      return;
    }
    if (pathname === '/api/c4/communities' && method === 'GET') {
      this.c4ManualApi.listCommunities(res, parsed);
      return;
    }
    if (pathname === '/api/c4/communities/upsert-summaries' && method === 'POST') {
      void this.c4ManualApi.upsertCommunitySummaries(req, res, parsed);
      return;
    }
    if (pathname === '/api/c4/communities/upsert-mappings' && method === 'POST') {
      void this.c4ManualApi.upsertCommunityMappings(req, res, parsed);
      return;
    }
    if (pathname === '/api/c4/dsm' && method === 'GET') {
      const releaseId = parsed.searchParams.get('release') ?? 'current';
      const repo = parsed.searchParams.get('repo') ?? undefined;
      this.handleC4DsmEndpoint(res, releaseId, repo);
      return;
    }
    if (pathname === '/api/c4/tree' && method === 'GET') {
      void this.handleC4TreeEndpoint(res);
      return;
    }
    if (pathname === '/api/c4/doc-links' && method === 'GET') {
      this.docsApi.handleListDocLinks(res);
      return;
    }
    if (pathname === '/api/docs-index' && method === 'GET') {
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.docsApi.handleDocsIndex(res, repo);
      return;
    }
    if (pathname === '/api/c4/coverage' && method === 'GET') {
      const releaseId = parsed.searchParams.get('release') ?? 'current';
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.handleC4CoverageEndpoint(res, releaseId, repo);
      return;
    }
    if (pathname === '/api/c4/file-analysis' && method === 'GET') {
      const repo = parsed.searchParams.get('repo') ?? undefined;
      const tag = parsed.searchParams.get('tag') ?? 'current';
      void this.handleC4FileAnalysisEndpoint(res, tag, repo);
      return;
    }
    if (pathname === '/api/c4/function-analysis' && method === 'GET') {
      const repo = parsed.searchParams.get('repo') ?? undefined;
      const tag = parsed.searchParams.get('tag') ?? 'current';
      void this.handleC4FunctionAnalysisEndpoint(res, tag, repo);
      return;
    }

    if (pathname === '/api/c4/complexity' && method === 'GET') {
      // Complexity は累積指標のため release パラメータは受け取らない
      // (古いクライアントが付与しても無視する)
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.handleC4ComplexityEndpoint(res, repo);
      return;
    }

    if (pathname === '/api/c4/exports' && method === 'GET') {
      const componentId = parsed.searchParams.get('componentId') ?? '';
      void this.handleC4ExportsEndpoint(res, componentId);
      return;
    }

    if (pathname === '/api/c4/functions' && method === 'GET') {
      const elementId = parsed.searchParams.get('elementId') ?? '';
      void this.handleC4FunctionsEndpoint(res, elementId);
      return;
    }

    if (pathname === '/api/c4/flowchart' && method === 'GET') {
      const componentId = parsed.searchParams.get('componentId') ?? '';
      const symbolId = parsed.searchParams.get('symbolId') ?? '';
      const type = (parsed.searchParams.get('type') ?? 'control') as 'control' | 'call';
      void this.handleC4FlowchartEndpoint(res, componentId, symbolId, type);
      return;
    }

    if (pathname === '/api/c4/sequence' && method === 'GET') {
      const elementId = parsed.searchParams.get('elementId') ?? '';
      void this.handleC4SequenceEndpoint(res, elementId);
      return;
    }

    if (pathname === '/api/c4/call-hierarchy' && method === 'GET') {
      const file = parsed.searchParams.get('file') ?? '';
      const fn = parsed.searchParams.get('fn') ?? '';
      const direction = parsed.searchParams.get('direction') ?? 'callees';
      const depth = parsed.searchParams.get('depth');
      const line = parsed.searchParams.get('line');
      const scope = parsed.searchParams.get('scope') ?? 'project';
      const excludeTests = parsed.searchParams.get('excludeTests') === 'true';
      void this.handleCallHierarchyEndpoint(res, {
        file,
        fn,
        direction,
        depthParam: depth,
        lineParam: line,
        scope,
        excludeTests,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/c4/manual-elements') {
      void this.c4ManualApi.createElement(req, res, parsed);
      return;
    }
    const elemMatch = /^\/api\/c4\/manual-elements\/([^/]+)$/.exec(pathname);
    if (elemMatch && method === 'PATCH') {
      void this.c4ManualApi.updateElement(req, res, parsed, elemMatch[1]);
      return;
    }
    if (elemMatch && method === 'DELETE') {
      this.c4ManualApi.deleteElement(res, parsed, elemMatch[1]);
      return;
    }
    if (method === 'GET' && pathname === '/api/c4/manual-relationships') {
      this.c4ManualApi.listRelationships(res, parsed);
      return;
    }
    if (method === 'POST' && pathname === '/api/c4/manual-relationships') {
      void this.c4ManualApi.createRelationship(req, res, parsed);
      return;
    }
    const relMatch = /^\/api\/c4\/manual-relationships\/([^/]+)$/.exec(pathname);
    if (relMatch && method === 'DELETE') {
      this.c4ManualApi.deleteRelationship(res, parsed, relMatch[1]);
      return;
    }
    if (method === 'GET' && pathname === '/api/c4/manual-groups') {
      this.c4ManualApi.listGroups(res, parsed);
      return;
    }
    if (method === 'POST' && pathname === '/api/c4/manual-groups') {
      void this.c4ManualApi.createGroup(req, res, parsed);
      return;
    }
    const groupMatch = /^\/api\/c4\/manual-groups\/([^/]+)$/.exec(pathname);
    if (groupMatch && method === 'PATCH') {
      void this.c4ManualApi.updateGroup(req, res, parsed, groupMatch[1]);
      return;
    }
    if (groupMatch && method === 'DELETE') {
      this.c4ManualApi.deleteGroup(res, parsed, groupMatch[1]);
      return;
    }

    if (pathname === '/api/code-graph' && method === 'GET') {
      const releaseId = parsed.searchParams.get('release') ?? 'current';
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.codeGraphApi.handleGet(res, releaseId, repo);
      return;
    }
    if (pathname === '/api/code-graph/query' && method === 'GET') {
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.codeGraphApi.handleQuery(res, parsed.searchParams.get('q') ?? '', repo);
      return;
    }
    if (pathname === '/api/code-graph/explain' && method === 'GET') {
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.codeGraphApi.handleExplain(res, parsed.searchParams.get('id') ?? '', repo);
      return;
    }
    if (pathname === '/api/code-graph/path' && method === 'GET') {
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.codeGraphApi.handlePath(
        res,
        parsed.searchParams.get('from') ?? '',
        parsed.searchParams.get('to') ?? '',
        repo,
      );
      return;
    }
    if (pathname === '/api/temporal-coupling' && method === 'GET') {
      this.handleTemporalCoupling(res, parsed.searchParams);
      return;
    }

    if (pathname === '/api/defect-risk' && method === 'GET') {
      this.handleDefectRisk(res, parsed.searchParams);
      return;
    }

    if (pathname === '/api/hotspot' && method === 'GET') {
      this.handleHotspot(res, parsed.searchParams);
      return;
    }
    if (pathname === '/api/activity-heatmap' && method === 'GET') {
      this.handleActivityHeatmap(res, parsed.searchParams);
      return;
    }
    if (pathname === '/api/activity-trend' && method === 'GET') {
      this.handleActivityTrend(res, parsed.searchParams);
      return;
    }

    if (pathname === '/api/trace/list' && method === 'GET') {
      this.handleTraceList(res);
      return;
    }
    if (pathname === '/api/trace/file' && method === 'GET') {
      this.handleTraceFile(res, parsed.searchParams.get('name') ?? '');
      return;
    }

    if (pathname === '/api/config/commit-categories' && method === 'GET') {
      const root = this.gitRoot ?? process.cwd();
      const entries: Record<string, number> = {};
      for (const [k, v] of loadCommitCategories(root)) entries[k] = v;
      const categories: Record<string, string> = {};
      for (const [k, v] of loadCommitCategoryLabels(root)) categories[String(k)] = v;
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ entries, categories }));
      return;
    }

    if (pathname === '/api/config/tool-categories' && method === 'GET') {
      const root = this.gitRoot ?? process.cwd();
      const entries: Record<string, number> = {};
      for (const [k, v] of loadToolCategories(root)) entries[k] = v;
      const categories: Record<string, string> = {};
      for (const [k, v] of loadToolCategoryLabels(root)) categories[String(k)] = v;
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ entries, categories }));
      return;
    }

    if (pathname === '/api/config/skill-categories' && method === 'GET') {
      const root = this.gitRoot ?? process.cwd();
      const entries: Record<string, number> = {};
      for (const [k, v] of loadSkillCategories(root)) entries[k] = v;
      const categories: Record<string, string> = {};
      for (const [k, v] of loadSkillCategoryLabels(root)) categories[String(k)] = v;
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ entries, categories }));
      return;
    }

    // -------------------------------------------------------------------------
    //  Memory API endpoints
    // -------------------------------------------------------------------------
    if (pathname === '/api/memory/status' && method === 'GET') {
      void this.memoryApi.handleStatus().then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/status] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/drift/events' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.listDriftEvents({
        unresolvedOnly: p.get('unresolvedOnly') === 'true',
        severity: p.get('severity') ?? undefined,
        driftType: p.get('driftType') ?? undefined,
        since: p.get('since') ?? undefined,
        limit: clampInt(p.get('limit'), 50, 1, 200),
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/drift/events] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname.startsWith('/api/memory/drift/events/') && method === 'GET') {
      const eventId = decodePathParam(pathname, '/api/memory/drift/events/');
      void this.memoryApi.getDriftEventDetail(eventId).then((data) => {
        if (!data) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/drift/events/:id] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname.startsWith('/api/memory/drift/events/') && method === 'POST') {
      const eventId = decodePathParam(pathname, '/api/memory/drift/events/', '/resolve');
      void this.readJsonBody(req).then(async (body) => {
        const note = typeof (body as Record<string, unknown>)['resolutionNote'] === 'string'
          ? (body as Record<string, string>)['resolutionNote']
          : '';
        const data = await this.memoryApi.resolveDriftEvent(eventId, note);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/drift/events/:id POST] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/bugs/recurring' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.listRecurringBugs({
        package: p.get('pkg') ?? undefined,
        windowDays: p.get('windowDays') ? clampInt(p.get('windowDays'), 90, 1, 365) : undefined,
        limit: clampInt(p.get('limit'), 20, 1, 200),
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/bugs/recurring] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/bugs/history' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.getBugHistory({
        package: p.get('pkg') ?? undefined,
        filePath: p.get('filePath') ?? undefined,
        category: p.get('category') ?? undefined,
        limit: clampInt(p.get('limit'), 50, 1, 200),
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/bugs/history] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/bugs/causal' && method === 'GET') {
      const bugEntityId = parsed.searchParams.get('bugEntityId');
      if (!bugEntityId) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'bugEntityId required' }));
        return;
      }
      void this.memoryApi.getBugCausalInfo(bugEntityId).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/bugs/causal] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/reviews/unaddressed' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.listUnaddressedReviewFindings({
        category: p.get('category') ?? undefined,
        severity: p.get('severity') ?? undefined,
        daysSinceMin: p.get('daysSinceMin') ? clampInt(p.get('daysSinceMin'), 0, 0, 365) : undefined,
        limit: clampInt(p.get('limit'), 50, 1, 200),
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/reviews/unaddressed] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/reviews/history' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.getReviewHistory({
        targetFilePath: p.get('targetFilePath') ?? undefined,
        package: p.get('pkg') ?? undefined,
        limit: clampInt(p.get('limit'), 50, 1, 200),
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/reviews/history] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/pipeline/runs/by-day' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.listPipelineRunStatsByDay({
        scope: p.get('scope') ?? undefined,
        since: p.get('since') ?? undefined,
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/pipeline/runs/by-day] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/pipeline/failed' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.listFailedItems({
        scope: p.get('scope') ?? undefined,
        limit: clampInt(p.get('limit'), 50, 1, 200),
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/pipeline/failed] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/entities/top' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.listTopEntities({
        type: p.get('type') ?? undefined,
        limit: clampInt(p.get('limit'), 20, 1, 200),
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/entities/top] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    if (pathname === '/api/memory/edges/invalidations' && method === 'GET') {
      const p = parsed.searchParams;
      void this.memoryApi.listInvalidations({
        since: p.get('since') ?? undefined,
        limit: clampInt(p.get('limit'), 50, 1, 200),
      }).then((data) => {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(data));
      }).catch((err: unknown) => {
        this.logger.error(`[/api/memory/edges/invalidations] ${String(err)}`);
        res.writeHead(500); res.end();
      });
      return;
    }

    res.writeHead(404);
    res.end();
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
    const filePath = path.join(traceDir, name);
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
    const resolvedRepo = repoName ?? (this.gitRoot ? path.basename(this.gitRoot) : undefined);
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

  private async handleC4ModelEndpoint(res: http.ServerResponse, releaseId: string, repo?: string): Promise<void> {
    // trail-core の fetchC4Model 経由でストアから取得（pure 関数 + IC4ModelStore アダプタ）
    const repoName = repo ?? (this.gitRoot ? path.basename(this.gitRoot) : undefined);
    const provider = this.getC4Provider?.();
    const store = this.trailDb.asC4ModelStore();
    const manualProvider = repoName ? {
      getElements: async (repo: string) =>
        provider ? provider.getManualElements(repo) : this.trailDb.getManualElements(repo),
      getRelationships: async (repo: string) =>
        provider ? provider.getManualRelationships(repo) : this.trailDb.getManualRelationships(repo),
    } : undefined;
    const featureMatrix = provider?.featureMatrix ?? this.trailDb.getCurrentFeatureMatrix() ?? undefined;
    const payload = await fetchC4Model(store, releaseId, repoName, featureMatrix, manualProvider);
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
    const repoName = this.gitRoot ? path.basename(this.gitRoot) : undefined;
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
      const repoName = repo ?? (this.gitRoot ? path.basename(this.gitRoot) : undefined);
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

      // current 要求: current_coverage を優先、なければファイルスキャン
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

      // current 要求のフォールバック: scan packages/*/coverage/coverage-final.json
      // 要求された repo が現在のワークスペースの gitRoot と一致しない場合は、
      // ローカルのファイルスキャン結果は他リポジトリのデータと混ざるため返さない
      const projectRoot = provider?.projectRoot ?? this.gitRoot;
      const workspaceRepoName = this.gitRoot ? path.basename(this.gitRoot) : undefined;
      if (!this.gitRoot || !projectRoot || (repoName && repoName !== workspaceRepoName)) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ coverageMatrix: null, coverageDiff: null }));
        return;
      }

      const allFiles: FileCoverage[] = [];
      const packagesDir = path.join(this.gitRoot, 'packages');
      if (fs.existsSync(packagesDir)) {
        for (const pkgDir of fs.readdirSync(packagesDir)) {
          const coveragePath = path.join(packagesDir, pkgDir, 'coverage', 'coverage-final.json');
          if (!fs.existsSync(coveragePath)) continue;
          try {
            const raw = JSON.parse(fs.readFileSync(coveragePath, 'utf-8')) as Parameters<typeof parseCoverage>[0];
            allFiles.push(...parseCoverage(raw));
          } catch {
            // skip unreadable files
          }
        }
      }

      if (allFiles.length === 0) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ coverageMatrix: null, coverageDiff: null }));
        return;
      }

      const coverageMatrix = aggregateCoverage(allFiles, payload.model, projectRoot);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ coverageMatrix, coverageDiff: null }));
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
      const repoName = repo ?? (this.gitRoot ? path.basename(this.gitRoot) : undefined);
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
  //  API: GET /api/trail/combined?period=day&rangeDays=30
  // -------------------------------------------------------------------------

  private handleGetCombined(res: http.ServerResponse, params: URLSearchParams): void {
    const period = (params.get('period') ?? 'day') as 'day' | 'week';
    const rangeDaysRaw = Number.parseInt(params.get('rangeDays') ?? '30', 10);
    const rangeDays = ([30, 90].includes(rangeDaysRaw) ? rangeDaysRaw : 30) as 30 | 90;
    try {
      const data = this.trailDb.getCombinedData(period, rangeDays);
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
      const loader = new MetricsThresholdsLoader(this.gitRoot ?? process.cwd());
      const thresholds = loader.load();

      // Compute previous range (same duration before current range)
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime();
      const duration = toMs - fromMs;
      const prevTo = new Date(fromMs - 1).toISOString();
      const prevFrom = new Date(fromMs - 1 - duration).toISOString();

      const raw = this.trailDb.getQualityMetricsInputs(from, to, prevFrom, prevTo);
      const metrics = computeQualityMetrics(raw, { from, to }, thresholds);

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
      .importAll(undefined, gitRoots, undefined, analyze)
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

        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ ok: true }));
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
        this.onOpenFile?.(parsed.filePath);
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

  async computeAndPersistImportance(
    tsconfigPath: string,
    exclude: import('ignore').Ignore | undefined,
    /**
     * `analyzeWithProgram` で構築済みの ts.Program。
     * analyze() と完全に同じ対象ファイル集合で重要度計算を行うため必須。
     */
    program: import('typescript').Program,
  ): Promise<{
    scored: import('@anytime-markdown/trail-core/importance').ScoredFunction[];
    lineCountByFile: ReadonlyMap<string, number>;
  } | null> {
    if (this.importanceComputing) return null;
    this.importanceComputing = true;
    try {
      // importance 純粋計算は computeImportance に集約済み (子プロセス隔離と共有)。
      const { computeImportance } = await import('../analyze/computeImportance.js');
      return await computeImportance(tsconfigPath, exclude, program);
    } catch (err) {
      this.logger.error('[importance] computeImportance failed', err);
      return null;
    } finally {
      this.importanceComputing = false;
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
    const repoName = this.gitRoot ? path.basename(this.gitRoot) : undefined;

    const store = this.trailDb.asC4ModelStore();
    const payload = await fetchC4Model(store, 'current', repoName, provider?.featureMatrix);
    const model = payload?.model;

    const graph = provider?.trailGraph ?? (this.trailDb.getCurrentGraph(repoName) ?? undefined);

    if (!model || !graph) return null;
    return { model, graph };
  }

  private async handleC4ExportsEndpoint(
    res: http.ServerResponse,
    componentId: string,
  ): Promise<void> {
    const { ExportExtractor, createSourceFile } = await import('@anytime-markdown/trail-core/analyzer');
    try {
      const resolved = await this.resolveModelAndGraph();

      if (!resolved) {
        this.logger.warn(`[/api/c4/exports] model or graph not available for componentId=${componentId}`);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ symbols: [] }));
        return;
      }

      const { model, graph } = resolved;

      const { projectRoot } = graph.metadata;
      const codeElementIds = new Set(
        model.elements
          .filter(el => el.type === 'code' && el.boundaryId === componentId)
          .map(el => el.id),
      );

      const normalizedRoot = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;
      const sourceFiles = [];
      for (const node of graph.nodes) {
        if (!codeElementIds.has(node.id)) continue;
        const absolutePath = path.resolve(projectRoot, node.filePath);
        if (!absolutePath.startsWith(normalizedRoot)) {
          this.logger.warn(`[/api/c4/exports] path traversal blocked: ${node.filePath}`);
          continue;
        }
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          sourceFiles.push(createSourceFile(node.filePath, content));
        } catch (e) {
          this.logger.error(`[/api/c4/exports] failed to read file: ${node.filePath}`, e);
        }
      }

      const symbols = ExportExtractor.extract(sourceFiles, componentId);
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
    const { ExportExtractor, createSourceFile } = await import('@anytime-markdown/trail-core/analyzer');
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
      // Python は tree-sitter ベースの PythonExportExtractor、それ以外は TS の ExportExtractor。
      let symbols: import('@anytime-markdown/trail-core/analyzer').ExportedSymbol[];
      if (node.filePath.endsWith('.py')) {
        const { createPythonParser, PythonExportExtractor } = await import('@anytime-markdown/code-analysis-python');
        const parser = await createPythonParser(this.codeGraphService?.getPythonWasmPath());
        const tree = parser.parse(content);
        symbols = tree ? PythonExportExtractor.extract(node.filePath, tree.rootNode) : [];
        tree?.delete();
      } else {
        const sourceFile = createSourceFile(node.filePath, content);
        symbols = ExportExtractor.extract([sourceFile], elementId);
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ symbols }));
    } catch (e) {
      this.logger.error(`[/api/c4/functions] error: elementId=${elementId}`, e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ symbols: [] }));
    }
  }

  private async handleC4FlowchartEndpoint(
    res: http.ServerResponse,
    componentId: string,
    symbolId: string,
    type: 'control' | 'call',
  ): Promise<void> {
    const { FlowAnalyzer, createSourceFile, findFunctionNode } = await import('@anytime-markdown/trail-core/analyzer');
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
      const { projectRoot } = graph.metadata;
      const codeElementIds = new Set(
        model.elements
          .filter(el => el.type === 'code' && el.boundaryId === componentId)
          .map(el => el.id),
      );

      const normalizedFlowRoot = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;
      const sourceFiles = [];
      for (const node of graph.nodes) {
        if (!codeElementIds.has(node.id)) continue;
        const absolutePath = path.resolve(projectRoot, node.filePath);
        if (!absolutePath.startsWith(normalizedFlowRoot)) {
          this.logger.warn(`[/api/c4/flowchart] path traversal blocked: ${node.filePath}`);
          continue;
        }
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          sourceFiles.push(createSourceFile(node.filePath, content));
        } catch (e) {
          this.logger.error(`[/api/c4/flowchart] failed to read file: ${node.filePath}`, e);
        }
      }

      let flowGraph;
      if (type === 'control') {
        const filePart = symbolId.split('::')[0];
        const funcName = symbolId.split('::').at(-1);
        const targetSf = sourceFiles.find(sf => sf.fileName === filePart);
        if (!targetSf || !funcName) {
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ graph: EMPTY_GRAPH }));
          return;
        }
        const funcNode = findFunctionNode(targetSf, funcName);
        if (!funcNode) {
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ graph: EMPTY_GRAPH }));
          return;
        }
        flowGraph = FlowAnalyzer.buildControlFlow(targetSf, funcNode);
      } else {
        flowGraph = FlowAnalyzer.buildCallGraph(sourceFiles, symbolId);
      }

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
    const { SequenceAnalyzer, createSourceFile } = await import('@anytime-markdown/trail-core/analyzer');
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
      const { projectRoot } = graph.metadata;

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

      const normalizedRoot = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;
      const sourceFiles = new Map<string, ReturnType<typeof createSourceFile>>();
      for (const node of graph.nodes) {
        if (!codeElementIds.has(node.id)) continue;
        const absolutePath = path.resolve(projectRoot, node.filePath);
        if (!absolutePath.startsWith(normalizedRoot)) {
          this.logger.warn(`[/api/c4/sequence] path traversal blocked: ${node.filePath}`);
          continue;
        }
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          sourceFiles.set(node.filePath, createSourceFile(node.filePath, content));
        } catch (e) {
          this.logger.error(`[/api/c4/sequence] failed to read file: ${node.filePath}`, e);
        }
      }

      const sequenceModel = SequenceAnalyzer.build(elementId, model, graph, sourceFiles);
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

      const repoName = this.gitRoot ? path.basename(this.gitRoot) : undefined;
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
    _req: http.IncomingMessage,
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
    this.analysisInProgress = { kind: 'release', startedAt: Date.now() };
    try {
      const result = await this.onAnalyzeReleaseCode();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
    } catch (err) {
      this.logger.error('handleAnalyzeRelease failed', err);
      sendServerError(res, 'analyze release failed');
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

  private handleGetLogsRoute(res: http.ServerResponse, params: URLSearchParams): void {
    if (!this.logService) {
      res.writeHead(503, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'log service not registered' }));
      return;
    }
    const result = handleGetLogs(params, this.logService);
    const headers = result.headers ?? {};
    res.writeHead(result.status, headers);
    if (result.body) res.end(result.body);
    else res.end();
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
