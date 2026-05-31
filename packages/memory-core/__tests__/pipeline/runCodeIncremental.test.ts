import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runCodeIncremental } from '../../src/pipeline/runCodeIncremental';
import type { MemoryLogger } from '../../src/logger';

// typescript 依存は撤去済み。runCodeIncremental は trail-db の current_graphs（生 TrailGraph）と
// code_decision_comments（analyze-child が永続化）から読むため、fixture でそれらを用意する。

/** ingestAstFacts が処理する生 TrailGraph（file + function ノード + call エッジ）。 */
const RAW_TRAIL_GRAPH = {
  nodes: [
    { id: 'src/index.ts', label: 'index.ts', type: 'file' as const, filePath: 'src/index.ts', line: 0 },
    {
      id: 'src/index.ts#myFunc',
      label: 'myFunc',
      type: 'function' as const,
      filePath: 'src/index.ts',
      line: 5,
      parent: 'src/index.ts',
    },
  ],
  edges: [{ source: 'src/index.ts', target: 'src/index.ts#myFunc', type: 'call' as const }],
  metadata: { projectRoot: '/fake/root', analyzedAt: '2026-01-01T00:00:00.000Z', fileCount: 1 },
};

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
  trailDb.run(`
    CREATE TABLE repos (
      repo_id    INTEGER PRIMARY KEY,
      repo_name  TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    ) STRICT
  `);
  // current_code_graphs（fromTrailGraph が読む C4 グラフ）
  trailDb.run(`
    CREATE TABLE current_code_graphs (
      repo_id      INTEGER PRIMARY KEY REFERENCES repos(repo_id) ON DELETE CASCADE,
      graph_json   TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    ) STRICT
  `);
  // current_graphs（ingestAstFacts が読む生 TrailGraph）
  trailDb.run(`
    CREATE TABLE current_graphs (
      repo_id       INTEGER PRIMARY KEY REFERENCES repos(repo_id) ON DELETE CASCADE,
      commit_id     TEXT NOT NULL DEFAULT '',
      graph_json    TEXT NOT NULL,
      tsconfig_path TEXT NOT NULL DEFAULT '',
      project_root  TEXT NOT NULL DEFAULT '',
      analyzed_at   TEXT NOT NULL,
      updated_at    TEXT
    ) STRICT
  `);
  // code_decision_comments（ingestDecisionComments が読む decision comment）
  trailDb.run(`
    CREATE TABLE code_decision_comments (
      repo_id      INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
      comment_hash TEXT NOT NULL,
      file_path    TEXT NOT NULL,
      line         INTEGER NOT NULL,
      comment_text TEXT NOT NULL,
      symbol_name  TEXT,
      commit_sha   TEXT,
      recorded_at  TEXT NOT NULL,
      PRIMARY KEY (repo_id, comment_hash)
    ) STRICT
  `);
  trailDb.run(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL DEFAULT ''
    ) STRICT
  `);
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

function insertCodeGraph(trailDb: BetterSqlite3MemoryDb, repoName: string, updatedAt: string): void {
  const repoId = trailRepoId(trailDb, repoName);
  const codeGraphJson = JSON.stringify({
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
  trailDb.run(
    `INSERT INTO current_code_graphs (repo_id, graph_json, generated_at, updated_at) VALUES (?, ?, ?, ?)`,
    [repoId, codeGraphJson, updatedAt, updatedAt]
  );
  // 生 TrailGraph（ingestAstFacts 用）
  trailDb.run(
    `INSERT INTO current_graphs (repo_id, commit_id, graph_json, tsconfig_path, project_root, analyzed_at, updated_at)
     VALUES (?, '', ?, '', '/fake/root', ?, ?)`,
    [repoId, JSON.stringify(RAW_TRAIL_GRAPH), updatedAt, updatedAt]
  );
}

function insertDecisionComment(
  trailDb: BetterSqlite3MemoryDb,
  repoName: string,
  comment: { filePath: string; line: number; text: string; symbolName: string | null }
): void {
  const repoId = trailRepoId(trailDb, repoName);
  trailDb.run(
    `INSERT INTO code_decision_comments
       (repo_id, comment_hash, file_path, line, comment_text, symbol_name, commit_sha, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      repoId,
      `${comment.filePath}:${comment.line}`,
      comment.filePath,
      comment.line,
      comment.text,
      comment.symbolName,
      '2026-01-01T00:00:00.000Z',
    ]
  );
}

function trailRepoId(trailDb: BetterSqlite3MemoryDb, repoName: string): number {
  trailDb.run(
    `INSERT INTO repos (repo_name, created_at) VALUES (?, ?) ON CONFLICT(repo_name) DO NOTHING`,
    [repoName, '2026-01-01T00:00:00.000Z']
  );
  const stmt = trailDb.prepare('SELECT repo_id FROM repos WHERE repo_name = ?');
  try {
    const row = stmt.get(repoName);
    return Number(row?.['repo_id'] ?? 0);
  } finally {
    stmt.free?.();
  }
}

function countPipelineRuns(db: BetterSqlite3MemoryDb): number {
  const result = db.exec(`SELECT COUNT(*) FROM memory_pipeline_runs WHERE scope = 'code_incremental'`);
  return (result[0]?.values[0][0] as number) ?? 0;
}

function getPipelineState(db: BetterSqlite3MemoryDb): { status: string; last_processed_at: string } | null {
  const stmt = db.prepare(
    `SELECT status, last_processed_at FROM memory_pipeline_state WHERE scope = 'code_incremental'`
  );
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

      const state = getPipelineState(memDb);
      expect(state).not.toBeNull();
      expect(state!.status).toBe('idle');
      expect(state!.last_processed_at).toBe(GRAPH_UPDATED_AT);

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

      const first = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/fake/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });
      expect(first.status).toBe('success');

      const second = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/fake/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });
      expect(second.status).toBe('skipped');
      expect(countPipelineRuns(memDb)).toBe(1);
    });
  });

  describe('decision comments ingested from trail.code_decision_comments', () => {
    it('creates a Decision entity for each stored comment', async () => {
      const memDb = makeMemoryDb();
      const trailDb = makeTrailDb();
      insertCodeGraph(trailDb, REPO, GRAPH_UPDATED_AT);
      insertDecisionComment(trailDb, REPO, {
        filePath: 'src/index.ts',
        line: 4,
        text: 'use sync IO for simplicity',
        symbolName: 'myFunc',
      });
      attachTrailDbFromHandle(memDb, trailDb);

      const result = await runCodeIncremental({
        db: memDb,
        repoName: REPO,
        tsconfigPath: '/fake/tsconfig.json',
        gitRoot: '/fake/root',
        logger: silentLogger,
      });

      expect(result.status).toBe('success');
      const decisionRows = memDb.exec(
        `SELECT COUNT(*) FROM memory_entities WHERE type = 'Decision'`
      );
      expect(decisionRows[0]?.values[0][0]).toBe(1);
    });
  });
});
