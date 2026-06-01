// status/AgentStatusWorker.ts — 常駐ワーカーの HTTP サーバ本体
//
// Node 標準 http.createServer を loopback (127.0.0.1) のみで bind する（CodeQL js/file-access-to-http 対策）。
// AgentStatusStore（node:sqlite 単一所有者）を保持し、POST で書き込み・GET で読み取りを HTTP 公開する。
//
// ルーティング:
//   POST /api/agent-status/edit       — 編集系 UPSERT
//   POST /api/agent-status/commit     — commit 系 UPSERT
//   GET  /api/agent-status            — 全行 { version, data: [...] }
//   GET  /api/agent-status/:sessionId — 単一  { version, data }

import * as http from 'node:http';
import type { AgentStatusStore } from './AgentStatusStore';
import {
  AGENT_STATUS_API_VERSION,
  type CommitUpsertInput,
  type EditUpsertInput,
} from './types';

const BIND_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1_000_000;

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export class AgentStatusWorker {
  private server?: http.Server;

  constructor(private readonly store: AgentStatusStore) {}

  /** OS 割り当ての動的ポートで起動する場合は port=0 を渡す */
  start(port: number): Promise<void> {
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => {
        console.error(`[agent-status] request error: ${String(err)}`);
        if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      });
    });
    this.server = server;
    return new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, BIND_HOST, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  }

  /** listen 中の実ポート。未起動なら 0 */
  get port(): number {
    const addr = this.server?.address();
    return addr && typeof addr === 'object' ? addr.port : 0;
  }

  get url(): string {
    return `http://${BIND_HOST}:${this.port}`;
  }

  stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        this.server = undefined;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsed = new URL(req.url ?? '/', `http://${BIND_HOST}`);
    const pathname = parsed.pathname;
    const method = req.method ?? 'GET';

    if (method === 'POST' && pathname === '/api/agent-status/edit') {
      const body = JSON.parse(await readBody(req)) as EditUpsertInput;
      if (!body?.sessionId) {
        sendJson(res, 400, { error: 'sessionId required' });
        return;
      }
      this.store.upsertEditing(body);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'POST' && pathname === '/api/agent-status/commit') {
      const body = JSON.parse(await readBody(req)) as CommitUpsertInput;
      if (!body?.sessionId) {
        sendJson(res, 400, { error: 'sessionId required' });
        return;
      }
      this.store.upsertCommit(body);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'GET' && pathname === '/api/agent-status') {
      sendJson(res, 200, {
        version: AGENT_STATUS_API_VERSION,
        data: this.store.queryAll(),
      });
      return;
    }

    const oneMatch = /^\/api\/agent-status\/([^/]+)$/.exec(pathname);
    if (method === 'GET' && oneMatch) {
      const sessionId = decodeURIComponent(oneMatch[1]);
      sendJson(res, 200, {
        version: AGENT_STATUS_API_VERSION,
        data: this.store.queryOne(sessionId),
      });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  }
}
