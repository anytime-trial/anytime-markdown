import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatusStore } from '../src/status/AgentStatusStore';
import { AgentStatusWorker } from '../src/status/AgentStatusWorker';
import { AgentStatusClient } from '../src/status/AgentStatusClient';
import {
  AGENT_WORKER_SCHEMA_VERSION,
  agentWorkerJsonPath,
  writeWorkerInfo,
} from '../src/status/agentWorkerInfo';

describe('AgentStatusClient', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-status-client-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('agent-worker.json が無いとき queryAll は空配列', async () => {
    const client = new AgentStatusClient({ workspaceRoot: dir });
    expect(await client.queryAll()).toEqual([]);
  });

  it('agent-worker.json が無いとき queryOne は null・postEdit は false', async () => {
    const client = new AgentStatusClient({ workspaceRoot: dir });
    expect(await client.queryOne('x')).toBeNull();
    expect(await client.postEdit({ sessionId: 'x', editing: true })).toBe(false);
  });

  describe('ワーカー起動時', () => {
    let store: AgentStatusStore;
    let worker: AgentStatusWorker;
    let client: AgentStatusClient;

    beforeEach(async () => {
      store = new AgentStatusStore(join(dir, '.anytime', 'agent', 'agent-status.db'));
      worker = new AgentStatusWorker(store);
      await worker.start(0);
      writeWorkerInfo(agentWorkerJsonPath(dir), {
        schemaVersion: AGENT_WORKER_SCHEMA_VERSION,
        pid: process.pid,
        host: '127.0.0.1',
        port: worker.port,
        url: worker.url,
        startedAt: '2026-05-31T00:00:00.000Z',
        dbPath: join(dir, '.anytime', 'agent', 'agent-status.db'),
      });
      client = new AgentStatusClient({ workspaceRoot: dir });
    });

    afterEach(async () => {
      await worker.stop();
      store.close();
    });

    it('postEdit → queryOne が往復する', async () => {
      expect(await client.postEdit({ sessionId: 's1', editing: true, file: '/ws/a.ts' })).toBe(true);
      const row = await client.queryOne('s1');
      expect(row?.editing).toBe(true);
      expect(row?.file).toBe('/ws/a.ts');
    });

    it('postCommit → queryAll に反映される', async () => {
      await client.postCommit({
        sessionId: 's2',
        lastHead: 'h1',
        commitHash: 'h1',
        committedAt: '2026-05-31T01:00:00.000Z',
        count: 3,
      });
      const all = await client.queryAll();
      const row = all.find((r) => r.sessionId === 's2');
      expect(row?.committedCount).toBe(3);
    });
  });
});
