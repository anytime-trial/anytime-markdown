
import { TrailDatabase, defaultTemporalCouplingPathFilter } from '../TrailDatabase';
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
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'r', '0', '', '', '', '', 0, '', 0, '')`,
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

describe('defaultTemporalCouplingPathFilter', () => {
  it('drops lockfiles, dist/node_modules, source maps, .worktrees', () => {
    const drops = [
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'foo.lock',
      'dist/index.js',
      'packages/x/dist/y.js',
      'node_modules/foo/index.js',
      'packages/x/node_modules/foo/index.js',
      'foo.min.js',
      'dist/main.js.map',
      '.worktrees/x/file.ts',
      'packages/x/.worktrees/y/file.ts',
    ];
    for (const p of drops) {
      expect(defaultTemporalCouplingPathFilter(p)).toBe(false);
    }
  });

  it('keeps regular source files', () => {
    const keeps = [
      'src/index.ts',
      'packages/trail-core/src/analyze.ts',
      'README.md',
    ];
    for (const p of keeps) {
      expect(defaultTemporalCouplingPathFilter(p)).toBe(true);
    }
  });
});

describe('TrailDatabase.fetchTemporalCoupling', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  const isoDaysAgo = (days: number): string =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  it('returns Ghost Edge for files frequently co-changed within window', () => {
    insertSessionCommit(db, 's1', 'h1', isoDaysAgo(1));
    insertSessionCommit(db, 's1', 'h2', isoDaysAgo(2));
    insertSessionCommit(db, 's1', 'h3', isoDaysAgo(3));
    insertSessionCommit(db, 's1', 'h4', isoDaysAgo(4));
    insertSessionCommit(db, 's1', 'h5', isoDaysAgo(5));
    for (const h of ['h1', 'h2', 'h3', 'h4', 'h5']) {
      insertCommitFile(db, h, 'src/a.ts');
      insertCommitFile(db, h, 'src/b.ts');
    }

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 5,
      jaccardThreshold: 0.5,
      topK: 50,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'src/a.ts',
      target: 'src/b.ts',
      coChangeCount: 5,
      jaccard: 1.0,
    });
  });

  it('excludes commits committed outside the window', () => {
    insertSessionCommit(db, 's1', 'h1', isoDaysAgo(1));
    insertSessionCommit(db, 's1', 'old', isoDaysAgo(100));
    for (const h of ['h1', 'old']) {
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

    // Only h1 is in window → coChangeCount = 1, not 2
    expect(edges).toHaveLength(1);
    expect(edges[0].coChangeCount).toBe(1);
  });

  it('excludes lockfiles via default path filter', () => {
    for (let i = 1; i <= 5; i++) {
      insertSessionCommit(db, 's1', `h${i}`, isoDaysAgo(i));
      insertCommitFile(db, `h${i}`, 'src/a.ts');
      insertCommitFile(db, `h${i}`, 'package-lock.json');
    }

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
    });

    const files = new Set(edges.flatMap((e) => [e.source, e.target]));
    expect(files.has('package-lock.json')).toBe(false);
  });

  it('excludes pairs already present as static dependency in current_graphs', () => {
    for (let i = 1; i <= 5; i++) {
      insertSessionCommit(db, 's1', `h${i}`, isoDaysAgo(i));
      insertCommitFile(db, `h${i}`, 'src/a.ts');
      insertCommitFile(db, `h${i}`, 'src/b.ts');
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
      jaccardThreshold: 0,
      topK: 50,
    });

    expect(edges).toHaveLength(0);
  });

  it('returns empty array when no commits fall within window', () => {
    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
    });
    expect(edges).toEqual([]);
  });

  it('integration: complex scenario with mixed coupling, lockfile noise, and static-dependency exclusion', () => {
    // Setup: 10 commits over 20 days
    // - a.ts ↔ b.ts: co-changed in 8/8 commits (J=1.0, kept)
    // - a.ts ↔ c.ts: co-changed in 3/8 commits (J=0.375, dropped at threshold 0.5)
    // - d.ts ↔ e.ts: co-changed in 5/5 commits (J=1.0, but dropped — listed as static dependency)
    // - package-lock.json: in every commit (filtered out)
    // - dist/index.js: in every commit (filtered out)

    const abCommits = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
    const acCommits = ['c1', 'c2', 'c3'];
    const deCommits = ['d1', 'd2', 'd3', 'd4', 'd5'];

    abCommits.forEach((h, i) => {
      insertSessionCommit(db, 's1', h, isoDaysAgo(i + 1));
      insertCommitFile(db, h, 'src/a.ts');
      insertCommitFile(db, h, 'src/b.ts');
      insertCommitFile(db, h, 'package-lock.json');
      insertCommitFile(db, h, 'dist/index.js');
    });
    acCommits.forEach((h) => {
      insertCommitFile(db, h, 'src/c.ts');
    });
    deCommits.forEach((h, i) => {
      insertSessionCommit(db, 's1', h, isoDaysAgo(i + 9));
      insertCommitFile(db, h, 'src/d.ts');
      insertCommitFile(db, h, 'src/e.ts');
    });

    db.saveCurrentGraph(
      {
        nodes: [
          { id: 'nd', label: 'd', type: 'file', filePath: 'src/d.ts', line: 0 },
          { id: 'ne', label: 'e', type: 'file', filePath: 'src/e.ts', line: 0 },
        ],
        edges: [{ source: 'nd', target: 'ne', type: 'import' }],
        metadata: { projectRoot: '/x', analyzedAt: '2026-04-29T00:00:00.000Z', fileCount: 2 },
      },
      '/x/tsconfig.json',
      'commitX',
      'r',
    );

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 3,
      jaccardThreshold: 0.5,
      topK: 50,
    });

    const files = new Set(edges.flatMap((e) => [e.source, e.target]));
    expect(files.has('package-lock.json')).toBe(false);
    expect(files.has('dist/index.js')).toBe(false);

    const ab = edges.find((e) => e.source === 'src/a.ts' && e.target === 'src/b.ts');
    expect(ab).toBeDefined();
    expect(ab!.jaccard).toBe(1.0);
    expect(ab!.coChangeCount).toBe(8);

    expect(edges.find((e) => e.source === 'src/d.ts' && e.target === 'src/e.ts')).toBeUndefined();

    expect(
      edges.find(
        (e) =>
          (e.source === 'src/a.ts' && e.target === 'src/c.ts') ||
          (e.source === 'src/c.ts' && e.target === 'src/a.ts'),
      ),
    ).toBeUndefined();
  });
});
