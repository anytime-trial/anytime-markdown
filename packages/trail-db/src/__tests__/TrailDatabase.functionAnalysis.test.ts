import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';
import type { FunctionAnalysisRow } from '@anytime-markdown/trail-core/deadCode';

const sample = (
  filePath: string,
  functionName: string,
  startLine: number,
  fanIn: number,
): FunctionAnalysisRow => ({
  repoName: 'repo',
  filePath,
  functionName,
  startLine,
  endLine: startLine + 10,
  language: 'ts',
  fanIn,
  cognitiveComplexity: 5,
  cyclomaticComplexity: 0,
  dataMutationScore: 0,
  sideEffectScore: 0,
  lineCount: 10,
  importanceScore: 50,
  signalFanInZero: fanIn === 0,
  fanOut: 0,
  distinctCallees: 0,
  analyzedAt: '2026-05-05T00:00:00Z',
});

describe('TrailDatabase: current_function_analysis CRUD', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  it('upsertCurrent → getCurrent で取得できる', () => {
    db.upsertCurrentFunctionAnalysis([
      sample('a.ts', 'foo', 1, 3),
      sample('a.ts', 'bar', 50, 0),
    ]);
    const rows = db.getCurrentFunctionAnalysis('repo');
    expect(rows.length).toBe(2);
    const foo = rows.find((r) => r.functionName === 'foo')!;
    expect(foo.fanIn).toBe(3);
    expect(foo.signalFanInZero).toBe(false);
    const bar = rows.find((r) => r.functionName === 'bar')!;
    expect(bar.signalFanInZero).toBe(true);
  });

  it('PK overload 区別: 同一 file/name でも start_line 違いは別行', () => {
    db.upsertCurrentFunctionAnalysis([
      sample('a.ts', 'overload', 10, 1),
      sample('a.ts', 'overload', 30, 2),
    ]);
    const rows = db.getCurrentFunctionAnalysis('repo');
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.startLine).sort()).toEqual([10, 30]);
  });

  it('同一 PK は上書き', () => {
    db.upsertCurrentFunctionAnalysis([sample('a.ts', 'foo', 1, 3)]);
    db.upsertCurrentFunctionAnalysis([sample('a.ts', 'foo', 1, 99)]);
    const rows = db.getCurrentFunctionAnalysis('repo');
    expect(rows.length).toBe(1);
    expect(rows[0].fanIn).toBe(99);
  });

  it('clearCurrent で全削除', () => {
    db.upsertCurrentFunctionAnalysis([sample('a.ts', 'foo', 1, 3)]);
    db.clearCurrentFunctionAnalysis('repo');
    expect(db.getCurrentFunctionAnalysis('repo').length).toBe(0);
  });
});

describe('TrailDatabase: release_function_analysis CRUD', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    const rawDb = (db as unknown as { ensureDb(): { run(sql: string, params?: unknown[]): void } }).ensureDb();
    rawDb.run('INSERT INTO releases (tag) VALUES (?)', ['v1.0.0']);
  });

  it('upsertRelease / getRelease / clearRelease', () => {
    db.upsertReleaseFunctionAnalysis('v1.0.0', [sample('a.ts', 'foo', 1, 3)]);
    const rows = db.getReleaseFunctionAnalysis('v1.0.0', 'repo');
    expect(rows.length).toBe(1);
    expect(rows[0].fanIn).toBe(3);
    db.clearReleaseFunctionAnalysis('v1.0.0', 'repo');
    expect(db.getReleaseFunctionAnalysis('v1.0.0', 'repo').length).toBe(0);
  });
});

describe('TrailDatabase: FunctionAnalysis cyclomaticComplexity round-trip', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  it('upsertCurrentFunctionAnalysis → getCurrentFunctionAnalysis で cyclomaticComplexity が保持される', () => {
    const row: FunctionAnalysisRow = {
      ...sample('a.ts', 'compute', 1, 2),
      cyclomaticComplexity: 3,
    };
    db.upsertCurrentFunctionAnalysis([row]);
    const rows = db.getCurrentFunctionAnalysis('repo');
    if (rows.length !== 1) throw new Error('Expected 1 row');
    expect(rows[0].cyclomaticComplexity).toBe(3);
  });
});
