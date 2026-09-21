import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatusStore } from '../src/status/AgentStatusStore';
import { AgentStatusWorker } from '../src/status/AgentStatusWorker';
import { AGENT_STATUS_API_VERSION } from '../src/status/types';

/** Codex rollout fixture（session_meta + item_completed の最小形）を書き出す。 */
function writeCodexRollout(rootDir: string, sessionId: string, cwd: string, goal: string): void {
  const dateDir = join(rootDir, '2026', '09', '20');
  mkdirSync(dateDir, { recursive: true });
  const lines = [
    JSON.stringify({ type: 'session_meta', payload: { id: sessionId, timestamp: '2026-09-20T00:00:00.000Z', cwd } }),
    JSON.stringify({
      type: 'event_msg',
      payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: goal }] } },
    }),
  ];
  writeFileSync(join(dateDir, `rollout-${sessionId}.jsonl`), lines.join('\n') + '\n');
}

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

  it('DELETE /:id でセッション行を削除する', async () => {
    await fetch(`${base}/api/agent-status/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'del', editing: true }),
    });
    const delRes = await fetch(`${base}/api/agent-status/del`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    const env = await (await fetch(`${base}/api/agent-status/del`)).json();
    expect(env.data).toBeNull();
  });

  it('未知パスは 404', async () => {
    const res = await fetch(`${base}/api/unknown`);
    expect(res.status).toBe(404);
  });

  it('POST /summary で handoff payload を保存し GET /:id で読める', async () => {
    const payload = JSON.stringify({ handoffVersion: 1, structured: { goal: 'g' }, narrative: null });
    const postRes = await fetch(`${base}/api/agent-status/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'h1', summary: payload, handoffAt: '2026-06-24T12:00:00.000Z' }),
    });
    expect(postRes.status).toBe(200);
    const env = await (await fetch(`${base}/api/agent-status/h1`)).json();
    expect(env.data.summary).toBe(payload);
    expect(env.data.handoffAt).toBe('2026-06-24T12:00:00.000Z');
  });

  it('API バージョンは 2', () => {
    expect(AGENT_STATUS_API_VERSION).toBe(2);
  });
});

describe('AgentStatusWorker Bearer 認証（token 設定時）', () => {
  let dir: string;
  let store: AgentStatusStore;
  let worker: AgentStatusWorker;
  let base: string;
  const TOKEN = 'test-token-abc';

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agent-status-auth-'));
    store = new AgentStatusStore(join(dir, 'agent-status.db'));
    worker = new AgentStatusWorker(store, TOKEN);
    await worker.start(0);
    base = `http://127.0.0.1:${worker.port}`;
  });
  afterEach(async () => {
    await worker.stop();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const summaryBody = () =>
    JSON.stringify({ sessionId: 'x', summary: '{}', handoffAt: '2026-06-24T12:00:00.000Z' });

  it('Authorization 無しの POST /summary は 401', async () => {
    const res = await fetch(`${base}/api/agent-status/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: summaryBody(),
    });
    expect(res.status).toBe(401);
  });

  it('誤トークンの POST /edit は 401', async () => {
    const res = await fetch(`${base}/api/agent-status/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
      body: JSON.stringify({ sessionId: 'x', editing: true }),
    });
    expect(res.status).toBe(401);
  });

  it('正トークンの POST /summary は 200', async () => {
    const res = await fetch(`${base}/api/agent-status/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: summaryBody(),
    });
    expect(res.status).toBe(200);
  });

  it('GET（読み取り）は認証不要', async () => {
    const res = await fetch(`${base}/api/agent-status`);
    expect(res.status).toBe(200);
  });

  it('POST /handoff は Authorization 無しで 401', async () => {
    const res = await fetch(`${base}/api/agent-status/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'x' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /handoff は sessionId 無しで 400（認証あり）', async () => {
    const res = await fetch(`${base}/api/agent-status/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('AgentStatusWorker POST /handoff source=codex', () => {
  let dir: string;
  let codexDir: string;
  let store: AgentStatusStore;
  let worker: AgentStatusWorker;
  let base: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'agent-status-worker-codex-'));
    codexDir = join(dir, 'codex-sessions');
    store = new AgentStatusStore(join(dir, 'agent-status.db'));
    worker = new AgentStatusWorker(store, undefined, codexDir);
    await worker.start(0);
    base = `http://127.0.0.1:${worker.port}`;
  });

  afterEach(async () => {
    await worker.stop();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('source=codex は rollout を読んで injection/cwd を返し、agent_sessions には行を作らない', async () => {
    writeCodexRollout(codexDir, 'codex-sid-1', '/repo/codex-work', 'Codex での指示');

    const res = await fetch(`${base}/api/agent-status/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'codex-sid-1', source: 'codex' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; cwd: string; injection: string };
    expect(data.ok).toBe(true);
    expect(data.cwd).toBe('/repo/codex-work');
    expect(data.injection).toContain('Codex での指示');

    // 幽霊 Claude セッションが agent_sessions に作られていないこと。
    expect(store.queryOne('codex-sid-1')).toBeNull();
    expect(store.queryAll()).toHaveLength(0);
  });

  it('source=codex で rollout が無ければ 404 で agent_sessions にも触れない', async () => {
    const res = await fetch(`${base}/api/agent-status/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'no-such', source: 'codex' }),
    });
    expect(res.status).toBe(404);
    expect(store.queryAll()).toHaveLength(0);
  });

  it('source 省略時は従来どおり Claude 経路（transcript 未検出で 404）', async () => {
    const res = await fetch(`${base}/api/agent-status/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'claude-sid-without-transcript' }),
    });
    expect(res.status).toBe(404);
  });
});
