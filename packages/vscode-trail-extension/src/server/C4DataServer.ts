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

const CORS_ORIGIN = 'http://localhost:3000';
const BIND_HOST = '127.0.0.1';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  ...CORS_HEADERS,
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

    wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('message', (data: unknown) => this.handleWsMessage(data));
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
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

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
        res.writeHead(200, { 'Content-Type': 'text/html', ...CORS_HEADERS });
        res.end(buildStandaloneHtml());
        break;
      case '/c4standalone.js':
        this.handleStaticJs(res, 'c4standalone.js');
        break;
      case '/c4standalone.js.map':
        this.handleStaticJs(res, 'c4standalone.js.map');
        break;
      default:
        res.writeHead(404, CORS_HEADERS);
        res.end();
    }
  }

  private handleModelEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
    const model = provider?.model;
    const boundaries = provider?.boundaries;

    if (!model || !boundaries) {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ model, boundaries }));
  }

  private handleDsmEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
    const matrix = provider?.currentDsmMode === 'c4'
      ? provider?.c4Matrix
      : provider?.sourceMatrix;

    if (!matrix) {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ matrix }));
  }

  private handleDiffEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
    const c4Matrix = provider?.c4Matrix;
    const sourceMatrix = provider?.sourceMatrix;

    if (!c4Matrix || !sourceMatrix) {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const mappings = provider?.dsmMappings ?? [];
    const diff = diffMatrix(c4Matrix, sourceMatrix, mappings);
    const cycles = computeCyclicPairs(c4Matrix);

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ diff, cycles }));
  }

  private handleTreeEndpoint(res: http.ServerResponse): void {
    const provider = this.getProvider();
    const model = provider?.model;
    const boundaries = provider?.boundaries;

    if (!model || !boundaries) {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const level = DSM_LEVEL_MAP[provider?.currentDsmLevel ?? 'component'] ?? 3;
    const fullTree = buildElementTree(model, boundaries);
    const tree = filterTreeByLevel(fullTree, level);

    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ tree }));
  }

  private handleStaticJs(res: http.ServerResponse, filename: string): void {
    const filePath = path.join(this.distPath, filename);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, CORS_HEADERS);
        res.end();
        return;
      }
      const contentType = filename.endsWith('.map')
        ? 'application/json'
        : 'application/javascript';
      res.writeHead(200, { 'Content-Type': contentType, ...CORS_HEADERS });
      res.end(data);
    });
  }

  // -------------------------------------------------------------------------
  //  WebSocket handler
  // -------------------------------------------------------------------------

  private handleWsMessage(data: unknown): void {
    const provider = this.getProvider();
    if (!provider) return;

    let message: ClientMessage;
    try {
      message = JSON.parse(String(data)) as ClientMessage;
    } catch {
      return;
    }

    this.dispatchClientMessage(message, provider);
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
    const boundaries = provider.boundaries;
    if (!model || !boundaries) return undefined;

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
    const c4Matrix = provider.c4Matrix;
    const sourceMatrix = provider.sourceMatrix;
    if (!c4Matrix || !sourceMatrix) return undefined;

    const mappings = provider.dsmMappings;
    const diff = diffMatrix(c4Matrix, sourceMatrix, mappings);
    const cycles = computeCyclicPairs(c4Matrix);
    return { type: 'dsm-updated', diff, cycles };
  }
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
