import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import {
  buildElementTree,
  detectCycles,
  diffMatrix,
  filterTreeByLevel,
} from '@anytime-markdown/c4-kernel';
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
} from '@anytime-markdown/c4-kernel';
import { WebSocketServer, type WebSocket } from 'ws';

import type { ClientMessage, ServerMessage } from './types';

// ---------------------------------------------------------------------------
//  Provider interface — decouples C4DataServer from C4Panel
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
//  C4DataServer
// ---------------------------------------------------------------------------

export class C4DataServer {
  private httpServer: http.Server | undefined;
  private wsServer: WebSocketServer | undefined;
  private readonly clients = new Set<WebSocket>();
  private readonly staticCache = new Map<string, Buffer>();
  private rateLimitCount = 0;
  private rateLimitReset = 0;
  private cachedHtml: string | undefined;
  private docLinks: readonly DocLink[] = [];
  private docsPath: string | undefined;

  /** ドキュメントリンククリック時のコールバック */
  onOpenDocLink: ((docPath: string) => void) | undefined;

  constructor(
    private readonly getProvider: () => C4DataProvider | undefined,
    private readonly distPath: string,
  ) {}

  // -------------------------------------------------------------------------
  //  Public API
  // -------------------------------------------------------------------------

  get isRunning(): boolean {
    return this.httpServer?.listening === true;
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
      this.sendCurrentState(ws);
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

  notify(type: 'model-updated' | 'dsm-updated' | 'coverage-updated' | 'coverage-diff-updated'): void {
    if (this.clients.size === 0) return;

    const provider = this.getProvider();
    if (!provider) return;

    const message = this.buildNotifyMessage(type, provider);
    if (!message) return;

    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      ws.send(payload);
    }
  }

  /** ドキュメントパスを設定しスキャンを開始する */
  setDocsPath(docsPath: string | undefined): void {
    this.docsPath = docsPath;
    if (docsPath) {
      this.scanDocLinks().catch(() => { /* ignore */ });
    } else {
      this.docLinks = [];
    }
  }

  /** ドキュメントを再スキャンしてクライアントに配信する */
  async scanDocLinks(): Promise<void> {
    if (!this.docsPath) return;
    this.docLinks = await scanLocalDocs(this.docsPath);
    this.notifyDocLinks();
  }

  /** docLinks をクライアントに配信する */
  private notifyDocLinks(): void {
    if (this.clients.size === 0) return;
    const message: ServerMessage = { type: 'doc-links-updated', docLinks: this.docLinks };
    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      ws.send(payload);
    }
  }

  /** 解析進捗をビューアに配信する */
  notifyProgress(phase: string, percent: number): void {
    if (this.clients.size === 0) return;
    const message: ServerMessage = { type: 'analysis-progress', phase, percent };
    const payload = JSON.stringify(message);
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

    // CORS: localhost のみ許可
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');

    const url = req.url ?? '';

    switch (url) {
      case '/api/c4/model':
        this.handleModelEndpoint(res);
        break;
      case '/api/c4/dsm':
        this.handleDsmEndpoint(res);
        break;
      case '/api/c4/diff':
        this.handleDiffEndpoint(res);
        break;
      case '/api/c4/tree':
        this.handleTreeEndpoint(res);
        break;
      case '/api/c4/doc-links':
        res.writeHead(200, JSON_HEADERS);
        res.end(JSON.stringify({ docLinks: this.docLinks }));
        break;
      case '/api/c4/coverage':
        this.handleCoverageEndpoint(res);
        break;
      case '/':
        this.cachedHtml ??= buildStandaloneHtml();
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.cachedHtml);
        break;
      case '/c4standalone.js':
        this.handleStaticJs(res, 'c4standalone.js');
        break;
      case '/c4standalone.js.map':
        this.handleStaticJs(res, 'c4standalone.js.map');
        break;
      default:
        res.writeHead(404);
        res.end();
    }
  }

  private handleModelEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
    const model = provider?.model;
    if (!model) {
      res.writeHead(204);
      res.end();
      return;
    }
    const boundaries = provider?.boundaries ?? [];
    const featureMatrix = provider?.featureMatrix;

    const payload: Record<string, unknown> = { model, boundaries };
    if (featureMatrix) {
      payload.featureMatrix = featureMatrix;
    }
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(payload));
  }

  private handleDsmEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
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

  private handleDiffEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
    const result = computeDiff(provider);

    if (!result) {
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(result));
  }

  private handleTreeEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
    const model = provider?.model;

    if (!model) {
      res.writeHead(204);
      res.end();
      return;
    }

    const boundaries = provider?.boundaries ?? [];

    const level = DSM_LEVEL_MAP[provider?.currentDsmLevel ?? 'component'] ?? 3;
    const fullTree = buildElementTree(model, boundaries);
    const tree = filterTreeByLevel(fullTree, level);

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ tree }));
  }

  private handleCoverageEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
    const coverageMatrix = provider?.coverageMatrix;
    const coverageDiff = provider?.coverageDiff;
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ coverageMatrix: coverageMatrix ?? null, coverageDiff: coverageDiff ?? null }));
  }

  private handleStaticJs(res: http.ServerResponse, filename: string): void {
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
  //  WebSocket handler
  // -------------------------------------------------------------------------

  /** 新規接続クライアントに現在のデータを送信 */
  private sendCurrentState(ws: WebSocket): void {
    const provider = this.getProvider();
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
    const provider = this.getProvider();
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

  // -------------------------------------------------------------------------
  //  Notification message builder
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
//  Helper: standalone viewer HTML
// ---------------------------------------------------------------------------

function buildStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C4 / DSM Viewer</title>
  <style>html, body, #root { margin: 0; padding: 0; height: 100%; overflow: hidden; }</style>
</head>
<body>
  <div id="root"></div>
  <script src="/c4standalone.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
//  Helper: compute cyclic pairs from a DSM matrix
// ---------------------------------------------------------------------------

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
