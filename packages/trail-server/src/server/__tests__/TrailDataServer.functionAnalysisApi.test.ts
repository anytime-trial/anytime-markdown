// __non_webpack_require__ はwebpackグローバル。テスト環境では sql-asm.js を直接ロードするよう差し替え
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js')); // eslint-disable-line @typescript-eslint/no-require-imports
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

jest.mock('ws', () => ({ WebSocketServer: jest.fn(() => ({ on: jest.fn(), close: jest.fn((cb?: () => void) => cb?.()) })) }));
jest.mock('@anytime-markdown/trail-core/c4', () => {
  const actual = jest.requireActual('@anytime-markdown/trail-core/c4');
  return { ...actual, fetchC4Model: jest.fn().mockResolvedValue(null) };
});

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import { TrailDataServer } from '../TrailDataServer';
import { createTestTrailDatabase } from '../../__tests__/support/createTestDb';
import type { TrailDatabase } from '@anytime-markdown/trail-db';
import type { FunctionAnalysisRow } from '@anytime-markdown/trail-core/deadCode';

const sampleFn = (
  filePath: string,
  name: string,
  startLine: number,
  fanIn: number,
): FunctionAnalysisRow => ({
  repoName: 'repo',
  filePath,
  functionName: name,
  startLine,
  endLine: startLine + 10,
  language: 'ts',
  fanIn,
  cognitiveComplexity: 5,
  cyclomaticComplexity: 4,
  dataMutationScore: 0,
  sideEffectScore: 0,
  lineCount: 10,
  importanceScore: 50,
  signalFanInZero: fanIn === 0,
  fanOut: 0,
  distinctCallees: 0,
  functionRole: 'peripheral' as const,
  analyzedAt: '2026-05-05T00:00:00.000Z',
});

describe('GET /api/c4/function-analysis', () => {
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
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('repo');
  });

  it('empty DB returns entries=[]', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=repo`);
    expect(res.status).toBe(200);
    const body = await res.json() as { entries: unknown[] };
    expect(body.entries).toEqual([]);
  });

  it('populated DB returns entries with all fields including signals.fanInZero', async () => {
    db.upsertCurrentFunctionAnalysis([
      sampleFn('packages/a/foo.ts', 'doSomething', 10, 3),
      sampleFn('packages/a/bar.ts', 'unused', 20, 0),
    ]);

    const res = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=repo`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      entries: Array<{
        filePath: string;
        functionName: string;
        startLine: number;
        endLine: number;
        language: string;
        fanIn: number;
        cognitiveComplexity: number;
        dataMutationScore: number;
        sideEffectScore: number;
        lineCount: number;
        importanceScore: number;
        signals: { fanInZero: boolean };
      }>;
    };

    expect(body.entries).toHaveLength(2);

    const doSomething = body.entries.find((e) => e.functionName === 'doSomething');
    expect(doSomething).toBeDefined();
    expect(doSomething?.filePath).toBe('packages/a/foo.ts');
    expect(doSomething?.startLine).toBe(10);
    expect(doSomething?.endLine).toBe(20);
    expect(doSomething?.language).toBe('ts');
    expect(doSomething?.fanIn).toBe(3);
    expect(doSomething?.cognitiveComplexity).toBe(5);
    expect(doSomething?.dataMutationScore).toBe(0);
    expect(doSomething?.sideEffectScore).toBe(0);
    expect(doSomething?.lineCount).toBe(10);
    expect(doSomething?.importanceScore).toBe(50);
    expect(doSomething?.signals.fanInZero).toBe(false);

    const unused = body.entries.find((e) => e.functionName === 'unused');
    expect(unused).toBeDefined();
    expect(unused?.fanIn).toBe(0);
    expect(unused?.signals.fanInZero).toBe(true);
  });

  it('tag=current uses getCurrentFunctionAnalysis; other tag uses getReleaseFunctionAnalysis', async () => {
    db.upsertCurrentFunctionAnalysis([sampleFn('packages/a/current.ts', 'fn', 1, 2)]);
    // release table is empty → different tag returns empty entries

    const resCurrent = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=repo&tag=current`);
    expect(resCurrent.status).toBe(200);
    const bodyCurrent = await resCurrent.json() as { entries: unknown[] };
    expect(bodyCurrent.entries).toHaveLength(1);

    const resRelease = await fetch(`http://127.0.0.1:${port}/api/c4/function-analysis?repo=repo&tag=v1.0.0`);
    expect(resRelease.status).toBe(200);
    const bodyRelease = await resRelease.json() as { entries: unknown[] };
    expect(bodyRelease.entries).toHaveLength(0);
  });
});
