
jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn().mockResolvedValue(null) };
});

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { TrailGraph } from '@anytime-markdown/trail-core';

interface HierarchyResponse {
  id: string;
  label: string;
  filePath: string;
  line: number;
  children: HierarchyResponse[];
  cycle?: boolean;
  revisited?: boolean;
}

const scopeFixtureGraph: TrailGraph = {
  nodes: [
    { id: 'file::packages/a/src/foo.ts::root', label: 'root', type: 'function', filePath: 'packages/a/src/foo.ts', line: 1 },
    { id: 'file::packages/a/src/foo.ts::sibling', label: 'sibling', type: 'function', filePath: 'packages/a/src/foo.ts', line: 10 },
    { id: 'file::packages/a/src/bar.ts::samePkg', label: 'samePkg', type: 'function', filePath: 'packages/a/src/bar.ts', line: 5 },
    { id: 'file::packages/a/src/bar.test.ts::testFn', label: 'testFn', type: 'function', filePath: 'packages/a/src/bar.test.ts', line: 5 },
    { id: 'file::packages/b/src/other.ts::otherPkg', label: 'otherPkg', type: 'function', filePath: 'packages/b/src/other.ts', line: 5 },
  ],
  edges: [
    { source: 'file::packages/a/src/foo.ts::root', target: 'file::packages/a/src/foo.ts::sibling', type: 'call' },
    { source: 'file::packages/a/src/foo.ts::root', target: 'file::packages/a/src/bar.ts::samePkg', type: 'call' },
    { source: 'file::packages/a/src/foo.ts::root', target: 'file::packages/a/src/bar.test.ts::testFn', type: 'call' },
    { source: 'file::packages/a/src/foo.ts::root', target: 'file::packages/b/src/other.ts::otherPkg', type: 'call' },
  ],
  metadata: { projectRoot: '/tmp/repo', analyzedAt: '2026-05-12T00:00:00.000Z', fileCount: 4 },
};

const fixtureGraph: TrailGraph = {
  nodes: [
    { id: 'file::src/a.ts', label: 'a.ts', type: 'file', filePath: 'src/a.ts', line: 1 },
    { id: 'file::src/a.ts::foo', label: 'foo', type: 'function', filePath: 'src/a.ts', line: 5, parent: 'file::src/a.ts' },
    { id: 'file::src/a.ts::bar', label: 'bar', type: 'function', filePath: 'src/a.ts', line: 15, parent: 'file::src/a.ts' },
    { id: 'file::src/b.ts', label: 'b.ts', type: 'file', filePath: 'src/b.ts', line: 1 },
    { id: 'file::src/b.ts::baz', label: 'baz', type: 'function', filePath: 'src/b.ts', line: 3, parent: 'file::src/b.ts' },
  ],
  edges: [
    { source: 'file::src/a.ts::foo', target: 'file::src/a.ts::bar', type: 'call' },
    { source: 'file::src/a.ts::bar', target: 'file::src/b.ts::baz', type: 'call' },
  ],
  metadata: { projectRoot: '/tmp/repo', analyzedAt: '2026-05-11T00:00:00.000Z', fileCount: 2 },
};

describe('GET /api/c4/call-hierarchy', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    db.saveCurrentGraph(fixtureGraph, '/tmp/repo/tsconfig.json', 'commit-1', 'repo');
    server = new TrailDataServer('/tmp', db, makeMockLogger(), '/tmp/repo');
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('returns a callees tree with the requested depth', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/c4/call-hierarchy?file=src/a.ts&fn=foo&direction=callees&depth=2`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as HierarchyResponse;
    expect(body.id).toBe('file::src/a.ts::foo');
    expect(body.label).toBe('foo');
    expect(body.children.map(c => c.id)).toEqual(['file::src/a.ts::bar']);
    expect(body.children[0].children.map(c => c.id)).toEqual(['file::src/b.ts::baz']);
  });

  it('respects depth=1 by truncating grandchildren', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/c4/call-hierarchy?file=src/a.ts&fn=foo&direction=callees&depth=1`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as HierarchyResponse;
    expect(body.children).toHaveLength(1);
    expect(body.children[0].children).toEqual([]);
  });

  it('returns 404 when the function is not found', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/c4/call-hierarchy?file=src/a.ts&fn=missing&direction=callees&depth=1`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/function not found/);
  });

  it('returns 400 when required params are missing', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/call-hierarchy?file=src/a.ts&direction=callees`);
    expect(res.status).toBe(400);
  });

  it('returns a callers tree when direction=callers', async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/api/c4/call-hierarchy?file=src/b.ts&fn=baz&direction=callers&depth=2`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as HierarchyResponse;
    expect(body.id).toBe('file::src/b.ts::baz');
    expect(body.children.map(c => c.id)).toEqual(['file::src/a.ts::bar']);
    expect(body.children[0].children.map(c => c.id)).toEqual(['file::src/a.ts::foo']);
  });

  describe('scope and excludeTests', () => {
    beforeEach(() => {
      // 既存 fixtureGraph を上書きして scope テスト用に置換
      db.saveCurrentGraph(scopeFixtureGraph, '/tmp/repo/tsconfig.json', 'commit-scope', 'repo');
      // index は notifyCodeGraphUpdated で invalidate されるはずだが、テストでは
      // graph 切替後の再 fetch のみ確認すれば良いので明示的に touch する
      server.notifyCodeGraphUpdated();
    });

    it('scope=package restricts to same packages/<name>/ prefix', async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/c4/call-hierarchy?file=packages/a/src/foo.ts&fn=root&direction=callees&depth=1&scope=package`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as HierarchyResponse;
      const ids = body.children.map(c => c.id);
      expect(ids).toContain('file::packages/a/src/foo.ts::sibling');
      expect(ids).toContain('file::packages/a/src/bar.ts::samePkg');
      expect(ids).toContain('file::packages/a/src/bar.test.ts::testFn');
      expect(ids).not.toContain('file::packages/b/src/other.ts::otherPkg');
    });

    it('scope=file restricts to the same filePath as root', async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/c4/call-hierarchy?file=packages/a/src/foo.ts&fn=root&direction=callees&depth=1&scope=file`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as HierarchyResponse;
      const ids = body.children.map(c => c.id);
      expect(ids).toEqual(['file::packages/a/src/foo.ts::sibling']);
    });

    it('excludeTests=true filters out test files', async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/c4/call-hierarchy?file=packages/a/src/foo.ts&fn=root&direction=callees&depth=1&excludeTests=true`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as HierarchyResponse;
      const ids = body.children.map(c => c.id);
      expect(ids).toContain('file::packages/a/src/foo.ts::sibling');
      expect(ids).toContain('file::packages/a/src/bar.ts::samePkg');
      expect(ids).toContain('file::packages/b/src/other.ts::otherPkg');
      expect(ids).not.toContain('file::packages/a/src/bar.test.ts::testFn');
    });
  });
});
