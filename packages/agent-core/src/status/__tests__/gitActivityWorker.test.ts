import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatusStore } from '../AgentStatusStore';
import { AgentStatusWorker } from '../AgentStatusWorker';

describe('git-activity HTTP ルート', () => {
  let dir: string;
  let store: AgentStatusStore;
  let worker: AgentStatusWorker;
  let base: string;
  const token = 'test-token';

  const body = {
    workspacePath: '/ws',
    opType: 'reset',
    destructive: true,
    refName: 'refs/heads/feature/x',
    beforeSha: 'aaaaaaa',
    afterSha: 'bbbbbbb',
    attribution: 'human',
    agentKind: null,
    sessionId: null,
    occurredAt: '2026-07-13T00:00:00.000Z',
  };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ga-worker-'));
    store = new AgentStatusStore(join(dir, 'agent-status.db'));
    worker = new AgentStatusWorker(store, token);
    await worker.start(0);
    base = `http://127.0.0.1:${worker.port}`;
  });

  afterEach(async () => {
    await worker.stop();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('POST は Bearer トークンが無いと 401 で拒否する', async () => {
    const res = await fetch(`${base}/api/agent-status/git-activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(401);
  });

  it('POST で記録し、GET で読み出せる', async () => {
    const post = await fetch(`${base}/api/agent-status/git-activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    expect(post.status).toBe(200);

    const get = await fetch(`${base}/api/agent-status/git-activity`);
    const json = (await get.json()) as { data: { opType: string; destructive: boolean }[] };
    expect(json.data).toHaveLength(1);
    expect(json.data[0].opType).toBe('reset');
    expect(json.data[0].destructive).toBe(true);
  });

  it('不正な op_type は 400 で拒否し、DB に書かない', async () => {
    const res = await fetch(`${base}/api/agent-status/git-activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, opType: 'teleport' }),
    });
    expect(res.status).toBe(400);
    expect(store.queryGitActivity(10)).toHaveLength(0);
  });
});
