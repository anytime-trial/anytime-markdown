import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import type { TrailSession } from '@anytime-markdown/trail-viewer';
import { parseSession } from '@anytime-markdown/trail-viewer';
import { WebSocketServer, type WebSocket } from 'ws';

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const BIND_HOST = '127.0.0.1';
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX = 60;

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
};

/** Number of lines to read from the beginning of a JSONL file for metadata. */
const METADATA_HEAD_LINES = 20;

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface SessionSummary {
  readonly id: string;
  readonly slug: string;
  readonly project: string;
  readonly gitBranch: string;
  readonly version: string;
  readonly model: string;
  readonly messageCount: number;
  readonly mtime: number;
  readonly filePath: string;
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

  constructor(private readonly distPath: string) {}

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
    if (pathname === '/api/trail/sessions') {
      this.handleGetSessions(res, parsed.searchParams);
      return;
    }
    if (pathname === '/api/trail/search') {
      this.handleSearch(res, parsed.searchParams.get('q') ?? '');
      return;
    }

    const sessionMatch = /^\/api\/trail\/sessions\/([^/]+)$/.exec(pathname);
    if (sessionMatch) {
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
    const branchFilter = params.get('branch');
    const modelFilter = params.get('model');
    const projectFilter = params.get('project');

    discoverSessions()
      .then((sessions) => {
        let filtered = sessions;
        if (branchFilter) {
          filtered = filtered.filter((s) => s.gitBranch === branchFilter);
        }
        if (modelFilter) {
          filtered = filtered.filter((s) => s.model.includes(modelFilter));
        }
        if (projectFilter) {
          filtered = filtered.filter((s) => s.project === projectFilter);
        }

        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ sessions: filtered }));
      })
      .catch(() => {
        res.writeHead(500, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'Failed to read sessions' }));
      });
  }

  // -------------------------------------------------------------------------
  //  API: GET /api/trail/sessions/:id
  // -------------------------------------------------------------------------

  private handleGetSession(
    res: http.ServerResponse,
    sessionId: string,
  ): void {
    discoverSessions()
      .then((sessions) => {
        const summary = sessions.find((s) => s.id === sessionId);
        if (!summary) {
          res.writeHead(404, JSON_HEADERS);
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        return fs.promises.readFile(summary.filePath, 'utf-8').then((content) => {
          const { session, messages } = parseSession(content, summary.project);
          res.writeHead(200, JSON_HEADERS);
          res.end(JSON.stringify({ session, messages }));
        });
      })
      .catch(() => {
        res.writeHead(500, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'Failed to read session' }));
      });
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

    const lowerQuery = query.toLowerCase();

    discoverSessions()
      .then(async (sessions) => {
        const results: SessionSummary[] = [];
        for (const summary of sessions) {
          if (
            summary.slug.toLowerCase().includes(lowerQuery) ||
            summary.project.toLowerCase().includes(lowerQuery) ||
            summary.gitBranch.toLowerCase().includes(lowerQuery)
          ) {
            results.push(summary);
            continue;
          }

          // Search file content (first 50 lines for performance)
          const matched = await searchFileHead(summary.filePath, lowerQuery, 50);
          if (matched) {
            results.push(summary);
          }
        }

        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ sessions: results }));
      })
      .catch(() => {
        res.writeHead(500, JSON_HEADERS);
        res.end(JSON.stringify({ error: 'Search failed' }));
      });
  }
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

// ---------------------------------------------------------------------------
//  Session discovery
// ---------------------------------------------------------------------------

/**
 * Scan `~/.claude/projects/` for JSONL session files and return summaries
 * sorted by mtime descending.
 */
async function discoverSessions(): Promise<SessionSummary[]> {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');

  let projectDirs: string[];
  try {
    projectDirs = await fs.promises.readdir(projectsDir);
  } catch {
    return [];
  }

  const summaries: SessionSummary[] = [];

  for (const projectName of projectDirs) {
    const projectPath = path.join(projectsDir, projectName);
    const stat = await fs.promises.stat(projectPath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    let files: string[];
    try {
      files = await fs.promises.readdir(projectPath);
    } catch {
      continue;
    }

    for (const fileName of files) {
      if (!fileName.endsWith('.jsonl')) continue;

      const filePath = path.join(projectPath, fileName);
      const fileStat = await fs.promises.stat(filePath).catch(() => null);
      if (!fileStat?.isFile()) continue;

      const summary = await extractMetadata(filePath, projectName, fileStat.mtimeMs);
      if (summary) {
        summaries.push(summary);
      }
    }
  }

  summaries.sort((a, b) => b.mtime - a.mtime);
  return summaries;
}

/**
 * Read the first N lines of a JSONL file to extract session metadata
 * without parsing the entire file.
 */
async function extractMetadata(
  filePath: string,
  projectName: string,
  mtimeMs: number,
): Promise<SessionSummary | null> {
  const lines = await readHeadLines(filePath, METADATA_HEAD_LINES);
  if (lines.length === 0) return null;

  let sessionId = '';
  let version = '';
  let gitBranch = '';
  let slug = '';
  let model = '';

  for (const line of lines) {
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      if (typeof raw.sessionId === 'string' && !sessionId) {
        sessionId = raw.sessionId;
      }
      if (typeof raw.version === 'string' && !version) {
        version = raw.version;
      }
      if (typeof raw.gitBranch === 'string' && !gitBranch) {
        gitBranch = raw.gitBranch;
      }
      if (typeof raw.slug === 'string' && !slug) {
        slug = raw.slug;
      }
      if (!model && raw.message && typeof raw.message === 'object') {
        const msg = raw.message as Record<string, unknown>;
        if (typeof msg.model === 'string') {
          model = msg.model;
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (!sessionId) return null;

  // Count total lines for messageCount estimate
  const totalLines = await countLines(filePath);

  return {
    id: sessionId,
    slug,
    project: projectName,
    gitBranch,
    version,
    model,
    messageCount: totalLines,
    mtime: mtimeMs,
    filePath,
  };
}

// ---------------------------------------------------------------------------
//  File utilities
// ---------------------------------------------------------------------------

/** Read the first N lines of a file using a stream. */
function readHeadLines(filePath: string, maxLines: number): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (line.trim()) {
        lines.push(line);
      }
      if (lines.length >= maxLines) {
        rl.close();
        stream.destroy();
      }
    });

    rl.on('close', () => resolve(lines));
    rl.on('error', () => resolve(lines));
  });
}

/** Count total lines in a file using a stream. */
function countLines(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    let count = 0;
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (line.trim()) {
        count++;
      }
    });

    rl.on('close', () => resolve(count));
    rl.on('error', () => resolve(count));
  });
}

/** Search the first N lines of a file for a query string. */
function searchFileHead(
  filePath: string,
  lowerQuery: string,
  maxLines: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let count = 0;
    const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      count++;
      if (line.toLowerCase().includes(lowerQuery)) {
        rl.close();
        stream.destroy();
        resolve(true);
        return;
      }
      if (count >= maxLines) {
        rl.close();
        stream.destroy();
      }
    });

    rl.on('close', () => resolve(false));
    rl.on('error', () => resolve(false));
  });
}
