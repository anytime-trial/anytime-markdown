/**
 * E2E tests for memory-core Phase 2.5: runBugHistoryIncremental.
 *
 * These tests spin up:
 *   - A sql.js trail DB (exported to temp file) with 10 synthetic commits
 *     (6 fix, 4 feat) and commit_files entries
 *   - An in-memory sql.js memory-core DB with all migrations applied
 *   - The full runBugHistoryIncremental pipeline (real git-blame skipped gracefully)
 *
 * Note: runBugHistoryIncremental has no ollama parameter — it never calls the
 * LLM. This is verified structurally by the function signature.
 *
 * Timing requirement: full pipeline < 5000 ms (synthetic data).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { attachTrailDbReadOnly } from '../../src/db/attach';
import { runBugHistoryIncremental } from '../../src/pipeline/runBugHistoryIncremental';
import type { MemoryCoreDb } from '../../src/db/connection';

// ── Constants ─────────────────────────────────────────────────────────────────

const TS_GLOB_MS    = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9].[0-9][0-9][0-9]Z';
const TS_GLOB_NO_MS = '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z';

// Shared between both regression fix commits (drift prep)
const SHARED_FILE = 'packages/web-app/src/shared/utils.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface CommitSeed {
  commitHash: string;
  commitMessage: string;
  committedAt: string;
  sessionId: string;
  filePaths: string[];
}

/**
 * 10 commits: 6 fix (regression×2, spec×2, logic×1, typo×1), 4 feat.
 * The two regression fixes share SHARED_FILE (drift prep).
 */
const COMMITS: CommitSeed[] = [
  {
    commitHash: 'reg001aaaaaaaaaaaa',
    commitMessage: 'fix(web-app/regression): revert incorrect null check in utils',
    committedAt: '2026-03-01T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-1',
    filePaths: [SHARED_FILE, 'packages/web-app/src/components/Header.tsx'],
  },
  {
    commitHash: 'reg002aaaaaaaaaaaa',
    commitMessage: 'fix(web-app/regression): prevent double-render on auth callback',
    committedAt: '2026-03-02T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-1',
    filePaths: [SHARED_FILE, 'packages/web-app/src/pages/index.tsx'],
  },
  {
    commitHash: 'spec001aaaaaaaaaaa',
    commitMessage: 'fix(web-app/spec): align modal title with design spec',
    committedAt: '2026-03-03T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-2',
    filePaths: ['packages/web-app/src/components/Modal.tsx'],
  },
  {
    commitHash: 'spec002aaaaaaaaaaa',
    commitMessage: 'fix(web-app/spec): validate required fields per API spec',
    committedAt: '2026-03-04T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-2',
    filePaths: [
      'packages/web-app/src/api/validators.ts',
      'packages/web-app/src/api/handlers.ts',
    ],
  },
  {
    commitHash: 'log001aaaaaaaaaaaa',
    commitMessage: 'fix(trail-viewer/logic): correct token count aggregation in summary',
    committedAt: '2026-03-05T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-3',
    filePaths: ['packages/trail-viewer/src/analytics/tokenSummary.ts'],
  },
  {
    commitHash: 'typo001aaaaaaaaaaa',
    commitMessage: 'fix(typo): correct misspelling in README',
    committedAt: '2026-03-06T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-3',
    filePaths: ['README.md'],
  },
  // feat commits — must be ignored by the pipeline
  {
    commitHash: 'feat001aaaaaaaaaaa',
    commitMessage: 'feat(web-app): add user dashboard',
    committedAt: '2026-03-07T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-4',
    filePaths: ['packages/web-app/src/pages/dashboard.tsx'],
  },
  {
    commitHash: 'feat002aaaaaaaaaaa',
    commitMessage: 'feat(trail-viewer): add export feature',
    committedAt: '2026-03-08T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-4',
    filePaths: ['packages/trail-viewer/src/export.ts'],
  },
  {
    commitHash: 'feat003aaaaaaaaaaa',
    commitMessage: 'feat(memory-core): implement embeddings',
    committedAt: '2026-03-09T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-5',
    filePaths: ['packages/memory-core/src/embeddings.ts'],
  },
  {
    commitHash: 'feat004aaaaaaaaaaa',
    commitMessage: 'feat: initial setup',
    committedAt: '2026-03-10T10:00:00.000Z',
    sessionId: 'sess-bug-e2e-5',
    filePaths: ['packages/memory-core/src/index.ts'],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates a synthetic trail DB with:
 *   - sessions table (FK target for session_commits)
 *   - session_commits table (queried by runBugHistoryIncremental)
 *   - commit_files table (queried by linkAffectedFiles)
 */
function makeTrailDb(SQL: SqlJsStatic, repoName: string, commits: CommitSeed[]): Database {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL DEFAULT '',
    repo_name TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    entrypoint TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    start_time TEXT CHECK (start_time IS NULL OR start_time = '' OR
      start_time GLOB '${TS_GLOB_MS}' OR start_time GLOB '${TS_GLOB_NO_MS}'),
    end_time TEXT CHECK (end_time IS NULL OR end_time = '' OR
      end_time GLOB '${TS_GLOB_MS}' OR end_time GLOB '${TS_GLOB_NO_MS}'),
    message_count INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL DEFAULT '',
    file_size INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT CHECK (imported_at IS NULL OR imported_at = '' OR
      imported_at GLOB '${TS_GLOB_MS}' OR imported_at GLOB '${TS_GLOB_NO_MS}'),
    peak_context_tokens INTEGER
  ) STRICT`);

  db.run(`CREATE TABLE session_commits (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    committed_at TEXT CHECK (committed_at IS NULL OR committed_at = '' OR
      committed_at GLOB '${TS_GLOB_MS}' OR committed_at GLOB '${TS_GLOB_NO_MS}'),
    is_ai_assisted INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_assisted IN (0, 1)),
    files_changed INTEGER NOT NULL DEFAULT 0,
    lines_added INTEGER NOT NULL DEFAULT 0,
    lines_deleted INTEGER NOT NULL DEFAULT 0,
    repo_name TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (session_id, commit_hash)
  ) STRICT`);

  db.run(`CREATE TABLE commit_files (
    commit_hash TEXT NOT NULL,
    repo_name TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL DEFAULT 'M',
    PRIMARY KEY (commit_hash, file_path)
  ) STRICT`);

  // Insert unique sessions
  const sessionIds = [...new Set(commits.map((c) => c.sessionId))];
  for (const sid of sessionIds) {
    db.run(`INSERT INTO sessions (id, repo_name) VALUES (?, ?)`, [sid, repoName]);
  }

  for (const commit of commits) {
    db.run(
      `INSERT INTO session_commits
         (session_id, commit_hash, commit_message, committed_at, repo_name)
       VALUES (?, ?, ?, ?, ?)`,
      [commit.sessionId, commit.commitHash, commit.commitMessage, commit.committedAt, repoName]
    );
    for (const fp of commit.filePaths) {
      db.run(
        `INSERT INTO commit_files (commit_hash, repo_name, file_path) VALUES (?, ?, ?)`,
        [commit.commitHash, repoName, fp]
      );
    }
  }

  return db;
}

/** Opens an in-memory memory-core DB with all migrations applied. */
async function makeMemoryDb(): Promise<MemoryCoreDb> {
  const SQL = await initSqlJs();
  const rawDb = new SQL.Database();
  rawDb.run('PRAGMA foreign_keys = ON');

  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(rawDb);

  return {
    db: rawDb,
    save(): void {},
    close(): void {
      rawDb.close();
    },
  };
}

/** Exports a sql.js Database to a temp file and returns the file path. */
function exportToTempFile(db: Database, tmpDir: string, filename: string): string {
  const data = db.export();
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, data);
  return filePath;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('E2E Phase 2.5: runBugHistoryIncremental', () => {
  let SQL: SqlJsStatic;
  let tmpDir: string;

  beforeAll(async () => {
    SQL = await initSqlJs();
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `memory-bug-e2e-${process.pid}-`)
    );
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      // best effort cleanup
    }
  });

  // ── BP1: full pipeline run ─────────────────────────────────────────────────
  /**
   * Scenario BP1 – Full pipeline with synthetic trail DB exported to temp file.
   *
   * Verifies:
   *   - status='success', bugs_inserted=6, items_processed=6
   *   - memory_entities has 6 Bug rows + 6 Commit rows
   *   - memory_bug_fixes has 6 rows
   *   - memory_edges: 6 'fixes' edges (Commit→Bug) + >=6 'affects' edges (Bug→File)
   *   - feat commits do not produce Bug entities
   *   - pipeline_state advanced past last fix commit
   *   - duration_ms < 5000
   *
   * inferIntroducedBy fails gracefully because tmpDir has no real git history.
   */
  test(
    'BP1: 6 fix commits → bugs_inserted=6, edges populated, duration<5s',
    async () => {
      const repoName = 'e2e-bug-repo';

      const trailDb = makeTrailDb(SQL, repoName, COMMITS);
      const trailDbPath = exportToTempFile(trailDb, tmpDir, 'bug-e2e-bp1.db');
      trailDb.close();

      const memDb = await makeMemoryDb();
      const handle = await attachTrailDbReadOnly(memDb.db, trailDbPath);

      try {
        const result = await runBugHistoryIncremental({
          db: memDb.db,
          repoName,
          repoRoot: tmpDir, // no real git — inferIntroducedBy fails gracefully
          logger: { info: () => {}, error: () => {} },
        });

        expect(result.status).toBe('success');
        expect(result.bugs_inserted).toBe(6);
        expect(result.items_processed).toBe(6);
        expect(result.duration_ms).toBeLessThan(5000);

        // Bug entities
        const bugCount = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_entities WHERE type = 'Bug'`
        );
        expect(bugCount[0]?.values[0][0] as number).toBe(6);

        // Commit entities (one per fix commit)
        const commitCount = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_entities WHERE type = 'Commit'`
        );
        expect(commitCount[0]?.values[0][0] as number).toBe(6);

        // memory_bug_fixes
        const fixCount = memDb.db.exec(`SELECT COUNT(*) FROM memory_bug_fixes`);
        expect(fixCount[0]?.values[0][0] as number).toBe(6);

        // fixes edges: Commit → fixes → Bug
        const fixesEdges = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_edges WHERE predicate = 'fixes'`
        );
        expect(fixesEdges[0]?.values[0][0] as number).toBe(6);

        // affects edges: Bug → affects → File (>=6, at least one per fix commit)
        const affectsEdges = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_edges WHERE predicate = 'affects'`
        );
        expect(affectsEdges[0]?.values[0][0] as number).toBeGreaterThanOrEqual(6);

        // feat commits must NOT produce Bug entities
        const featBugCount = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_entities me
           JOIN memory_bug_fixes mbf ON mbf.bug_entity_id = me.id
           WHERE me.type = 'Bug' AND mbf.commit_sha LIKE 'feat%'`
        );
        expect(featBugCount[0]?.values[0][0] as number).toBe(0);

        // pipeline_state advanced past last fix commit (2026-03-06)
        const stateRows = memDb.db.exec(
          `SELECT status, last_processed_at
           FROM memory_pipeline_state WHERE scope = 'bug_history_incremental'`
        );
        expect(stateRows[0]?.values?.length).toBe(1);
        const [pipeStatus, lastAt] = stateRows[0].values[0] as [string, string];
        expect(pipeStatus).toBe('idle');
        expect(lastAt >= '2026-03-06T10:00:00.000Z').toBe(true);
      } finally {
        handle.trailHandle.close();
        memDb.close();
      }
    },
    10000
  );

  // ── BP2: idempotent second run ─────────────────────────────────────────────
  /**
   * Scenario BP2 – A second run after BP1 must be a no-op.
   *
   * Verifies:
   *   - Second run: status='success', bugs_inserted=0, items_processed=0
   *   - Bug count, edge counts unchanged after second run
   */
  test(
    'BP2: second run is idempotent — bugs_inserted=0, counts unchanged',
    async () => {
      const repoName = 'e2e-bug-idempotent';

      const trailDb = makeTrailDb(SQL, repoName, COMMITS);
      const trailDbPath = exportToTempFile(trailDb, tmpDir, 'bug-e2e-bp2.db');
      trailDb.close();

      const memDb = await makeMemoryDb();
      const handle = await attachTrailDbReadOnly(memDb.db, trailDbPath);

      try {
        const r1 = await runBugHistoryIncremental({
          db: memDb.db,
          repoName,
          repoRoot: tmpDir,
          logger: { info: () => {}, error: () => {} },
        });
        expect(r1.bugs_inserted).toBe(6);

        // second run
        const r2 = await runBugHistoryIncremental({
          db: memDb.db,
          repoName,
          repoRoot: tmpDir,
          logger: { info: () => {}, error: () => {} },
        });
        expect(r2.status).toBe('success');
        expect(r2.bugs_inserted).toBe(0);
        expect(r2.items_processed).toBe(0);

        // counts unchanged
        const bugCount = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_entities WHERE type = 'Bug'`
        );
        expect(bugCount[0]?.values[0][0] as number).toBe(6);

        const fixesEdges = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_edges WHERE predicate = 'fixes'`
        );
        expect(fixesEdges[0]?.values[0][0] as number).toBe(6);
      } finally {
        handle.trailHandle.close();
        memDb.close();
      }
    },
    15000
  );

  // ── BP3: acceptance — regression bugs and shared file ─────────────────────
  /**
   * Scenario BP3 – §acceptance: web-app regression Bug entities exist.
   *
   * Since searchMemory requires Ollama embeddings (not available here),
   * we verify directly in the DB:
   *   - 2 Bug entities with category='regression' and package='web-app'
   *   - The shared file (SHARED_FILE) has >=2 'affects' edges, one per regression bug
   *   - Commit entities for fix commits exist
   */
  test(
    'BP3: acceptance — web-app regression Bug entities exist and share a file path',
    async () => {
      const repoName = 'e2e-bug-accept';

      const trailDb = makeTrailDb(SQL, repoName, COMMITS);
      const trailDbPath = exportToTempFile(trailDb, tmpDir, 'bug-e2e-bp3.db');
      trailDb.close();

      const memDb = await makeMemoryDb();
      const handle = await attachTrailDbReadOnly(memDb.db, trailDbPath);

      try {
        await runBugHistoryIncremental({
          db: memDb.db,
          repoName,
          repoRoot: tmpDir,
          logger: { info: () => {}, error: () => {} },
        });

        // 2 regression Bug entities for web-app
        const regressionRows = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_entities
           WHERE type = 'Bug'
             AND json_extract(attributes_json, '$.category') = 'regression'
             AND json_extract(attributes_json, '$.package') = 'web-app'`
        );
        expect(regressionRows[0]?.values[0][0] as number).toBe(2);

        // Shared file has >=2 affects edges (one per regression bug)
        const sharedFileRows = memDb.db.exec(
          `SELECT id FROM memory_entities
           WHERE type = 'File' AND canonical_name LIKE '%shared/utils%'`
        );
        expect(sharedFileRows[0]?.values?.length).toBeGreaterThanOrEqual(1);

        const sharedFileId = sharedFileRows[0].values[0][0] as string;
        const edgeStmt = memDb.db.prepare(
          `SELECT COUNT(*) FROM memory_edges
           WHERE object_entity_id = ? AND predicate = 'affects'`
        );
        edgeStmt.bind([sharedFileId]);
        edgeStmt.step();
        const edgeCount = edgeStmt.getAsObject()['COUNT(*)'] as number;
        edgeStmt.free();
        expect(edgeCount).toBeGreaterThanOrEqual(2);

        // Commit entities exist (6 fix commits → 6 Commit entities)
        const commitCount = memDb.db.exec(
          `SELECT COUNT(*) FROM memory_entities WHERE type = 'Commit'`
        );
        expect(commitCount[0]?.values[0][0] as number).toBe(6);
      } finally {
        handle.trailHandle.close();
        memDb.close();
      }
    },
    10000
  );
});
