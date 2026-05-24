import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runCodeIncremental } from '../../src/pipeline/runCodeIncremental';
import type { MemoryLogger } from '../../src/logger';

// ── Mock analyzeWithProgram ──────────────────────────────────────────────────
// Do NOT call real tsc in unit tests; inject a synthetic TrailGraph + ts.Program.

const MOCK_GRAPH = {
  nodes: [
    {
      id: 'src/index.ts',
      label: 'index.ts',
      type: 'file' as const,
      filePath: 'src/index.ts',
      line: 0,
    },
    {
      id: 'src/index.ts#myFunc',
      label: 'myFunc',
      type: 'function' as const,
      filePath: 'src/index.ts',
      line: 5,
      parent: 'src/index.ts',
    },
  ],
  edges: [
    {
      source: 'src/index.ts',
      target: 'src/index.ts#myFunc',
      type: 'call' as const,
    },
  ],
  metadata: {
    projectRoot: '/fake/root',
    analyzedAt: '2026-01-01T00:00:00.000Z',
    fileCount: 1,
  },
};

// Minimal ts.Program stub (only getSourceFiles() is used by extractDecisionComments)
const MOCK_PROGRAM = {
  getSourceFiles: () => [],
};

jest.mock('@anytime-markdown/trail-core/analyze', () => ({
  analyzeWithProgram: jest.fn((_opts: unknown) => ({
    graph: MOCK_GRAPH,
    program: MOCK_PROGRAM,
    projectRoot: '/fake/root',
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const REPO = 'test-repo';
const GRAPH_UPDATED_AT = '2026-01-02T00:00:00.000Z';

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};


function makeMemoryDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTrailDb(): BetterSqlite3MemoryDb {
  const trailDb = BetterSqlite3MemoryDb.openInMemory();
  // Phase H-3: trail.current_code_graphs から repo_name 列を撤去し repo_id PK にしたため、
  // fixture も repos + repo_id PK スキーマで作る。
  trailDb.run(`
    CREATE TABLE repos (
      repo_id    INTEGER PRIMARY KEY,
      repo_name  TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    ) STRICT
  `);
  // current_code_graphs
  trailDb.run(`
    CREATE TABLE current_code_graphs (
      repo_id      INTEGER PRIMARY KEY REFERENCES repos(repo_id) ON DELETE CASCADE,
      graph_json   TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    ) STRICT
  `);
  // session_commits (required by extractCommitRationale)
  trailDb.run(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL DEFAULT ''
    ) STRICT
  `);
  // Phase H-4: trail.session_commits から repo_name 列を撤去し repo_id 参照にしたため、
  // fixture も repo_id 列で作る (extractCommitRationale が trail.repos を JOIN して解決する)。
  trailDb.run(`
    CREATE TABLE session_commits (
      session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      commit_hash    TEXT NOT NULL,
      commit_message TEXT NOT NULL DEFAULT '',
      committed_at   TEXT,
      repo_id        INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, commit_hash)
    ) STRICT
  `);
  return trailDb;
}

function insertCodeGraph(
  trailDb: BetterSqlite3MemoryDb,
  repoName: string,
  updatedAt: string
): void {
  const graphJson = JSON.stringify({
    generatedAt: updatedAt,
    repositories: [{ id: repoName, label: repoName, path: `/repos/${repoName}` }],
    nodes: [
      {
        id: 'src/utils.ts',
        label: 'utils.ts',
        repo: repoName,
        package: 'src',
        fileType: 'code',
        community: 0,
        communityLabel: '',
        x: 0,
        y: 0,
        size: 1,
      },
    ],
    edges: [],
    communities: {},
    godNodes: [],
  });
  const repoId = trailRepoId(trailDb, repoName);
  trailDb.run(
    `INSERT INTO current_code_graphs (repo_id, graph_json, generated_at, updated_at) VALUES (?, ?, ?, ?)`,
    [repoId, graphJson, updatedAt, updatedAt]
  );
}

/** repo_name から repo_id を取得する (未登録なら登録・冪等)。trail-db の repoIdForName 相当。 */
function trailRepoId(trailDb: BetterSqlite3MemoryDb, repoName: string): number {
  trailDb.run(
    `INSERT INTO repos (repo_name, created_at) VALUES (?, ?) ON CONFLICT(repo_name) DO NOTHING`,
    [repoName, updatedAtSeed()]
  );
  const stmt = trailDb.prepare('SELECT repo_id FROM repos WHERE repo_name = ?');
  try {
    const row = stmt.get(repoName);
    return Number(row?.['repo_id'] ?? 0);
  } finally {
    stmt.free?.();
  }
}

function updatedAtSeed(): string {
  return '2026-01-01T00:00:00.000Z';
}

function countPipelineRuns(db: BetterSqlite3MemoryDb): number {
  const result = db.exec(`SELECT COUNT(*) FROM memory_pipeline_runs WHERE scope = 'code_incremental'`);
  return result[0]?.values[0][0] as number ?? 0;
}

function getPipelineState(db: BetterSqlite3MemoryDb): { status: string; last_processed_at: string } | null {
  const stmt = db.prepare(`SELECT status, last_processed_at FROM memory_pipeline_state WHERE scope = 'code_incremental'`);
  try {
    const row = stmt.get();
    if (row) {
      return {
        status: row['status'] as string,
        last_processed_at: row['last_processed_at'] as string,
      };
    }
    return null;
  } finally {
    stmt.free?.();
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runCodeIncremental', () => {
  describe('status=skipped when no code graph exists', () => {
    it('returns skipped and does not create a pipeline_run row', async () => {
      const memDb = makeMemoryDb();
      const trailDb = makeTrailDb(); // no code graph inserted
      attachTrailDbFromHandle(memDb, trailDb);

      const result = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/fake/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });

      expect(result.status).toBe('skipped');
      expect(result.items_processed).toBe(0);
      expect(countPipelineRuns(memDb)).toBe(0);
    });
  });

  describe('status=skipped when graph not updated', () => {
    it('returns skipped if updated_at <= last_processed_at', async () => {
      const memDb = makeMemoryDb();
      const trailDb = makeTrailDb();
      insertCodeGraph(trailDb, REPO, GRAPH_UPDATED_AT);
      attachTrailDbFromHandle(memDb, trailDb);

      // Seed pipeline_state so last_processed_at === GRAPH_UPDATED_AT
      memDb.run(
        `INSERT INTO memory_pipeline_state (scope, status, last_processed_at)
         VALUES ('code_incremental', 'idle', ?)`,
        [GRAPH_UPDATED_AT]
      );

      const result = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/fake/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });

      expect(result.status).toBe('skipped');
      expect(countPipelineRuns(memDb)).toBe(0);
    });
  });

  describe('status=success on first run (no prior state)', () => {
    it('processes graph and advances pipeline_state', async () => {
      const memDb = makeMemoryDb();
      const trailDb = makeTrailDb();
      insertCodeGraph(trailDb, REPO, GRAPH_UPDATED_AT);
      attachTrailDbFromHandle(memDb, trailDb);

      const result = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/fake/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });

      expect(result.status).toBe('success');
      expect(result.items_processed).toBeGreaterThan(0);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);

      // Pipeline state should advance to GRAPH_UPDATED_AT
      const state = getPipelineState(memDb);
      expect(state).not.toBeNull();
      expect(state!.status).toBe('idle');
      expect(state!.last_processed_at).toBe(GRAPH_UPDATED_AT);

      // A pipeline_run row should exist and be finalized
      expect(countPipelineRuns(memDb)).toBe(1);
      const runRows = memDb.exec(
        `SELECT status FROM memory_pipeline_runs WHERE scope = 'code_incremental'`
      );
      expect(runRows[0]?.values[0][0]).toBe('success');
    });
  });

  describe('status=skipped on 2nd run when graph unchanged', () => {
    it('skips if updated_at has not changed since last run', async () => {
      const memDb = makeMemoryDb();
      const trailDb = makeTrailDb();
      insertCodeGraph(trailDb, REPO, GRAPH_UPDATED_AT);
      attachTrailDbFromHandle(memDb, trailDb);

      // First run
      const first = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/fake/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });
      expect(first.status).toBe('success');

      // Second run — graph unchanged
      const second = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/fake/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });
      expect(second.status).toBe('skipped');
      // Still only 1 pipeline_run row (no new run created for skip)
      expect(countPipelineRuns(memDb)).toBe(1);
    });
  });

  describe('status=error on invalid tsconfigPath', () => {
    it('records failed_item and returns error when analyzeWithProgram throws', async () => {
      // Override mock to throw for this test
      const { analyzeWithProgram } = jest.requireMock('@anytime-markdown/trail-core/analyze') as {
        analyzeWithProgram: jest.Mock;
      };
      analyzeWithProgram.mockImplementationOnce(() => {
        throw new Error('Cannot find tsconfig: /nonexistent/tsconfig.json');
      });

      const memDb = makeMemoryDb();
      const trailDb = makeTrailDb();
      insertCodeGraph(trailDb, REPO, GRAPH_UPDATED_AT);
      attachTrailDbFromHandle(memDb, trailDb);

      const result = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/nonexistent/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });

      expect(result.status).toBe('error');

      // A failed_item row should be recorded with scope='code'
      const failedRows = memDb.exec(
        `SELECT scope, item_key FROM memory_failed_items WHERE scope = 'code'`
      );
      expect(failedRows[0]?.values.length).toBeGreaterThanOrEqual(1);
      expect(failedRows[0]?.values[0][1]).toBe('/nonexistent/tsconfig.json');

      // Pipeline_run should exist and be finalized as error
      expect(countPipelineRuns(memDb)).toBe(1);
      const runRows = memDb.exec(
        `SELECT status FROM memory_pipeline_runs WHERE scope = 'code_incremental'`
      );
      expect(runRows[0]?.values[0][0]).toBe('error');
    });
  });
});
