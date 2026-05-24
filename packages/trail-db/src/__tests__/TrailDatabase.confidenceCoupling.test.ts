
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const insertSessionCommit = (
  db: TrailDatabase,
  sessionId: string,
  hash: string,
  committedAt: string,
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (id, slug, version, entrypoint, model, start_time, end_time, message_count, file_path, file_size, imported_at) VALUES (?, ?, '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
  inner.run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, committed_at)
     VALUES (?, ?, ?)`,
    [sessionId, hash, committedAt],
  );
};

const insertCommitFile = (db: TrailDatabase, hash: string, filePath: string): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`,
    [hash, filePath],
  );
};

describe('TrailDatabase.fetchTemporalCoupling (directional)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  const isoDaysAgo = (days: number): string =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  it('returns ConfidenceCouplingEdge[] with direction info when directional=true', () => {
    // auth.ts: c1..c5 (5 commits), login.ts: c1 (1 commit), co=1
    // C(auth→login) = 1/5 = 0.2
    // C(login→auth) = 1/1 = 1.0
    // diff = 0.8 >= 0.3 → directed
    // Need confidenceThreshold below 1.0 to keep, default 0.5 OK
    insertSessionCommit(db, 's1', 'h1', isoDaysAgo(1));
    insertSessionCommit(db, 's1', 'h2', isoDaysAgo(2));
    insertSessionCommit(db, 's1', 'h3', isoDaysAgo(3));
    insertSessionCommit(db, 's1', 'h4', isoDaysAgo(4));
    insertSessionCommit(db, 's1', 'h5', isoDaysAgo(5));
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5']) {
      insertCommitFile(db, h, 'src/auth.ts');
    }
    insertCommitFile(db, 'h1', 'src/login.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      topK: 50,
      directional: true,
      confidenceThreshold: 0.5,
      directionalDiffThreshold: 0.3,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0].direction).toBe('A→B');
    expect(edges[0].source).toBe('src/login.ts');
    expect(edges[0].target).toBe('src/auth.ts');
    expect(edges[0].confidenceForward).toBeCloseTo(1.0, 5);
    expect(edges[0].confidenceBackward).toBeCloseTo(0.2, 5);
  });

  it('returns symmetric pair as undirected when both confidences match', () => {
    insertSessionCommit(db, 's1', 'h1', isoDaysAgo(1));
    insertSessionCommit(db, 's1', 'h2', isoDaysAgo(2));
    insertSessionCommit(db, 's1', 'h3', isoDaysAgo(3));
    for (const h of ['h1', 'h2', 'h3']) {
      insertCommitFile(db, h, 'src/a.ts');
      insertCommitFile(db, h, 'src/b.ts');
    }

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      topK: 50,
      directional: true,
      confidenceThreshold: 0.5,
      directionalDiffThreshold: 0.3,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0].direction).toBe('undirected');
    expect(edges[0].source).toBe('src/a.ts');
    expect(edges[0].target).toBe('src/b.ts');
  });

  it('excludes static dependency pairs in directional mode', () => {
    insertSessionCommit(db, 's1', 'h1', isoDaysAgo(1));
    insertSessionCommit(db, 's1', 'h2', isoDaysAgo(2));
    insertSessionCommit(db, 's1', 'h3', isoDaysAgo(3));
    for (const h of ['h1', 'h2', 'h3']) {
      insertCommitFile(db, h, 'src/a.ts');
      insertCommitFile(db, h, 'src/b.ts');
    }

    db.saveCurrentGraph(
      {
        nodes: [
          { id: 'n1', label: 'a', type: 'file', filePath: 'src/a.ts', line: 0 },
          { id: 'n2', label: 'b', type: 'file', filePath: 'src/b.ts', line: 0 },
        ],
        edges: [{ source: 'n1', target: 'n2', type: 'import' }],
        metadata: { projectRoot: '/x', analyzedAt: '2026-04-29T00:00:00.000Z', fileCount: 2 },
      },
      '/x/tsconfig.json',
      'commitX',
      'r',
    );

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      topK: 50,
      directional: true,
      confidenceThreshold: 0,
      directionalDiffThreshold: 0,
    });

    expect(edges).toHaveLength(0);
  });

  it('preserves Phase 1 behavior when directional is omitted (default false)', () => {
    insertSessionCommit(db, 's1', 'h1', isoDaysAgo(1));
    for (const h of ['h1']) {
      insertCommitFile(db, h, 'src/a.ts');
      insertCommitFile(db, h, 'src/b.ts');
    }

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
    });

    // Phase 1 shape: TemporalCouplingEdge has no `direction` field
    expect(edges).toHaveLength(1);
    expect((edges[0] as { direction?: unknown }).direction).toBeUndefined();
    expect(edges[0]).toMatchObject({
      source: 'src/a.ts',
      target: 'src/b.ts',
      jaccard: 1.0,
    });
  });
});
