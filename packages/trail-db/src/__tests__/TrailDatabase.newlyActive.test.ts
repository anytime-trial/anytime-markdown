// Phase 6 S5-D: newly_active 列の往復と、判定入力となる churn クエリ。
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';
import type { FileAnalysisRow } from '@anytime-markdown/trail-core/deadCode';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };

function seedCommit(db: TrailDatabase, hash: string, filePath: string, at: string): void {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  const sessionId = `s-${hash}`;
  // repo フィルタは sessions.repo_id で効くため、repo を解決して紐づける
  const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName(
    'anytime-markdown',
  );
  inner.run(
    `INSERT OR IGNORE INTO sessions (id, slug, repo_id, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at)
     VALUES (?, ?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId, repoId],
  );
  inner.run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, commit_message, committed_at, author) VALUES (?, ?, '', ?, 'Taro')`,
    [sessionId, hash, at],
  );
  inner.run(`INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`, [
    hash,
    filePath,
  ]);
}

function sampleRow(overrides: Partial<FileAnalysisRow> = {}): FileAnalysisRow {
  return {
    repoName: 'anytime-markdown',
    filePath: 'packages/x/src/a.ts',
    importanceScore: 0,
    fanInTotal: 0,
    cognitiveComplexityMax: 0,
    cyclomaticComplexityMax: 0,
    lineCount: 10,
    functionCount: 1,
    deadCodeScore: 0,
    signals: {
      orphan: false,
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
    analyzedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 6 S5-D: newly_active の永続化', () => {
  let db: TrailDatabase;
  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => {
    db.close();
  });

  it('newlyActive を書いて読み戻せる', () => {
    db.upsertCurrentFileAnalysis([
      sampleRow({ filePath: 'packages/x/src/new.ts', newlyActive: true }),
      sampleRow({ filePath: 'packages/x/src/old.ts', newlyActive: false }),
    ]);
    const rows = db.getCurrentFileAnalysis('anytime-markdown');
    const byPath = new Map(rows.map((r) => [r.filePath, r]));
    expect(byPath.get('packages/x/src/new.ts')?.newlyActive).toBe(true);
    expect(byPath.get('packages/x/src/old.ts')?.newlyActive).toBe(false);
  });

  it('他の列（category / deadCodeScore）が桁ずれしない', () => {
    db.upsertCurrentFileAnalysis([
      sampleRow({ category: 'ui', deadCodeScore: 42, newlyActive: true, analyzedAt: '2026-07-18T01:02:03.000Z' }),
    ]);
    const [row] = db.getCurrentFileAnalysis('anytime-markdown');
    expect(row.category).toBe('ui');
    expect(row.deadCodeScore).toBe(42);
    expect(row.analyzedAt).toBe('2026-07-18T01:02:03.000Z');
    expect(row.newlyActive).toBe(true);
  });
});

describe('Phase 6 S5-D: 判定入力の churn クエリ', () => {
  let db: TrailDatabase;
  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });
  afterEach(() => {
    db.close();
  });

  it('getCommitFilesChurnBefore は指定時刻より前のコミットだけ数える', () => {
    seedCommit(db, 'h-old', 'packages/x/src/a.ts', '2026-05-01T00:00:00.000Z');
    seedCommit(db, 'h-new', 'packages/x/src/a.ts', '2026-07-17T00:00:00.000Z');

    const before = db.getCommitFilesChurnBefore('anytime-markdown', '2026-07-01T00:00:00.000Z');
    expect(before.get('packages/x/src/a.ts')).toBe(1);

    const beforeAll = db.getCommitFilesChurnBefore('anytime-markdown', '2026-08-01T00:00:00.000Z');
    expect(beforeAll.get('packages/x/src/a.ts')).toBe(2);
  });

  it('getEarliestCommitAt は最古のコミット時刻を返し、履歴なしは null', () => {
    expect(db.getEarliestCommitAt('anytime-markdown')).toBeNull();
    seedCommit(db, 'h1', 'packages/x/src/a.ts', '2026-07-17T00:00:00.000Z');
    seedCommit(db, 'h2', 'packages/x/src/a.ts', '2026-05-01T00:00:00.000Z');
    expect(db.getEarliestCommitAt('anytime-markdown')).toBe('2026-05-01T00:00:00.000Z');
  });
});
