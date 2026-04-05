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
  CyclicPair,
  DsmDiff,
  DsmMapping,
  DsmMatrix,
} from '@anytime-markdown/c4-kernel';
import { WebSocketServer, type WebSocket } from 'ws';

import type { ClientMessage, ServerMessage } from './types';

// ---------------------------------------------------------------------------
//  Provider interface — decouples C4DataServer from C4Panel
// ---------------------------------------------------------------------------

export interface C4DataProvider {
  readonly model: C4Model | undefined;
  readonly boundaries: readonly BoundaryInfo[] | undefined;
  readonly c4Matrix: DsmMatrix | undefined;
  readonly sourceMatrix: DsmMatrix | undefined;
  readonly currentDsmLevel: 'component' | 'package';
  readonly currentDsmMode: 'c4' | 'diff';
  readonly dsmMappings: readonly DsmMapping[];
  handleSetDsmLevel(level: 'component' | 'package'): void;
  handleSetDsmMode(mode: 'c4' | 'diff'): void;
  handleCluster(enabled: boolean): void;
  handleRefresh(): void;
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const BIND_HOST = '127.0.0.1';

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
  private cachedHtml: string | undefined;

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

  notify(type: 'model-updated' | 'dsm-updated'): void {
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

  // -------------------------------------------------------------------------
  //  HTTP handler
  // -------------------------------------------------------------------------

  private handleHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
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

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ model, boundaries }));
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
    }
  }

  // -------------------------------------------------------------------------
  //  Notification message builder
  // -------------------------------------------------------------------------

  private buildNotifyMessage(
    type: 'model-updated' | 'dsm-updated',
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    if (type === 'model-updated') {
      return this.buildModelMessage(provider);
    }
    return this.buildDsmMessage(provider);
  }

  private buildModelMessage(
    provider: C4DataProvider,
  ): ServerMessage | undefined {
    const model = provider.model;
    if (!model) return undefined;
    const boundaries = provider.boundaries ?? [];

    return { type: 'model-updated', model, boundaries };
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
  const validTypes = ['set-level', 'set-dsm-mode', 'cluster', 'refresh'];
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
