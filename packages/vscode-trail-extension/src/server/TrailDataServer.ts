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
import type { FileCoverage, MessageInput } from '@anytime-markdown/trail-core/c4';
import type {
  C4Model,
  DocLink,
  DsmMatrix,
  FeatureMatrix,
} from '@anytime-markdown/trail-core/c4';
import type { TrailGraph, ReleaseCoverageRow, CurrentCoverageRow } from '@anytime-markdown/trail-core';
import { WebSocketServer, type WebSocket } from 'ws';

import type { ClientMessage, ServerMessage } from './types';
import type { TrailDatabase, SessionRow, MessageRow, SessionCommitRow, AnalyticsData, CostOptimizationData } from '@anytime-markdown/trail-db';
import { MetricsThresholdsLoader } from '@anytime-markdown/trail-db';
import { computeDeploymentFrequency, computeQualityMetrics, computeReleaseQualityTimeSeries } from '@anytime-markdown/trail-core/domain/metrics';
import { aggregateScoresToC4 } from '@anytime-markdown/trail-core/deadCode';
import { TrailLogger } from '../utils/TrailLogger';
import type { CodeGraphService } from '../graph/CodeGraphService';
import { GraphQueryEngine } from '../graph/GraphQueryEngine';

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

/** AnalyzePipeline.ts と同型。HTTP 応答のシリアライズ対象 */
export interface AnalyzePipelineResult {
  repoName: string;
  tsconfigPath: string;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  commitId: string;
  durationMs: number;
  warnings: string[];
}

export interface AnalyzeReleasePipelineResult {
  releaseCount: number;
  durationMs: number;
}

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
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const from = new Date(now.getTime() - days * MS_PER_DAY).toISOString();
  return { from, to };
}

function collectFilePathsForElement(elementId: string, c4Model: C4Model): string[] {
  const FILE_PREFIX = 'file::';
  const elementById = new Map(c4Model.elements.map((el) => [el.id, el] as const));
  const target = elementById.get(elementId);
  const result = new Set<string>();
  if (target && target.type === 'code' && target.id.startsWith(FILE_PREFIX)) {
    result.add(target.id.slice(FILE_PREFIX.length));
    return Array.from(result);
  }
  const visited = new Set<string>();
  const stack: string[] = [elementId];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined || visited.has(cur)) continue;
    visited.add(cur);
    for (const el of c4Model.elements) {
      if (el.boundaryId !== cur) continue;
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
  private readonly staticCache = new Map<string, Buffer>();
  private rateLimitCount = 0;
  private rateLimitReset = 0;
  private cachedHtml: string | undefined;
  private getC4Provider: (() => C4DataProvider | undefined) | undefined;
  private docLinks: readonly DocLink[] = [];
  private docsPath: string | undefined;
  private lastClaudeActivity: { activeElementIds: readonly string[]; touchedElementIds: readonly string[]; plannedElementIds: readonly string[] } | undefined;
  private lastMultiAgentActivity: { agents: readonly import('./types').AgentActivityEntry[]; conflicts: readonly import('./types').FileConflict[] } | undefined;
  private importanceComputing = false;
  onOpenDocLink: ((docPath: string) => void) | undefined;
  onOpenFile: ((filePath: string) => void) | undefined;
  onTokenBudgetExceeded: ((status: import('./types').TokenBudgetUpdatedMessage) => void) | undefined;

  /** POST /api/analyze/current ハンドラ。extension.ts で登録される */
  onAnalyzeCurrentCode:
    | ((req: { workspacePath?: string; tsconfigPath?: string }) => Promise<AnalyzePipelineResult>)
    | undefined;
  /** POST /api/analyze/release ハンドラ */
  onAnalyzeReleaseCode:
    | (() => Promise<AnalyzeReleasePipelineResult>)
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

  constructor(
    private readonly distPath: string,
    private readonly trailDb: TrailDatabase,
    private readonly gitRoot?: string,
  ) {}

  setCodeGraphService(service: CodeGraphService): void {
    this.codeGraphService = service;
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
      ws.on('message', (data: unknown) => this.handleWsMessage(data));
      this.sendC4CurrentState(ws);
    });

    return new Promise<void>((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(err);
        }
      });
      server.listen(port, BIND_HOST, () => resolve());
    });
  }

  async stop(): Promise<void> {
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
    this.docsPath = docsPath;
    if (docsPath) {
      this.scanDocLinks().catch(() => { /* ignore */ });
    } else {
      this.docLinks = [];
    }
  }

  async scanDocLinks(): Promise<void> {
    if (!this.docsPath) return;
    this.docLinks = await scanLocalDocs(this.docsPath);
    this.notifyDocLinks();
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

    if (pathname === '/api/trail/token-budget' && method === 'POST') {
      this.handleTokenBudget(req, res);
      return;
    }

    if (pathname === '/api/message-commits' && method === 'POST') {
      this.handleInsertMessageCommit(req, res);
      return;
    }

    if (pathname === '/api/trail/prompts' && method === 'GET') {
      this.handleGetPrompts(res);
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
      this.handleListCommunities(res, parsed);
      return;
    }
    if (pathname === '/api/c4/communities/upsert-summaries' && method === 'POST') {
      void this.handleUpsertCommunitySummaries(req, res, parsed);
      return;
    }
    if (pathname === '/api/c4/communities/upsert-mappings' && method === 'POST') {
      void this.handleUpsertCommunityMappings(req, res, parsed);
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
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ docLinks: this.docLinks }));
      return;
    }
    if (pathname === '/api/docs-index' && method === 'GET') {
      const repo = parsed.searchParams.get('repo') ?? undefined;
      void this.handleDocsIndexEndpoint(res, repo);
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

    if (method === 'POST' && pathname === '/api/c4/manual-elements') {
      void this.handleCreateManualElement(req, res, parsed);
      return;
    }
    const elemMatch = /^\/api\/c4\/manual-elements\/([^/]+)$/.exec(pathname);
    if (elemMatch && method === 'PATCH') {
      void this.handleUpdateManualElement(req, res, parsed, elemMatch[1]);
      return;
    }
    if (elemMatch && method === 'DELETE') {
      this.handleDeleteManualElement(res, parsed, elemMatch[1]);
      return;
    }
    if (method === 'GET' && pathname === '/api/c4/manual-relationships') {
      this.handleListManualRelationships(res, parsed);
      return;
    }
    if (method === 'POST' && pathname === '/api/c4/manual-relationships') {
      void this.handleCreateManualRelationship(req, res, parsed);
      return;
    }
    const relMatch = /^\/api\/c4\/manual-relationships\/([^/]+)$/.exec(pathname);
    if (relMatch && method === 'DELETE') {
      this.handleDeleteManualRelationship(res, parsed, relMatch[1]);
      return;
    }
    if (method === 'GET' && pathname === '/api/c4/manual-groups') {
      this.handleListManualGroups(res, parsed);
      return;
    }
    if (method === 'POST' && pathname === '/api/c4/manual-groups') {
      void this.handleCreateManualGroup(req, res, parsed);
      return;
    }
    const groupMatch = /^\/api\/c4\/manual-groups\/([^/]+)$/.exec(pathname);
    if (groupMatch && method === 'PATCH') {
      void this.handleUpdateManualGroup(req, res, parsed, groupMatch[1]);
      return;
    }
    if (groupMatch && method === 'DELETE') {
      this.handleDeleteManualGroup(res, parsed, groupMatch[1]);
      return;
    }

    if (pathname === '/api/code-graph' && method === 'GET') {
      const releaseId = parsed.searchParams.get('release') ?? 'current';
      const repo = parsed.searchParams.get('repo') ?? undefined;
      this.handleCodeGraphEndpoint(res, releaseId, repo);
      return;
    }
    if (pathname === '/api/code-graph/query' && method === 'GET') {
      this.handleCodeGraphQuery(res, parsed.searchParams.get('q') ?? '');
      return;
    }
    if (pathname === '/api/code-graph/explain' && method === 'GET') {
      this.handleCodeGraphExplain(res, parsed.searchParams.get('id') ?? '');
      return;
    }
    if (pathname === '/api/code-graph/path' && method === 'GET') {
      this.handleCodeGraphPath(
        res,
        parsed.searchParams.get('from') ?? '',
        parsed.searchParams.get('to') ?? '',
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

    res.writeHead(404);
    res.end();
  }

  // -------------------------------------------------------------------------
  //  Code graph endpoints
  // -------------------------------------------------------------------------

  private handleCodeGraphEndpoint(res: http.ServerResponse, releaseId: string, repo?: string): void {
    if (releaseId !== 'current') {
      // 特定リリース: release_code_graphs から取得（repo 指定時は releases.repo_name で帰属確認）
      const releaseTagBelongsToRepo = this.trailDb.getReleases()
        .some((r) => r.tag === releaseId && (!repo || r.repo_name === repo));
      if (!releaseTagBelongsToRepo) {
        res.writeHead(404, JSON_HEADERS);
        res.end('{}');
        return;
      }
      const graph = this.trailDb.getReleaseCodeGraph(releaseId);
      if (!graph) {
        res.writeHead(404, JSON_HEADERS);
        res.end('{}');
        return;
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(graph));
      return;
    }

    // current: codeGraphService キャッシュを使用（既存挙動）
    const graph = this.codeGraphService?.getGraph();
    if (!graph) {
      res.writeHead(404, JSON_HEADERS);
      res.end('{}');
      return;
    }
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(graph));
  }

  private handleCodeGraphQuery(res: http.ServerResponse, q: string): void {
    const graph = this.codeGraphService?.getGraph();
    if (!graph) {
      res.writeHead(404, JSON_HEADERS);
      res.end('{}');
      return;
    }
    const engine = new GraphQueryEngine(graph);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(engine.query(q)));
  }

  private handleCodeGraphExplain(res: http.ServerResponse, id: string): void {
    const graph = this.codeGraphService?.getGraph();
    if (!graph) {
      res.writeHead(404, JSON_HEADERS);
      res.end('{}');
      return;
    }
    const engine = new GraphQueryEngine(graph);
    const result = engine.explain(id);
    res.writeHead(result ? 200 : 404, JSON_HEADERS);
    res.end(JSON.stringify(result ?? {}));
  }

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
    const granularity: 'commit' | 'session' | 'subagentType' =
      granularityRaw === 'session' ? 'session'
      : granularityRaw === 'subagentType' ? 'subagentType'
      : 'commit';

    const windowDays = clampInt(params.get('windowDays'), 30, 1, 365);
    const topK = clampInt(params.get('topK'), 50, 1, 500);
    const directional = params.get('directional') === 'true';
    const confidenceThreshold = clampFloat(params.get('confidenceThreshold'), 0.5, 0, 1);
    const directionalDiff = clampFloat(params.get('directionalDiff'), 0.3, 0, 1);

    // 明示指定された場合のみ採用。未指定なら undefined を渡し、TrailDatabase 側の粒度別デフォルトを使う。
    const thresholdRaw = params.get('threshold');
    const threshold = thresholdRaw !== null ? clampFloat(thresholdRaw, 0.5, 0, 1) : undefined;
    const minChangeRaw = params.get('minChange');
    const minChange = minChangeRaw !== null ? clampInt(minChangeRaw, 5, 1, 1000) : undefined;

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
      TrailLogger.error(`/api/temporal-coupling failed: ${err.message}\n${err.stack ?? ''}`);
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
      TrailLogger.error(`/api/hotspot failed: ${err.message}\n${err.stack ?? ''}`);
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
      TrailLogger.error(`/api/activity-heatmap failed: ${err.message}\n${err.stack ?? ''}`);
      this.sendError(res, 500, err.message);
    }
  }

  private async handleActivityTrend(res: http.ServerResponse, params: URLSearchParams): Promise<void> {
    const elementId = (params.get('elementId') ?? '').trim();
    if (!ELEMENT_ID_RE.test(elementId)) {
      this.sendError(res, 400, 'elementId is required and must match ^(sys|pkg|comp|code|file)_[\\w/.:-]+$');
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
      TrailLogger.error(`/api/activity-trend failed: ${err.message}\n${err.stack ?? ''}`);
      this.sendError(res, 500, err.message);
    }
  }

  private handleTraceList(res: http.ServerResponse): void {
    const traceDir = this.gitRoot
      ? path.join(this.gitRoot, '.vscode', 'trace')
      : path.join(process.cwd(), '.vscode', 'trace');
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
      TrailLogger.error(`/api/trace/list failed: ${err.message}\n${err.stack ?? ''}`);
      this.sendError(res, 500, err.message);
    }
  }

  private handleTraceFile(res: http.ServerResponse, name: string): void {
    if (!name || name.includes('..') || name.includes('/') || !name.endsWith('.json')) {
      this.sendError(res, 400, 'Invalid file name');
      return;
    }
    const traceDir = this.gitRoot
      ? path.join(this.gitRoot, '.vscode', 'trace')
      : path.join(process.cwd(), '.vscode', 'trace');
    const filePath = path.join(traceDir, name);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(content);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') { this.sendError(res, 404, 'File not found'); return; }
      const err = e instanceof Error ? e : new Error(String(e));
      TrailLogger.error(`/api/trace/file failed: ${filePath}: ${err.message}\n${err.stack ?? ''}`);
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
      TrailLogger.warn(`asC4ModelStore.getCurrentC4Model failed: ${e instanceof Error ? e.message : String(e)}`);
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
      TrailLogger.error(`/api/defect-risk failed: ${err.message}\n${err.stack ?? ''}`);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private handleCodeGraphPath(res: http.ServerResponse, from: string, to: string): void {
    const graph = this.codeGraphService?.getGraph();
    if (!graph) {
      res.writeHead(404, JSON_HEADERS);
      res.end('{}');
      return;
    }
    const engine = new GraphQueryEngine(graph);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(engine.path(from, to)));
  }

  notifyCodeGraphUpdated(): void {
    if (this.clients.size === 0) return;
    const payload = JSON.stringify({ type: 'code-graph-updated' } satisfies ServerMessage);
    for (const ws of this.clients) ws.send(payload);
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
    const cached = this.staticCache.get(filename);
    if (cached) {
      const contentType = filename.endsWith('.map') ? 'application/json' : 'application/javascript';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(cached);
      return;
    }

    const filePath = path.join(this.distPath, filename);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      this.staticCache.set(filename, data);
      const contentType = filename.endsWith('.map') ? 'application/json' : 'application/javascript';
      res.writeHead(200, { 'Content-Type': contentType });
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
      const errorCounts = this.trailDb.getSessionErrorCounts(sessionIds);
      const subAgentCounts = this.trailDb.getSessionSubAgentCounts(sessionIds);
      const distinctAgentIdCounts = this.trailDb.getSessionDistinctAgentIdCounts(sessionIds);
      const delegatedTrackCounts = this.trailDb.getSessionDelegatedTrackCounts(sessionIds);
      const linkedCodexSessionIdsByParent = new Map<string, Set<string>>();
      const consumedCodexSessionIds = new Set<string>();
      for (const s of rawSessions) {
        if ((s.source as string | undefined) === 'codex') continue;
        const linked = this.trailDb.getLinkedCodexSessionByAssistantUuid(s.id);
        const ids = new Set<string>();
        for (const sid of linked.values()) {
          ids.add(sid);
          consumedCodexSessionIds.add(sid);
        }
        linkedCodexSessionIdsByParent.set(s.id, ids);
      }

      const sessions = rawSessions
        .filter((s) => !((s.source as string | undefined) === 'codex' && consumedCodexSessionIds.has(s.id)))
        .map((s) => {
        const cStats = commitStats.get(s.id);
        const errorCount = errorCounts.get(s.id);
        const subAgentCount = subAgentCounts.get(s.id);
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
        const resolvedSubAgentCount = Math.max(subAgentCount ?? 0, distinctAgentIdCount + codexTrackCount);
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
          errorCount: errorCount != null && errorCount > 0 ? errorCount : undefined,
          subAgentCount: resolvedSubAgentCount > 0 ? resolvedSubAgentCount : undefined,
          compactCount: s.compact_count != null && s.compact_count > 0 ? s.compact_count : undefined,
        };
        });
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ sessions }));
    } catch {
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
        toolCalls: m.tool_calls ? JSON.parse(m.tool_calls as string) : undefined,
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
      TrailLogger.error('Failed to build DSM', e);
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
      TrailLogger.error('[/api/c4/coverage] failed', e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ coverageMatrix: null, coverageDiff: null }));
    }
  }

  private async handleDocsIndexEndpoint(res: http.ServerResponse, repo?: string): Promise<void> {
    try {
      // repo 指定なしは workspace global（全件返却）。後方互換。
      if (!repo) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ docs: this.docLinks }));
        return;
      }
      // C4 モデルから repo の要素 ID 集合を構築し、
      // doc.c4Scope のいずれかが要素 ID と完全一致または親パス（pkg_a/x の親 pkg_a）として
      // ヒットするドキュメントだけを返す。
      const store = this.trailDb.asC4ModelStore();
      const provider = this.getC4Provider?.();
      const payload = await fetchC4Model(store, 'current', repo, provider?.featureMatrix);
      const elementIds = new Set((payload?.model.elements ?? []).map((e) => e.id));
      if (elementIds.size === 0) {
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ docs: [] }));
        return;
      }
      const filtered = this.docLinks.filter((d) =>
        d.c4Scope.some((scope) =>
          elementIds.has(scope) || [...elementIds].some((id) => id.startsWith(scope + '/'))
        )
      );
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ docs: filtered }));
    } catch (e) {
      TrailLogger.error('[/api/docs-index] failed', e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ docs: this.docLinks }));
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
      const payload = await fetchC4Model(store, tag, repoName, undefined);
      const elements = payload?.model?.elements ?? [];

      // file → element 集約 (importance / deadCodeScore)
      const importanceFileScores: Record<string, number> = {};
      const deadCodeFileScores: Record<string, number> = {};
      for (const r of rows) {
        importanceFileScores[r.filePath] = r.importanceScore;
        deadCodeFileScores[r.filePath] = r.deadCodeScore;
      }
      const importance = aggregateScoresToC4(importanceFileScores, elements);
      // dead-code-score は importance と同じく親要素にも伝播させ、
      // viewer 側で levelTargetType に応じてフィルタする（フレーム着色防止のため）
      const deadCode = aggregateScoresToC4(deadCodeFileScores, elements);

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
      }));

      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({
        entries,
        elementMatrix: { importance, deadCodeScore: deadCode },
      }));
    } catch (err) {
      TrailLogger.error('[/api/c4/file-analysis] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
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
        cognitiveComplexity: r.cognitiveComplexity,
        dataMutationScore: r.dataMutationScore,
        sideEffectScore: r.sideEffectScore,
        lineCount: r.lineCount,
        importanceScore: r.importanceScore,
        signals: { fanInZero: r.signalFanInZero },
      }));

      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ entries }));
    } catch (err) {
      TrailLogger.error('[/api/c4/function-analysis] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
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
      TrailLogger.error('[/api/c4/complexity] failed', e);
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
    } catch {
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

  private handleGetPrompts(res: http.ServerResponse): void {
    try {
      const prompts = scanPromptFiles();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ prompts }));
    } catch {
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to read prompts' }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/analytics
  // -------------------------------------------------------------------------

  private handleGetAnalytics(res: http.ServerResponse): void {
    try {
      const analytics: AnalyticsData = this.trailDb.getAnalytics();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(analytics));
    } catch {
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
    } catch {
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
      TrailLogger.error('handleGetCombined failed', e);
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
      TrailLogger.error('handleGetQualityMetrics failed', e);
      const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get quality metrics', detail: msg }));
    }
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/deployment-frequency-quality?from=ISO&to=ISO&bucket=day|week
  // -------------------------------------------------------------------------

  private handleGetDeploymentFrequencyQuality(res: http.ServerResponse, params: URLSearchParams): void {
    const from = params.get('from');
    const to = params.get('to');
    const bucket = (params.get('bucket') === 'week' ? 'week' : 'day') as 'day' | 'week';
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
      TrailLogger.error('handleGetDeploymentFrequencyQuality failed', e);
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
    const bucket = (params.get('bucket') === 'week' ? 'week' : 'day') as 'day' | 'week';
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
      TrailLogger.error('handleGetDeploymentFrequency failed', e);
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
        featCount: row.feat_count,
        fixCount: row.fix_count,
        refactorCount: row.refactor_count,
        testCount: row.test_count,
        otherCount: row.other_count,
        affectedPackages: JSON.parse(row.affected_packages) as string[],
        durationDays: row.duration_days,
      }));
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(releases));
    } catch {
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
      .catch(() => {
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

  private static getDailyTokensFromJsonl(): number {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayJst = nowJst.toISOString().slice(0, 10);
    let total = 0;
    try {
      for (const dir of fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)) {
        const dirPath = path.join(projectsDir, dir);
        for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'))) {
          const filePath = path.join(dirPath, file);
          const mtimeJst = new Date(fs.statSync(filePath).mtimeMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
          if (mtimeJst === todayJst) {
            total += TrailDataServer.parseJsonlSession(filePath).contextTokens;
          }
        }
      }
    } catch { /* ignore */ }
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
        const dailyTokens = dbDaily > 0 ? dbDaily : TrailDataServer.getDailyTokensFromJsonl();
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
      } catch {
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
        res.writeHead(500, JSON_HEADERS);
        res.end(JSON.stringify({ error: String(e) }));
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

    if (this.docLinks.length > 0) {
      const docMsg: ServerMessage = { type: 'doc-links-updated', docLinks: this.docLinks };
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

  private handleWsMessage(data: unknown): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return;
    }

    if (!isClientMessage(parsed)) return;

    if (parsed.type === 'generate-code-graph') {
      if (this.codeGraphService) {
        void this.codeGraphService
          .generate((phase, percent) => this.notifyCodeGraphProgress(phase, percent))
          .then(() => this.notifyCodeGraphUpdated())
          .catch((err) => TrailLogger.error('Failed to generate code graph', err));
      }
      return;
    }

    // provider 不要のコマンドはここで処理する。
    // C4Panel 撤去後 setC4Provider を呼ぶ箇所が無く provider が常に undefined のため、
    // ファイルを開くだけのコマンドを provider 必須ロジックに巻き込まれて drop させない。
    if (parsed.type === 'open-doc-link') {
      this.onOpenDocLink?.(parsed.path);
      return;
    }
    if (parsed.type === 'open-file') {
      this.onOpenFile?.(parsed.filePath);
      return;
    }
    if (parsed.type === 'perf-report') {
      // TRAIL_DEBUG_PERF=1 の時のみ OutputChannel に出力（既定で常時 silent）
      TrailLogger.debugPerf({ metric: parsed.metric, ms: parsed.ms, meta: parsed.meta });
      return;
    }

    const provider = this.getC4Provider?.();
    if (!provider) return;
    this.dispatchClientMessage(parsed, provider);
  }

  private dispatchClientMessage(
    message: ClientMessage,
    provider: C4DataProvider,
  ): void {
    switch (message.type) {
      case 'set-level':
        provider.handleSetDsmLevel(message.level);
        break;
      case 'cluster':
        provider.handleCluster(message.enabled);
        break;
      case 'refresh':
        provider.handleRefresh();
        break;
      case 'open-doc-link':
        this.onOpenDocLink?.(message.path);
        break;
      case 'open-file':
        this.onOpenFile?.(message.filePath);
        break;
      case 'reset-claude-activity':
        provider.handleResetClaudeActivity();
        break;
      case 'generate-code-graph':
        // handled in handleWsMessage before requiring provider
        break;
    }
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
    fileAggregates: Map<string, import('@anytime-markdown/trail-core/deadCode').FileImportanceAggregate>;
    lineCountByFile: ReadonlyMap<string, number>;
  } | null> {
    if (this.importanceComputing) return null;
    this.importanceComputing = true;
    try {
      // C4 model is no longer needed here — element aggregation now happens in the REST endpoint at fetch time.
      // We compute per-function ScoredFunction[] and per-file aggregate, leaving element-level aggregation to consumers.
      const { TypeScriptAdapter, ImportanceAnalyzer } = await import('@anytime-markdown/trail-core/importance');
      const { aggregateImportanceToFile } = await import('@anytime-markdown/trail-core/deadCode');
      // TypeScriptAdapter は trail-core 側の typescript (5.8.x) で定義された
      // ts.Program を期待する。本拡張機能側 (5.9.x) との型差異を吸収するため
      // unknown 経由でキャストする (Program API は構造的に互換)。
      const adapter = TypeScriptAdapter.fromProgram(
        program as unknown as Parameters<typeof TypeScriptAdapter.fromProgram>[0],
      );
      const resolvedDir = path.dirname(path.resolve(tsconfigPath));
      const isExcluded = (sf: { isDeclarationFile: boolean; fileName: string }): boolean => {
        if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) return true;
        if (!exclude) return false;
        const relPath = path.relative(resolvedDir, sf.fileName).split(path.sep).join('/');
        if (relPath === '' || relPath.startsWith('../')) return false;
        return exclude.ignores(relPath);
      };
      const allSourceFiles = adapter
        .getProgram()
        .getSourceFiles()
        .filter((sf) => !isExcluded(sf))
        .map((sf) => sf.fileName);
      const analyzer = new ImportanceAnalyzer(adapter);
      let scored: ReturnType<typeof analyzer.analyze>;
      try {
        scored = analyzer.analyze(allSourceFiles);
      } catch (err) {
        TrailLogger.error('[importance] analyzer.analyze failed', err);
        return null;
      }
      const fileAggregates = aggregateImportanceToFile(scored);
      // SourceFile の行数を相対パスでインデックスする（tsconfig ディレクトリ基準）
      const lineCountByFile = new Map<string, number>();
      for (const sf of adapter.getProgram().getSourceFiles()) {
        if (isExcluded(sf)) continue;
        const relPath = path.relative(resolvedDir, sf.fileName);
        const loc = sf.getLineAndCharacterOfPosition(sf.end).line + 1;
        lineCountByFile.set(relPath, loc);
      }
      return { scored, fileAggregates, lineCountByFile };
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

  private notifyDocLinks(): void {
    if (this.clients.size === 0) return;
    const message: ServerMessage = { type: 'doc-links-updated', docLinks: this.docLinks };
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
        TrailLogger.warn(`[/api/c4/exports] model or graph not available for componentId=${componentId}`);
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
          TrailLogger.warn(`[/api/c4/exports] path traversal blocked: ${node.filePath}`);
          continue;
        }
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          sourceFiles.push(createSourceFile(node.filePath, content));
        } catch (e) {
          TrailLogger.error(`[/api/c4/exports] failed to read file: ${node.filePath}`, e);
        }
      }

      const symbols = ExportExtractor.extract(sourceFiles, componentId);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ symbols }));
    } catch (e) {
      TrailLogger.error(`[/api/c4/exports] error: componentId=${componentId}`, e);
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
        TrailLogger.warn(`[/api/c4/functions] path traversal blocked: ${node.filePath}`);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ symbols: [] }));
        return;
      }
      let sourceFile;
      try {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        sourceFile = createSourceFile(node.filePath, content);
      } catch (e) {
        TrailLogger.error(`[/api/c4/functions] failed to read file: ${node.filePath}`, e);
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ symbols: [] }));
        return;
      }
      const symbols = ExportExtractor.extract([sourceFile], elementId);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ symbols }));
    } catch (e) {
      TrailLogger.error(`[/api/c4/functions] error: elementId=${elementId}`, e);
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
        TrailLogger.warn(`[/api/c4/flowchart] model or graph not available for componentId=${componentId}`);
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
          TrailLogger.warn(`[/api/c4/flowchart] path traversal blocked: ${node.filePath}`);
          continue;
        }
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          sourceFiles.push(createSourceFile(node.filePath, content));
        } catch (e) {
          TrailLogger.error(`[/api/c4/flowchart] failed to read file: ${node.filePath}`, e);
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
      TrailLogger.error(`[/api/c4/flowchart] error: componentId=${componentId}, symbolId=${symbolId}`, e);
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
        TrailLogger.warn(`[/api/c4/sequence] model or graph not available for elementId=${elementId}`);
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
          TrailLogger.warn(`[/api/c4/sequence] path traversal blocked: ${node.filePath}`);
          continue;
        }
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          sourceFiles.set(node.filePath, createSourceFile(node.filePath, content));
        } catch (e) {
          TrailLogger.error(`[/api/c4/sequence] failed to read file: ${node.filePath}`, e);
        }
      }

      const sequenceModel = SequenceAnalyzer.build(elementId, model, graph, sourceFiles);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(sequenceModel));
    } catch (e) {
      TrailLogger.error(`[/api/c4/sequence] error: elementId=${elementId}`, e);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(emptyModel));
    }
  }

  private async handleCreateManualElement(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const body = await this.readJsonBody(req);
    if (!this.isValidElementInput(body)) { res.writeHead(400); res.end('invalid body'); return; }
    const id = this.trailDb.saveManualElement(repoName, body);
    const element = this.trailDb.getManualElements(repoName).find(e => e.id === id);
    res.writeHead(201, JSON_HEADERS);
    res.end(JSON.stringify({ element }));
    this.notify('model-updated');
  }

  private async handleUpdateManualElement(req: http.IncomingMessage, res: http.ServerResponse, url: URL, id: string): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const existing = this.trailDb.getManualElements(repoName).find(e => e.id === id);
    if (!existing) { res.writeHead(404); res.end('not found'); return; }
    const body = await this.readJsonBody(req);
    this.trailDb.updateManualElement(repoName, id, body as { name?: string; description?: string; external?: boolean });
    const updated = this.trailDb.getManualElements(repoName).find(e => e.id === id);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ element: updated }));
    this.notify('model-updated');
  }

  private handleDeleteManualElement(res: http.ServerResponse, url: URL, id: string): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    this.trailDb.deleteManualElement(repoName, id);
    res.writeHead(204); res.end();
    this.notify('model-updated');
  }

  private async handleCreateManualRelationship(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const body = await this.readJsonBody(req) as Record<string, unknown>;
    if (!body?.fromId || !body?.toId) { res.writeHead(400); res.end('invalid body'); return; }
    const id = this.trailDb.saveManualRelationship(repoName, {
      fromId: String(body.fromId),
      toId: String(body.toId),
      label: body.label ? String(body.label) : undefined,
      technology: body.technology ? String(body.technology) : undefined,
    });
    const rel = this.trailDb.getManualRelationships(repoName).find(r => r.id === id);
    res.writeHead(201, JSON_HEADERS);
    res.end(JSON.stringify({ relationship: rel }));
    this.notify('model-updated');
  }

  private handleListManualRelationships(res: http.ServerResponse, url: URL): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const relationships = this.trailDb.getManualRelationships(repoName);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(relationships));
  }

  private handleDeleteManualRelationship(res: http.ServerResponse, url: URL, id: string): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    this.trailDb.deleteManualRelationship(repoName, id);
    res.writeHead(204); res.end();
    this.notify('model-updated');
  }

  private handleListManualGroups(res: http.ServerResponse, url: URL): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const groups = this.trailDb.getManualGroups(repoName);
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(groups));
  }

  private async handleCreateManualGroup(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const body = await this.readJsonBody(req) as Record<string, unknown>;
    if (!Array.isArray(body?.memberIds) || body.memberIds.length < 2) {
      res.writeHead(400); res.end('memberIds must have at least 2 elements'); return;
    }
    const id = this.trailDb.saveManualGroup(repoName, {
      memberIds: body.memberIds.map(String),
      label: body.label ? String(body.label) : undefined,
    });
    const group = this.trailDb.getManualGroups(repoName).find(g => g.id === id);
    res.writeHead(201, JSON_HEADERS);
    res.end(JSON.stringify({ group }));
    this.notify('model-updated');
  }

  private async handleUpdateManualGroup(req: http.IncomingMessage, res: http.ServerResponse, url: URL, id: string): Promise<void> {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    const body = await this.readJsonBody(req) as Record<string, unknown>;
    this.trailDb.updateManualGroup(repoName, id, {
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : undefined,
      label: 'label' in body ? (body.label == null ? null : String(body.label)) : undefined,
    });
    res.writeHead(204); res.end();
    this.notify('model-updated');
  }

  private handleDeleteManualGroup(res: http.ServerResponse, url: URL, id: string): void {
    const repoName = url.searchParams.get('repoName');
    if (!repoName) { res.writeHead(400); res.end('repoName required'); return; }
    this.trailDb.deleteManualGroup(repoName, id);
    res.writeHead(204); res.end();
    this.notify('model-updated');
  }

  private isValidElementInput(body: unknown): body is { type: string; name: string; external: boolean; parentId: string | null; description?: string; serviceType?: string } {
    if (typeof body !== 'object' || body === null) return false;
    const b = body as Record<string, unknown>;
    if (!['person', 'system', 'container', 'component'].includes(String(b.type))) return false;
    if (typeof b.name !== 'string' || b.name.length === 0) return false;
    if (b.serviceType !== undefined && typeof b.serviceType !== 'string') return false;
    return true;
  }

  // -------------------------------------------------------------------------
  //  Community summary / mapping handlers (GET/POST /api/c4/communities/*)
  // -------------------------------------------------------------------------

  private handleListCommunities(res: http.ServerResponse, url: URL): void {
    const repoName = url.searchParams.get('repoName') ?? url.searchParams.get('repo');
    if (!repoName) {
      res.writeHead(400, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'repoName required' }));
      return;
    }
    try {
      const communities = this.trailDb.listCurrentCodeGraphCommunities(repoName);
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ communities }));
    } catch (err) {
      TrailLogger.error('handleListCommunities failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async handleUpsertCommunitySummaries(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const body = (await this.readJsonBody(req)) as {
        repoName?: string;
        summaries?: ReadonlyArray<{ communityId: number; name: string; summary: string }>;
      };
      const repoName = body.repoName ?? url.searchParams.get('repoName') ?? url.searchParams.get('repo');
      if (!repoName) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'repoName required (in body or query)' }));
        return;
      }
      if (!Array.isArray(body.summaries)) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'summaries array required' }));
        return;
      }
      const result = this.trailDb.upsertCurrentCodeGraphCommunitySummaries(repoName, body.summaries);
      // codeGraphService の in-memory cache を DB と同期してから client に通知。
      // これにより /api/code-graph が新しい communitySummaries を返し、
      // useCodeGraph 側で WS 経由 refetch が走る → Reload Window 不要。
      await this.refreshCodeGraphCache();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
      this.notify('model-updated');
      this.notifyCodeGraphUpdated();
    } catch (err) {
      TrailLogger.error('handleUpsertCommunitySummaries failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async handleUpsertCommunityMappings(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const body = (await this.readJsonBody(req)) as {
        repoName?: string;
        mappings?: ReadonlyArray<{
          communityId: number;
          mappings: ReadonlyArray<{ elementId: string; elementType: string; role: 'primary' | 'secondary' | 'dependency' }>;
        }>;
      };
      const repoName = body.repoName ?? url.searchParams.get('repoName') ?? url.searchParams.get('repo');
      if (!repoName) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'repoName required (in body or query)' }));
        return;
      }
      if (!Array.isArray(body.mappings)) {
        res.writeHead(400, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'mappings array required' }));
        return;
      }
      const result = this.trailDb.upsertCurrentCodeGraphCommunityMappings(repoName, body.mappings);
      await this.refreshCodeGraphCache();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(result));
      this.notify('model-updated');
      this.notifyCodeGraphUpdated();
    } catch (err) {
      TrailLogger.error('handleUpsertCommunityMappings failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  /**
   * codeGraphService の in-memory cache を最新の DB 状態で再構築する。
   * MCP/HTTP 経由でコミュニティ name/summary/mappings_json が更新されたとき、
   * 直接 sql.js の DB ファイルが書き換わったとしても、
   * 拡張プロセスの cached graph は変わらないため、明示的に load し直す必要がある。
   * 失敗してもレスポンスは成功扱い（cache 不整合でも DB は正しいため、Reload で復帰可能）。
   */
  private async refreshCodeGraphCache(): Promise<void> {
    if (!this.codeGraphService) return;
    try {
      await this.codeGraphService.loadFromDb();
    } catch (err) {
      TrailLogger.warn(`[community-upsert] cache compose failed (loadFromDb): ${err instanceof Error ? err.message : String(err)}`);
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
      TrailLogger.error('handleAnalyzeCurrent failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
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
      TrailLogger.error('handleAnalyzeRelease failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
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
      TrailLogger.error('handleAnalyzeAll failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    } finally {
      this.analysisInProgress = null;
    }
  }

  private handleAnalyzeStatus(res: http.ServerResponse): void {
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ inProgress: this.analysisInProgress }));
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
  const validTypes = ['set-level', 'cluster', 'refresh', 'open-doc-link', 'reset-claude-activity', 'generate-code-graph', 'open-file', 'perf-report'];
  return typeof msg.type === 'string' && validTypes.includes(msg.type);
}

// ---------------------------------------------------------------------------
//  Helper: scan local docs directory for DocLink entries
// ---------------------------------------------------------------------------

async function scanLocalDocs(docsDir: string): Promise<DocLink[]> {
  const docs: DocLink[] = [];

  let entries: string[];
  try {
    entries = await collectMarkdownFiles(docsDir, '');
  } catch {
    return docs;
  }

  for (const relPath of entries) {
    try {
      const content = await fs.promises.readFile(path.join(docsDir, relPath), 'utf-8');
      const meta = parseLocalFrontmatter(content);
      if (meta) {
        docs.push({ ...meta, path: relPath });
      }
    } catch {
      // skip unreadable files
    }
  }
  return docs;
}

async function collectMarkdownFiles(base: string, rel: string): Promise<string[]> {
  const results: string[] = [];
  const dir = rel ? path.join(base, rel) : base;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...await collectMarkdownFiles(base, entryRel));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(entryRel);
    }
  }
  return results;
}

function parseLocalFrontmatter(raw: string): Omit<DocLink, 'path'> | null {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!fmMatch) return null;
  const fm = fmMatch[1];

  const scopeLines: string[] = [];
  let inScope = false;
  for (const line of fm.split(/\r?\n/)) {
    if (/^c4Scope\s*:/.test(line)) {
      inScope = true;
      const inline = /\[([^\]]*)\]/.exec(line);
      if (inline) {
        scopeLines.push(
          ...inline[1].split(',').map(s => s.trim().replaceAll(/^["']|["']$/g, '')).filter(Boolean),
        );
        inScope = false;
      }
      continue;
    }
    if (inScope) {
      if (/^\s+-\s+/.test(line)) {
        scopeLines.push(line.replace(/^\s+-\s+/, '').trim().replaceAll(/^["']|["']$/g, ''));
      } else {
        inScope = false;
      }
    }
  }
  if (scopeLines.length === 0) return null;

  const titleMatch = /^title\s*:\s*"?(.+?)"?\s*$/m.exec(fm);
  const typeMatch = /^type\s*:\s*"?(\w+)"?\s*$/m.exec(fm);
  const dateMatch = /^date\s*:\s*"?(\d{4}-\d{2}-\d{2})"?\s*$/m.exec(fm);

  return {
    title: titleMatch?.[1] ?? 'Untitled',
    type: typeMatch?.[1] ?? 'unknown',
    c4Scope: scopeLines,
    date: dateMatch?.[1] ?? '',
  };
}

// ---------------------------------------------------------------------------
//  Prompt file scanner
// ---------------------------------------------------------------------------

interface PromptEntry {
  id: string;
  name: string;
  content: string;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function scanPromptFiles(): PromptEntry[] {
  const claudeDir = path.join(os.homedir(), '.claude');
  const prompts: PromptEntry[] = [];
  let version = 1;

  // Helper to add a prompt entry
  function addFile(filePath: string, tags: string[]): void {
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) return;
      const content = fs.readFileSync(filePath, 'utf-8');
      const name = path.basename(filePath, '.md');
      const relPath = path.relative(claudeDir, filePath);
      const id = relPath.replaceAll(/[/\\. ]+/g, '-').toLowerCase();
      prompts.push({
        id,
        name,
        content,
        version: version++,
        tags,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      // skip
    }
  }

  // 1. Global CLAUDE.md
  addFile(path.join(claudeDir, 'CLAUDE.md'), ['main']);

  // 2. Rules
  const rulesDir = path.join(claudeDir, 'rules');
  try {
    for (const f of fs.readdirSync(rulesDir)) {
      if (f.endsWith('.md')) {
        addFile(path.join(rulesDir, f), ['rule']);
      }
    }
  } catch {
    // rules dir may not exist
  }

  // 3. Project CLAUDE.md files
  const projectsDir = path.join(claudeDir, 'projects');
  try {
    for (const proj of fs.readdirSync(projectsDir)) {
      const projClaudeMd = path.join(projectsDir, proj, 'CLAUDE.md');
      if (fs.existsSync(projClaudeMd)) {
        addFile(projClaudeMd, ['project', proj]);
      }
    }
  } catch {
    // projects dir may not exist
  }

  // 4. Memory
  const memoryDir = path.join(claudeDir, 'projects');
  try {
    for (const proj of fs.readdirSync(memoryDir)) {
      const memDir = path.join(memoryDir, proj, 'memory');
      if (fs.existsSync(memDir) && fs.statSync(memDir).isDirectory()) {
        for (const f of fs.readdirSync(memDir)) {
          if (f.endsWith('.md')) {
            addFile(path.join(memDir, f), ['memory', proj]);
          }
        }
      }
    }
  } catch {
    // skip
  }

  // 5. Skills (SKILL.md in each skill directory)
  const skillsDir = path.join(claudeDir, 'skills');
  try {
    for (const skillName of fs.readdirSync(skillsDir)) {
      const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        addFile(skillFile, ['skill', skillName]);
      }
    }
  } catch {
    // skills dir may not exist
  }

  // 6. Scripts
  const scriptsDir = path.join(claudeDir, 'scripts');
  try {
    for (const f of fs.readdirSync(scriptsDir)) {
      const scriptFile = path.join(scriptsDir, f);
      if (!fs.existsSync(scriptFile) || !fs.statSync(scriptFile).isFile()) continue;
      addFile(scriptFile, ['script']);
    }
  } catch {
    // scripts dir may not exist
  }

  // 7. settings.json
  const settingsFile = path.join(claudeDir, 'settings.json');
  try {
    const stat = fs.statSync(settingsFile);
    if (stat.isFile()) {
      const content = fs.readFileSync(settingsFile, 'utf-8');
      prompts.push({
        id: 'settings-json',
        name: 'settings.json',
        content,
        version: version++,
        tags: ['config'],
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      });
    }
  } catch {
    // skip
  }

  return prompts;
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
