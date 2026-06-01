import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatusStore } from '../src/status/AgentStatusStore';
import { AgentStatusWorker } from '../src/status/AgentStatusWorker';
import { AGENT_STATUS_API_VERSION } from '../src/status/types';

describe('AgentStatusWorker (loopback HTTP)', () => {
  let dir: string;
  let store: AgentStatusStore;
  let worker: AgentStatusWorker;
  let base: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agent-status-worker-'));
    store = new AgentStatusStore(join(dir, 'agent-status.db'));
    worker = new AgentStatusWorker(store);
    await worker.start(0);
    base = `http://127.0.0.1:${worker.port}`;
  });

  afterEach(async () => {
    await worker.stop();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('動的ポートで起動し port>0 を公開する', () => {
    expect(worker.port).toBeGreaterThan(0);
  });

  it('POST /edit で書き込み GET /:id で読める', async () => {
    const postRes = await fetch(`${base}/api/agent-status/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', editing: true, file: '/ws/a.ts', branch: 'main' }),
    });
    expect(postRes.status).toBe(200);

    const getRes = await fetch(`${base}/api/agent-status/s1`);
    expect(getRes.status).toBe(200);
    const env = await getRes.json();
    expect(env.version).toBe(AGENT_STATUS_API_VERSION);
    expect(env.data.editing).toBe(true);
    expect(env.data.file).toBe('/ws/a.ts');
  });

  it('POST /commit で committed_count が加算される', async () => {
    const body = {
      sessionId: 's2',
      lastHead: 'h1',
      commitHash: 'h1',
      committedAt: '2026-05-31T01:00:00.000Z',
      count: 2,
    };
    await fetch(`${base}/api/agent-status/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const env = await (await fetch(`${base}/api/agent-status/s2`)).json();
    expect(env.data.committedCount).toBe(2);
    expect(env.data.lastCommit.hash).toBe('h1');
  });

  it('GET /api/agent-status は全件をエンベロープで返す', async () => {
    await fetch(`${base}/api/agent-status/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'a', editing: false }),
    });
    const env = await (await fetch(`${base}/api/agent-status`)).json();
    expect(env.version).toBe(AGENT_STATUS_API_VERSION);
    expect(Array.isArray(env.data)).toBe(true);
    expect(env.data.length).toBe(1);
  });

  it('未登録セッションの GET は data:null を返す', async () => {
    const env = await (await fetch(`${base}/api/agent-status/nope`)).json();
    expect(env.data).toBeNull();
  });

  it('sessionId 無しの POST /edit は 400', async () => {
    const res = await fetch(`${base}/api/agent-status/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editing: true }),
    });
    expect(res.status).toBe(400);
  });

  it('未知パスは 404', async () => {
    const res = await fetch(`${base}/api/unknown`);
    expect(res.status).toBe(404);
  });
});
