// status/AgentStatusWorker.ts — 常駐ワーカーの HTTP サーバ本体
//
// Node 標準 http.createServer を loopback (127.0.0.1) のみで bind する（CodeQL js/file-access-to-http 対策）。
// AgentStatusStore（node:sqlite 単一所有者）を保持し、POST で書き込み・GET で読み取りを HTTP 公開する。
//
// ルーティング:
//   POST   /api/agent-status/edit       — 編集系 UPSERT       (要 Bearer)
//   POST   /api/agent-status/commit     — commit 系 UPSERT    (要 Bearer)
//   POST   /api/agent-status/summary    — handoff payload 保存 (要 Bearer)
//   GET    /api/agent-status            — 全行 { version, data: [...] }
//   GET    /api/agent-status/:sessionId — 単一  { version, data }
//   DELETE /api/agent-status/:sessionId — 行削除             (要 Bearer)
//
// 認証: token を持つ場合、書き込み系（POST/DELETE）に `Authorization: Bearer <token>` を要求する。
// 同一ホストの任意プロセスが summary を偽装し新セッションへプロンプトインジェクションするのを防ぐ。
// token 未設定時は認証なし（後方互換）。

import * as http from 'node:http';
import type { AgentStatusStore } from './AgentStatusStore';
import { generateHandoff } from '../handoff/generate';
import {
  AGENT_STATUS_API_VERSION,
  type CommitUpsertInput,
  type EditUpsertInput,
  type SummaryUpsertInput,
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

  /**
   * @param store SQLite ストア
   * @param token 書き込み系を保護する Bearer トークン。省略時は認証なし（後方互換）。
   */
  constructor(
    private readonly store: AgentStatusStore,
    private readonly token?: string,
  ) {}

  /** token 未設定なら常に許可。設定時は `Authorization: Bearer <token>` 一致で許可。 */
  private authorized(req: http.IncomingMessage): boolean {
    if (!this.token) return true;
    return req.headers.authorization === `Bearer ${this.token}`;
  }

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

    // 書き込み系（POST/DELETE）は Bearer 認証を要求する。
    if ((method === 'POST' || method === 'DELETE') && !this.authorized(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

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

    if (method === 'POST' && pathname === '/api/agent-status/summary') {
      const body = JSON.parse(await readBody(req)) as SummaryUpsertInput;
      if (!body?.sessionId) {
        sendJson(res, 400, { error: 'sessionId required' });
        return;
      }
      if (typeof body.summary !== 'string') {
        sendJson(res, 400, { error: 'summary (JSON string) required' });
        return;
      }
      this.store.upsertSummary(body);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'POST' && pathname === '/api/agent-status/handoff') {
      const body = JSON.parse(await readBody(req)) as { sessionId?: string };
      if (!body?.sessionId) {
        sendJson(res, 400, { error: 'sessionId required' });
        return;
      }
      // transcript 解決 → 圧縮ステート組成 → summary 保存（handoff_at 確定）→ レンダリング返却。
      const result = generateHandoff(this.store, body.sessionId);
      if (!result) {
        sendJson(res, 404, { error: 'transcript not found' });
        return;
      }
      sendJson(res, 200, { ok: true, ...result });
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
    if (oneMatch && method === 'GET') {
      const sessionId = decodeURIComponent(oneMatch[1]);
      sendJson(res, 200, {
        version: AGENT_STATUS_API_VERSION,
        data: this.store.queryOne(sessionId),
      });
      return;
    }
    if (oneMatch && method === 'DELETE') {
      const sessionId = decodeURIComponent(oneMatch[1]);
      this.store.deleteSession(sessionId);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  }
}
