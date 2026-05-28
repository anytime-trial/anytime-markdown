
jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn().mockResolvedValue(null) };
});

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import { fetchC4Model } from '@anytime-markdown/trail-core/c4';
import type { C4ModelPayload } from '@anytime-markdown/trail-core/c4';
import type { TrailGraph } from '@anytime-markdown/trail-core';

const minimalModel: C4ModelPayload['model'] = {
  level: 'code',
  elements: [
    { id: 'src/foo.ts', type: 'code', name: 'foo.ts' },
    { id: 'src/bar.ts', type: 'code', name: 'bar.ts' },
  ],
  relationships: [],
};

const minimalModelPayload: C4ModelPayload = {
  model: minimalModel,
  boundaries: [],
};

const minimalGraph: TrailGraph = {
  metadata: { projectRoot: '/tmp', analyzedAt: '2026-05-28T00:00:00.000Z', fileCount: 2 },
  nodes: [
    { id: 'src/foo.ts::a', label: 'a', type: 'function', filePath: 'src/foo.ts', line: 1 },
    { id: 'src/foo.ts::b', label: 'b', type: 'function', filePath: 'src/foo.ts', line: 5 },
    { id: 'src/bar.ts::c', label: 'c', type: 'function', filePath: 'src/bar.ts', line: 1 },
  ],
  edges: [
    { source: 'src/foo.ts::a', target: 'src/foo.ts::b', type: 'call' },
    { source: 'src/foo.ts::b', target: 'src/bar.ts::c', type: 'call' },
  ],
};

describe('GET /api/c4/function-graph', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    db.saveCurrentGraph(minimalGraph, '/tmp/tsconfig.json', 'commit-1', 'tmp');
    (fetchC4Model as jest.Mock).mockResolvedValue(minimalModelPayload);
    server = new TrailDataServer('/tmp', db, makeMockLogger(), '/tmp');
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('elementId に対応する関数ノード + call エッジを返す', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-graph?elementId=${encodeURIComponent('src/foo.ts')}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { elementId: string; nodes: unknown[]; edges: unknown[] };
    expect(body.elementId).toBe('src/foo.ts');
    expect(body.nodes.length).toBeGreaterThanOrEqual(2);
    expect(body.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('elementId が空なら 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-graph?elementId=`);
    expect(res.status).toBe(400);
  });

  it("elementId の type が 'code' 以外なら空グラフを返す", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-graph?elementId=pkg_unknown`);
    expect(res.status).toBe(200);
    const body = await res.json() as { nodes: unknown[]; edges: unknown[] };
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
  });

  it('TrailGraph 未取得時は空グラフを返す', async () => {
    (fetchC4Model as jest.Mock).mockResolvedValue(null);
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-graph?elementId=src/foo.ts`);
    expect(res.status).toBe(200);
    const body = await res.json() as { nodes: unknown[]; edges: unknown[] };
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
  });
});
