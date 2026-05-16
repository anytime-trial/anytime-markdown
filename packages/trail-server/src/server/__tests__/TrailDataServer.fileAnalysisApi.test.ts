
jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn().mockResolvedValue(null) };
});

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { FileAnalysisRow } from '@anytime-markdown/trail-core/deadCode';

const sampleRow = (filePath: string, importanceScore: number, deadCodeScore: number): FileAnalysisRow => ({
  repoName: 'myrepo',
  filePath,
  importanceScore,
  fanInTotal: 3,
  cognitiveComplexityMax: 5,
  cyclomaticComplexityMax: 4,
  lineCount: 50,
  functionCount: 2,
  deadCodeScore,
  signals: {
    orphan: false,
    fanInZero: deadCodeScore > 50,
    noRecentChurn: false,
    zeroCoverage: false,
    isolatedCommunity: false,
  },
  isIgnored: false,
  ignoreReason: '',
  crossPkgInCount: 0,
  externalConsumerPkgs: 0,
  totalInCount: 0,
  isBarrel: false,
  centralityScore: 0,
  category: 'logic',
  analyzedAt: new Date().toISOString(),
});

describe('GET /api/c4/file-analysis', () => {
  let server: TrailDataServer;
  let db: TrailDatabase;
  let port: number;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    server = new TrailDataServer('/tmp', db, makeMockLogger());
    await server.start(0);
    port = server.port;
  });

  afterEach(async () => {
    await server.stop();
    db.close();
  });

  it('missing repo returns 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/file-analysis`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('repo');
  });

  it('empty DB returns entries=[] and empty elementMatrix', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/file-analysis?repo=myrepo`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      entries: unknown[];
      elementMatrix: { importance: Record<string, number>; deadCodeScore: Record<string, number>; centrality: Record<string, number>; functionRoles: Record<string, unknown> };
    };
    expect(body.entries).toEqual([]);
    expect(body.elementMatrix.importance).toEqual({});
    expect(body.elementMatrix.deadCodeScore).toEqual({});
  });

  it('populated DB returns entries with correct shape', async () => {
    db.upsertCurrentFileAnalysis([
      sampleRow('packages/a/foo.ts', 80, 60),
      sampleRow('packages/a/bar.ts', 40, 10),
    ]);

    const res = await fetch(`http://127.0.0.1:${port}/api/c4/file-analysis?repo=myrepo`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      entries: Array<{
        filePath: string;
        importanceScore: number;
        fanInTotal: number;
        cognitiveComplexityMax: number;
        functionCount: number;
        deadCodeScore: number;
        signals: Record<string, boolean>;
        isIgnored: boolean;
        ignoreReason: string;
      }>;
      elementMatrix: { importance: Record<string, number>; deadCodeScore: Record<string, number>; centrality: Record<string, number>; functionRoles: Record<string, unknown> };
    };

    expect(body.entries).toHaveLength(2);

    const foo = body.entries.find((e) => e.filePath === 'packages/a/foo.ts');
    expect(foo).toBeDefined();
    expect(foo?.importanceScore).toBe(80);
    expect(foo?.deadCodeScore).toBe(60);
    expect(foo?.fanInTotal).toBe(3);
    expect(foo?.cognitiveComplexityMax).toBe(5);
    expect(foo?.functionCount).toBe(2);
    expect(typeof foo?.signals).toBe('object');
    expect(foo?.isIgnored).toBe(false);

    // elementMatrix keys must exist (even when C4 model is null → elements=[])
    expect(body.elementMatrix).toHaveProperty('importance');
    expect(body.elementMatrix).toHaveProperty('deadCodeScore');
    expect(body.elementMatrix).toHaveProperty('centrality');
    expect(body.elementMatrix).toHaveProperty('functionRoles');
  });

  it('tag=current uses getCurrentFileAnalysis; other tag uses getReleaseFileAnalysis', async () => {
    db.upsertCurrentFileAnalysis([sampleRow('packages/a/current.ts', 70, 30)]);
    // release table is empty → different tag returns empty entries
    const resCurrent = await fetch(`http://127.0.0.1:${port}/api/c4/file-analysis?repo=myrepo&tag=current`);
    expect(resCurrent.status).toBe(200);
    const bodyCurrent = await resCurrent.json() as { entries: unknown[] };
    expect(bodyCurrent.entries).toHaveLength(1);

    const resRelease = await fetch(`http://127.0.0.1:${port}/api/c4/file-analysis?repo=myrepo&tag=v1.0.0`);
    expect(resRelease.status).toBe(200);
    const bodyRelease = await resRelease.json() as { entries: unknown[] };
    expect(bodyRelease.entries).toHaveLength(0);
  });
});
