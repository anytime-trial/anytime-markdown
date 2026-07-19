import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';
import type { FileAnalysisRow } from '@anytime-markdown/trail-core/deadCode';

const sample = (filePath: string, deadCodeScore: number): FileAnalysisRow => ({
  repoName: 'repo',
  filePath,
  importanceScore: 50,
  fanInTotal: 3,
  cognitiveComplexityMax: 8,
  cyclomaticComplexityMax: 0,
  lineCount: 0,
  functionCount: 2,
  deadCodeScore,
  signals: {
    orphan: deadCodeScore >= 45,
    fanInZero: false,
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
  newlyActive: false,
  analyzedAt: '2026-05-05T00:00:00Z',
});

describe('TrailDatabase: current_file_analysis CRUD', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  it('upsertCurrent → getCurrent で取得できる', () => {
    db.upsertCurrentFileAnalysis([sample('a.ts', 70), sample('b.ts', 30)]);
    const rows = db.getCurrentFileAnalysis('repo');
    expect(rows.length).toBe(2);
    const rowA = rows.find((r) => r.filePath === 'a.ts');
    if (!rowA) throw new Error('a.ts が取得できなかった');
    const rowB = rows.find((r) => r.filePath === 'b.ts');
    if (!rowB) throw new Error('b.ts が取得できなかった');
    expect(rowA.deadCodeScore).toBe(70);
    expect(rowA.signals.orphan).toBe(true);
    expect(rowB.signals.orphan).toBe(false);
  });

  it('同一 PK は上書き (洗い替え)', () => {
    db.upsertCurrentFileAnalysis([sample('a.ts', 70)]);
    db.upsertCurrentFileAnalysis([sample('a.ts', 20)]);
    const rows = db.getCurrentFileAnalysis('repo');
    expect(rows.length).toBe(1);
    expect(rows[0].deadCodeScore).toBe(20);
  });

  it('clearCurrent で全削除', () => {
    db.upsertCurrentFileAnalysis([sample('a.ts', 70)]);
    db.clearCurrentFileAnalysis('repo');
    expect(db.getCurrentFileAnalysis('repo').length).toBe(0);
  });

  it('別 repo は独立して扱われる', () => {
    db.upsertCurrentFileAnalysis([sample('a.ts', 70)]);
    db.clearCurrentFileAnalysis('other-repo');  // no-op for repo
    expect(db.getCurrentFileAnalysis('repo').length).toBe(1);
  });

  it('isIgnored / ignoreReason が round-trip で保持される', () => {
    const ignored: FileAnalysisRow = { ...sample('cfg.ts', 0), isIgnored: true, ignoreReason: 'user:**/*.config.ts' };
    db.upsertCurrentFileAnalysis([ignored]);
    const rows = db.getCurrentFileAnalysis('repo');
    expect(rows[0].isIgnored).toBe(true);
    expect(rows[0].ignoreReason).toBe('user:**/*.config.ts');
  });
});

describe('TrailDatabase: release_file_analysis CRUD', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    // release_file_analysis は releases(tag) を FK 参照するので先に INSERT
    const rawDb = (db as unknown as { ensureDb(): { run(sql: string, params?: unknown[]): void } }).ensureDb();
    rawDb.run('INSERT INTO releases (tag) VALUES (?)', ['v1.0.0']);
  });

  it('upsertRelease / getRelease / clearRelease', () => {
    db.upsertReleaseFileAnalysis('v1.0.0', [sample('a.ts', 70)]);
    const rows = db.getReleaseFileAnalysis('v1.0.0', 'repo');
    expect(rows.length).toBe(1);
    expect(rows[0].deadCodeScore).toBe(70);
    db.clearReleaseFileAnalysis('v1.0.0', 'repo');
    expect(db.getReleaseFileAnalysis('v1.0.0', 'repo').length).toBe(0);
  });
});

describe('TrailDatabase: AST メトリクス round-trip', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  it('upsertCurrentFileAnalysis → getCurrentFileAnalysis で lineCount/cyclomaticComplexityMax が保持される', () => {
    const row: FileAnalysisRow = {
      ...sample('a.ts', 30),
      lineCount: 200,
      cyclomaticComplexityMax: 5,
    };
    db.upsertCurrentFileAnalysis([row]);
    const rows = db.getCurrentFileAnalysis('repo');
    if (rows.length !== 1) throw new Error('Expected 1 row');
    expect(rows[0].lineCount).toBe(200);
    expect(rows[0].cyclomaticComplexityMax).toBe(5);
  });

  it('category 列が round-trip で保持される (ui / logic / excluded)', () => {
    db.upsertCurrentFileAnalysis([
      { ...sample('Component.tsx', 0), category: 'ui' },
      { ...sample('util.ts', 0), category: 'logic' },
      { ...sample('types.ts', 0), category: 'excluded' },
    ]);
    const rows = db.getCurrentFileAnalysis('repo');
    const byPath = new Map(rows.map((r) => [r.filePath, r.category]));
    expect(byPath.get('Component.tsx')).toBe('ui');
    expect(byPath.get('util.ts')).toBe('logic');
    expect(byPath.get('types.ts')).toBe('excluded');
  });
});
