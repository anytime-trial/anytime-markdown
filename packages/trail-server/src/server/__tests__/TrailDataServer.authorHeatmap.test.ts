// Author Heatmap: GET /api/author-heatmap のルーティング・集計・縮退動作。
jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })),
}));

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-activity/codeGraph';

const REPO = 'repo';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };
const repoIdOf = (db: TrailDatabase): number =>
  (db as unknown as { repoIdForName(n: string): number }).repoIdForName(REPO);

function seedCommit(
  db: TrailDatabase,
  args: { sessionId: string; hash: string; filePath: string; at: string },
): void {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  const repoId = repoIdOf(db);
  inner.run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at, repo_id)
     VALUES (?, ?, '0', '', '', '', '', 0, '', 0, '', ?)`,
    [args.sessionId, args.sessionId, repoId],
  );
  inner.run(
    `INSERT OR IGNORE INTO session_commits (session_id, repo_id, commit_hash, commit_message, committed_at, author)
     VALUES (?, ?, ?, '', ?, 'ueda')`,
    [args.sessionId, repoId, args.hash, args.at],
  );
  inner.run(
    `INSERT OR IGNORE INTO commit_files (repo_id, commit_hash, file_path) VALUES (?, ?, ?)`,
    [repoId, args.hash, args.filePath],
  );
}

function node(id: string): CodeGraphNode {
  return {
    id,
    label: id.split('/').pop() ?? id,
    repo: REPO,
    package: 'a',
    fileType: 'code',
    community: 0,
    communityLabel: 'a',
    x: 0,
    y: 0,
    size: 1,
  };
}

/** ノード 2 件のコードグラフ（node id は `<repo>:<拡張子を除いたパス>`） */
const fixtureGraph: CodeGraph = {
  generatedAt: '2026-08-03T00:00:00.000Z',
  repositories: [{ id: REPO, label: REPO, path: '/tmp/repo' }],
  nodes: [node(`${REPO}:packages/a/src/a`), node(`${REPO}:packages/a/src/b`)],
  edges: [],
  communities: { 0: 'a' },
  godNodes: [],
};

type Body = {
  entries: Array<{
    nodeId: string;
    lastEditorSessionId: string;
    lastEditedAt: string;
    commitCount: number;
    sessionCount: number;
    topSessionShare: number;
  }>;
  topSessions: string[];
  coveredNodes: number;
  totalNodes: number;
  computedAt: string;
};

describe('GET /api/author-heatmap', () => {
  let server: TrailDataServer;
  let trailDb: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    trailDb = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', trailDb, makeMockLogger(), '/tmp/repo');
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    trailDb.close();
  });

  const get = async (qs: string): Promise<{ status: number; body: Body }> => {
    const res = await fetch(`http://127.0.0.1:${port}/api/author-heatmap${qs}`);
    return { status: res.status, body: (await res.json()) as Body };
  };

  it('repo 未指定なら 200 + 空で返す（グラフ描画を壊さない）', async () => {
    const { status, body } = await get('');
    expect(status).toBe(200);
    expect(body.entries).toEqual([]);
    expect(body.coveredNodes).toBe(0);
    expect(body.totalNodes).toBe(0);
  });

  it('コードグラフ未生成なら 200 + 空で返す', async () => {
    seedCommit(trailDb, { sessionId: 's1', hash: 'h1', filePath: 'packages/a/src/a.ts', at: '2026-01-01T00:00:00.000Z' });
    const { status, body } = await get(`?repo=${REPO}`);
    expect(status).toBe(200);
    expect(body.entries).toEqual([]);
    expect(body.coveredNodes).toBe(0);
  });

  it('ファイルパスをノード ID へ突合して集計を返す', async () => {
    trailDb.saveCurrentCodeGraph(REPO, fixtureGraph);
    seedCommit(trailDb, { sessionId: 's1', hash: 'h1', filePath: 'packages/a/src/a.ts', at: '2026-01-01T00:00:00.000Z' });
    seedCommit(trailDb, { sessionId: 's2', hash: 'h2', filePath: 'packages/a/src/a.ts', at: '2026-01-02T00:00:00.000Z' });

    const { body } = await get(`?repo=${REPO}`);
    expect(body.totalNodes).toBe(2);
    expect(body.coveredNodes).toBe(1);
    const entry = body.entries[0];
    expect(entry.nodeId).toBe(`${REPO}:packages/a/src/a`);
    expect(entry.commitCount).toBe(2);
    expect(entry.sessionCount).toBe(2);
    expect(entry.lastEditorSessionId).toBe('s2');
    expect(entry.lastEditedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('コードグラフに無いファイルの行は集計に入らない（被覆率の分母を汚さない）', async () => {
    trailDb.saveCurrentCodeGraph(REPO, fixtureGraph);
    seedCommit(trailDb, { sessionId: 's1', hash: 'h1', filePath: 'packages/a/src/zzz.ts', at: '2026-01-01T00:00:00.000Z' });

    const { body } = await get(`?repo=${REPO}`);
    expect(body.entries).toEqual([]);
    expect(body.coveredNodes).toBe(0);
    expect(body.totalNodes).toBe(2);
  });

  it('topSessions は担当ノード数の多い順に既定 8 件まで返す', async () => {
    trailDb.saveCurrentCodeGraph(REPO, fixtureGraph);
    seedCommit(trailDb, { sessionId: 's1', hash: 'h1', filePath: 'packages/a/src/a.ts', at: '2026-01-01T00:00:00.000Z' });
    seedCommit(trailDb, { sessionId: 's2', hash: 'h2', filePath: 'packages/a/src/b.ts', at: '2026-01-02T00:00:00.000Z' });

    const { body } = await get(`?repo=${REPO}`);
    expect(body.topSessions.sort()).toEqual(['s1', 's2']);
  });

  it('topSessions パラメータで固有色を割り当てる件数を絞れる', async () => {
    trailDb.saveCurrentCodeGraph(REPO, fixtureGraph);
    seedCommit(trailDb, { sessionId: 's1', hash: 'h1', filePath: 'packages/a/src/a.ts', at: '2026-01-01T00:00:00.000Z' });
    seedCommit(trailDb, { sessionId: 's2', hash: 'h2', filePath: 'packages/a/src/b.ts', at: '2026-01-02T00:00:00.000Z' });

    const { body } = await get(`?repo=${REPO}&topSessions=1`);
    expect(body.topSessions).toHaveLength(1);
  });

  it('不正な topSessions は既定値へクランプされる（500 にしない）', async () => {
    trailDb.saveCurrentCodeGraph(REPO, fixtureGraph);
    const { status, body } = await get(`?repo=${REPO}&topSessions=abc`);
    expect(status).toBe(200);
    expect(body.topSessions).toEqual([]);
  });

  it('未登録の repo 名では 200 + 空で返す', async () => {
    trailDb.saveCurrentCodeGraph(REPO, fixtureGraph);
    const { status, body } = await get('?repo=no-such-repo');
    expect(status).toBe(200);
    expect(body.entries).toEqual([]);
  });

  it('生行は返さない（集約はサーバー側で完結する）', async () => {
    trailDb.saveCurrentCodeGraph(REPO, fixtureGraph);
    seedCommit(trailDb, { sessionId: 's1', hash: 'h1', filePath: 'packages/a/src/a.ts', at: '2026-01-01T00:00:00.000Z' });
    const res = await fetch(`http://127.0.0.1:${port}/api/author-heatmap?repo=${REPO}`);
    const body = await res.json();
    expect(body).not.toHaveProperty('rows');
  });
});
