import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { WebSocketServer, type WebSocket } from 'ws';

import type { TrailDatabase, SessionRow, MessageRow, AnalyticsData } from '../trail/TrailDatabase';

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

    const commitsMatch = /^\/api\/trail\/sessions\/([^/]+)\/commits$/.exec(pathname);
    if (commitsMatch && method === 'GET') {
      this.handleGetSessionCommits(res, decodeURIComponent(commitsMatch[1]));
      return;
    }

    const sessionMatch = /^\/api\/trail\/sessions\/([^/]+)$/.exec(pathname);
    if (sessionMatch && method === 'GET') {
      this.handleGetSession(res, decodeURIComponent(sessionMatch[1]));
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
      } = {};

      const branch = params.get('branch');
      const model = params.get('model');
      const project = params.get('project');

      if (branch) filters.branch = branch;
      if (model) filters.model = model;
      if (project) filters.project = project;

      const rawSessions = this.trailDb.getSessions(filters);
      const sessionIds = rawSessions.map((s) => s.id);
      const contextStats = this.trailDb.getSessionContextStats(sessionIds);
      const commitStats = this.trailDb.getSessionCommitStats(sessionIds);
      const sessions = rawSessions.map((s) => {
        const stats = contextStats.get(s.id);
        const cStats = commitStats.get(s.id);
        return {
          id: s.id,
          slug: s.slug,
          project: s.project,
          gitBranch: s.git_branch,
          model: s.model,
          version: s.version,
          startTime: s.start_time,
          endTime: s.end_time,
          messageCount: s.message_count,
          peakContextTokens: stats?.peak ?? 0,
          initialContextTokens: stats?.initial ?? 0,
          usage: {
            inputTokens: s.input_tokens,
            outputTokens: s.output_tokens,
            cacheReadTokens: s.cache_read_tokens,
            cacheCreationTokens: s.cache_creation_tokens,
          },
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
