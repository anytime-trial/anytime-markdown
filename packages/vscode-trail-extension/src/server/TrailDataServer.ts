import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { trailToC4 } from '@anytime-markdown/trail-core';
import {
  buildElementTree,
  detectCycles,
  diffMatrix,
  filterTreeByLevel,
} from '@anytime-markdown/trail-core/c4';
import type {
  BoundaryInfo,
  C4Model,
  CoverageDiffMatrix,
  CoverageMatrix,
  CyclicPair,
  DocLink,
  DsmDiff,
  DsmMapping,
  DsmMatrix,
  FeatureMatrix,
} from '@anytime-markdown/trail-core/c4';
import { WebSocketServer, type WebSocket } from 'ws';

import type { ClientMessage, ServerMessage } from './types';
import type { TrailDatabase, SessionRow, MessageRow, AnalyticsData, CostOptimizationData } from '../trail/TrailDatabase';

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const BIND_HOST = '127.0.0.1';
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX = 60;

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

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
  readonly model: C4Model | undefined;
  readonly boundaries: readonly BoundaryInfo[] | undefined;
  readonly featureMatrix: FeatureMatrix | undefined;
  readonly c4Matrix: DsmMatrix | undefined;
  readonly sourceMatrix: DsmMatrix | undefined;
  readonly currentDsmLevel: 'component' | 'package';
  readonly currentDsmMode: 'c4' | 'diff';
  readonly dsmMappings: readonly DsmMapping[];
  readonly coverageMatrix: CoverageMatrix | undefined;
  readonly coverageDiff: CoverageDiffMatrix | undefined;
  handleSetDsmLevel(level: 'component' | 'package'): void;
  handleSetDsmMode(mode: 'c4' | 'diff'): void;
  handleCluster(enabled: boolean): void;
  handleRefresh(): void;
  handleAddElement(element: { type: 'person' | 'system'; name: string; description?: string; external?: boolean }): void;
  handleUpdateElement(id: string, changes: { name?: string; description?: string; external?: boolean }): void;
  handleRemoveElement(id: string): void;
  handlePurgeDeletedElements(): void;
  handleAddRelationship(from: string, to: string, label?: string, technology?: string): void;
  handleRemoveRelationship(from: string, to: string): void;
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
  onOpenDocLink: ((docPath: string) => void) | undefined;
  /** Cached tree result keyed by model reference + level */
  private treeCache: { model: C4Model; level: number; json: string } | undefined;

  constructor(
    private readonly distPath: string,
    private readonly trailDb: TrailDatabase,
    private readonly gitRoot?: string,
  ) {}

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

  setC4Provider(getProvider: () => C4DataProvider | undefined): void {
    this.getC4Provider = getProvider;
  }

  notify(type: 'model-updated' | 'dsm-updated' | 'coverage-updated' | 'coverage-diff-updated'): void {
    if (type === 'model-updated') this.treeCache = undefined;
    if (this.clients.size === 0) return;

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

    const sessionMatch = /^\/api\/trail\/sessions\/([^/]+)$/.exec(pathname);
    if (sessionMatch && method === 'GET') {
      this.handleGetSession(res, decodeURIComponent(sessionMatch[1]));
      return;
    }

    if (pathname === '/api/c4/releases' && method === 'GET') {
      this.handleC4ReleasesEndpoint(res);
      return;
    }

    if (pathname === '/api/c4/model' && method === 'GET') {
      const releaseId = parsed.searchParams.get('release') ?? 'current';
      this.handleC4ModelEndpoint(res, releaseId);
      return;
    }
    if (pathname === '/api/c4/dsm' && method === 'GET') {
      this.handleC4DsmEndpoint(res);
      return;
    }
    if (pathname === '/api/c4/diff' && method === 'GET') {
      this.handleC4DiffEndpoint(res);
      return;
    }
    if (pathname === '/api/c4/tree' && method === 'GET') {
      this.handleC4TreeEndpoint(res);
      return;
    }
    if (pathname === '/api/c4/doc-links' && method === 'GET') {
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ docLinks: this.docLinks }));
      return;
    }
    if (pathname === '/api/c4/coverage' && method === 'GET') {
      this.handleC4CoverageEndpoint(res);
      return;
    }

    res.writeHead(404);
    res.end();
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
        project?: string;
        from?: string;
        to?: string;
      } = {};

      const branch = params.get('branch');
      const model = params.get('model');
      const project = params.get('project');
      const from = params.get('from');
      const to = params.get('to');

      if (branch) filters.branch = branch;
      if (model) filters.model = model;
      if (project) filters.project = project;
      if (from) filters.from = from;
      if (to) filters.to = to;

      const rawSessions = this.trailDb.getSessions(filters);
      const sessionIds = rawSessions.map((s) => s.id);
      const contextStats = this.trailDb.getSessionContextStats(sessionIds);
      const commitStats = this.trailDb.getSessionCommitStats(sessionIds);
      const interruptions = this.trailDb.getSessionInterruptions(sessionIds);
      const branchMap = this.trailDb.getSessionBranches(sessionIds);
      const sessions = rawSessions.map((s) => {
        const stats = contextStats.get(s.id);
        const cStats = commitStats.get(s.id);
        const intr = interruptions.get(s.id);
        return {
          id: s.id,
          slug: s.slug,
          project: s.project,
          gitBranch: branchMap.get(s.id) ?? '',
          model: s.model,
          version: s.version,
          startTime: s.start_time,
          endTime: s.end_time,
          messageCount: s.message_count,
          peakContextTokens: stats?.peak ?? 0,
          initialContextTokens: stats?.initial ?? 0,
          interruption: intr ?? undefined,
          usage: {
            inputTokens: s.input_tokens ?? 0,
            outputTokens: s.output_tokens ?? 0,
            cacheReadTokens: s.cache_read_tokens ?? 0,
            cacheCreationTokens: s.cache_creation_tokens ?? 0,
          },
          estimatedCostUsd: s.estimated_cost_usd ?? 0,
          commitStats: cStats
            ? { commits: cStats.commits, linesAdded: cStats.linesAdded,
                linesDeleted: cStats.linesDeleted, filesChanged: cStats.filesChanged }
            : undefined,
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
      const messages = rawMessages.map((m) => ({
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
      }));
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
  //  API: C4 endpoints
  // -------------------------------------------------------------------------

  private handleC4ModelEndpoint(res: http.ServerResponse, releaseId: string): void {
    // trail_graphs から TrailGraph を取得して trailToC4() で変換
    const graph = this.trailDb.getTrailGraph(releaseId);
    if (graph) {
      const model = trailToC4(graph);
      const provider = this.getC4Provider?.();
      const featureMatrix = provider?.featureMatrix;
      const payload: Record<string, unknown> = { model, boundaries: [] };
      if (featureMatrix) {
        payload.featureMatrix = featureMatrix;
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(payload));
      return;
    }

    // フォールバック: C4Panel のメモリ上データ（releaseId === 'current' の場合のみ）
    if (releaseId === 'current') {
      const provider = this.getC4Provider?.();
      const model = provider?.model;
      if (model) {
        const boundaries = provider?.boundaries ?? [];
        const featureMatrix = provider?.featureMatrix;
        const payload: Record<string, unknown> = { model, boundaries };
        if (featureMatrix) {
          payload.featureMatrix = featureMatrix;
        }
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify(payload));
        return;
      }
    }

    res.writeHead(204);
    res.end();
  }

  private handleC4ReleasesEndpoint(res: http.ServerResponse): void {
    try {
      const ids = this.trailDb.getTrailGraphIds();
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify(ids));
    } catch {
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to get C4 releases' }));
    }
  }

  private handleC4DsmEndpoint(res: http.ServerResponse): void {
    const provider = this.getC4Provider?.();
    const matrix = provider?.currentDsmMode === 'c4'
      ? provider?.c4Matrix
      : provider?.sourceMatrix;

    if (!matrix) {
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ matrix }));
  }

  private handleC4DiffEndpoint(res: http.ServerResponse): void {
    const provider = this.getC4Provider?.();
    const result = computeDiff(provider);

    if (!result) {
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(result));
  }

  private handleC4TreeEndpoint(res: http.ServerResponse): void {
    const provider = this.getC4Provider?.();
    const model = provider?.model;

    if (!model) {
      res.writeHead(204);
      res.end();
      return;
    }

    const level = DSM_LEVEL_MAP[provider?.currentDsmLevel ?? 'component'] ?? 3;

    if (this.treeCache?.model === model && this.treeCache.level === level) {
      res.writeHead(200, JSON_HEADERS);
      res.end(this.treeCache.json);
      return;
    }

    const boundaries = provider?.boundaries ?? [];
    const fullTree = buildElementTree(model, boundaries);
    const tree = filterTreeByLevel(fullTree, level);
    const json = JSON.stringify({ tree });

    this.treeCache = { model, level, json };

    res.writeHead(200, JSON_HEADERS);
    res.end(json);
  }

  private handleC4CoverageEndpoint(res: http.ServerResponse): void {
    const provider = this.getC4Provider?.();
    const coverageMatrix = provider?.coverageMatrix;
    const coverageDiff = provider?.coverageDiff;
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ coverageMatrix: coverageMatrix ?? null, coverageDiff: coverageDiff ?? null }));
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
  //  API: GET /api/trail/releases
  // -------------------------------------------------------------------------

  private handleGetReleases(res: http.ServerResponse): void {
    try {
      const rows = this.trailDb.getReleases();
      const releases = rows.map((row) => ({
        tag: row.tag,
        releasedAt: row.released_at,
        prevTag: row.prev_tag,
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
    this.trailDb
      .importAll(undefined, this.gitRoot)
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

  // -------------------------------------------------------------------------
  //  C4 WebSocket handling
  // -------------------------------------------------------------------------

  private sendC4CurrentState(ws: WebSocket): void {
    const provider = this.getC4Provider?.();
    if (!provider) return;

    const modelMsg = this.buildModelMessage(provider);
    if (modelMsg) {
      ws.send(JSON.stringify(modelMsg));
    }

    const dsmMsg = this.buildDsmMessage(provider);
    if (dsmMsg) {
      ws.send(JSON.stringify(dsmMsg));
    }

    if (this.docLinks.length > 0) {
      const docMsg: ServerMessage = { type: 'doc-links-updated', docLinks: this.docLinks };
      ws.send(JSON.stringify(docMsg));
    }
  }

  private handleWsMessage(data: unknown): void {
    const provider = this.getC4Provider?.();
    if (!provider) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return;
    }

    if (!isClientMessage(parsed)) return;
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
      case 'set-dsm-mode':
        provider.handleSetDsmMode(message.mode);
        break;
      case 'cluster':
        provider.handleCluster(message.enabled);
        break;
      case 'refresh':
        provider.handleRefresh();
        break;
      case 'add-element':
        provider.handleAddElement(message.element);
        break;
      case 'update-element':
        provider.handleUpdateElement(message.id, message.changes);
        break;
      case 'remove-element':
        provider.handleRemoveElement(message.id);
        break;
      case 'purge-deleted-elements':
        provider.handlePurgeDeletedElements();
        break;
      case 'open-doc-link':
        this.onOpenDocLink?.(message.path);
        break;
      case 'add-relationship':
        provider.handleAddRelationship(message.from, message.to, message.label, message.technology);
        break;
      case 'remove-relationship':
        provider.handleRemoveRelationship(message.from, message.to);
        break;
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
    type: 'model-updated' | 'dsm-updated' | 'coverage-updated' | 'coverage-diff-updated',
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    if (type === 'model-updated') {
      return this.buildModelMessage(provider);
    }
    if (type === 'coverage-updated') {
      const coverageMatrix = provider.coverageMatrix;
      if (!coverageMatrix) return undefined;
      return { type: 'coverage-updated', coverageMatrix };
    }
    if (type === 'coverage-diff-updated') {
      const coverageDiff = provider.coverageDiff;
      if (!coverageDiff) return undefined;
      return { type: 'coverage-diff-updated', coverageDiff };
    }
    return this.buildDsmMessage(provider);
  }

  private buildModelMessage(
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    const model = provider.model;
    if (!model) return undefined;
    const boundaries = provider.boundaries ?? [];
    const featureMatrix = provider.featureMatrix;

    return { type: 'model-updated', model, boundaries, featureMatrix };
  }

  private buildDsmMessage(
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    if (provider.currentDsmMode === 'diff') {
      return this.buildDsmDiffMessage(provider);
    }
    return this.buildDsmMatrixMessage(provider);
  }

  private buildDsmMatrixMessage(
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    const matrix = provider.c4Matrix;
    if (!matrix) return undefined;
    return { type: 'dsm-updated', matrix };
  }

  private buildDsmDiffMessage(
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    const result = computeDiff(provider);
    if (!result) return undefined;
    return { type: 'dsm-updated', diff: result.diff, cycles: result.cycles };
  }
}

// ---------------------------------------------------------------------------
//  Helper: ClientMessage type guard
// ---------------------------------------------------------------------------

export function isClientMessage(data: unknown): data is ClientMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  const validTypes = [
    'set-level', 'set-dsm-mode', 'cluster', 'refresh',
    'add-element', 'update-element', 'remove-element',
    'add-relationship', 'remove-relationship', 'purge-deleted-elements',
    'open-doc-link',
  ];
  return typeof msg.type === 'string' && validTypes.includes(msg.type);
}

// ---------------------------------------------------------------------------
//  Helper: compute diff + cycles from provider
// ---------------------------------------------------------------------------

function computeDiff(
  provider: C4DataProvider | undefined,
): { diff: DsmDiff; cycles: readonly CyclicPair[] } | undefined {
  const c4Matrix = provider?.c4Matrix;
  const sourceMatrix = provider?.sourceMatrix;
  if (!c4Matrix || !sourceMatrix) return undefined;

  const mappings = provider?.dsmMappings ?? [];
  const diff = diffMatrix(c4Matrix, sourceMatrix, mappings);
  const cycles = computeCyclicPairs(c4Matrix);
  return { diff, cycles };
}

// ---------------------------------------------------------------------------
//  Helper: compute cyclic pairs from a DSM matrix
// ---------------------------------------------------------------------------

function computeCyclicPairs(matrix: DsmMatrix): readonly CyclicPair[] {
  const nodeIds = matrix.nodes.map(n => n.id);
  const sccs = detectCycles(matrix.adjacency, nodeIds);

  return sccs.flatMap(scc => {
    const pairs: CyclicPair[] = [];
    for (let i = 0; i < scc.length; i++) {
      for (let j = i + 1; j < scc.length; j++) {
        pairs.push({ nodeA: scc[i], nodeB: scc[j] });
      }
    }
    return pairs;
  });
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

  // 6. settings.json
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
