import * as childProcess from 'child_process';
import { inferIntroducedBy } from '../../../src/ingest/bug-history/inferIntroducedBy';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { entityId } from '../../../src/canonical/entityId';
import { noopLogger } from '../../../src/logger';
import { openMemoryCoreDb } from '../../../src/db/connection';
import initSqlJs from 'sql.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Mock child_process.execFileSync at the module level
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFileSync: jest.fn(),
}));

const mockedExecFileSync = childProcess.execFileSync as jest.MockedFunction<typeof childProcess.execFileSync>;

const DIFF_OUTPUT = `diff --git a/foo.ts b/foo.ts
@@ -5,1 +5,1 @@
-old line
+new line`;

const INTRO_SHA = 'a'.repeat(40);
const FIX_SHA = 'f'.repeat(40);

const BLAME_INTRO = `${INTRO_SHA}\nauthor Test\nauthor-time 1000000\nfilename foo.ts\n\told line`;

function makeTmpPath() {
  return path.join(os.tmpdir(), `iib-test-${process.pid}-${Date.now()}.db`);
}

async function openTestDb() {
  const tmpPath = makeTmpPath();
  process.env.MEMORY_CORE_DB_PATH = tmpPath;
  const { db, close: closeMain } = await openMemoryCoreDb();

  // Create trail DB in memory with session_commits table
  const SQL = await initSqlJs();
  const trailHandle = new SQL.Database();
  trailHandle.run('PRAGMA foreign_keys = ON');
  trailHandle.run(`CREATE TABLE session_commits (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    repo_name TEXT NOT NULL DEFAULT 'repo',
    committed_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
    author TEXT NOT NULL DEFAULT 'test',
    session_id TEXT
  ) STRICT`);

  attachTrailDbFromHandle(db, trailHandle);

  // Insert a Bug entity
  const bugId = entityId('Bug', FIX_SHA);
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Bug', ?, 'test bug', '[]', '[]', '{}',
             '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    [bugId, FIX_SHA]
  );

  return {
    db,
    trailHandle,
    bugId,
    close: () => {
      trailHandle.close();
      closeMain();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

describe('inferIntroducedBy', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset();
  });

  test('single file → most frequent SHA = introduced_commit_sha', async () => {
    const { db, bugId, close } = await openTestDb();

    // diff returns 1 line range (@@ -5,1 ...) → 1 blame call
    const SINGLE_LINE_DIFF = `diff --git a/foo.ts b/foo.ts\n@@ -5,1 +5,1 @@\n-old\n+new`;
    mockedExecFileSync
      .mockReturnValueOnce(SINGLE_LINE_DIFF as any) // git diff
      .mockReturnValueOnce(BLAME_INTRO as any); // git blame (1 call for line 5)

    const result = inferIntroducedBy({
      db,
      bugEntityId: bugId,
      fixCommitSha: FIX_SHA,
      affectedFilePaths: ['src/foo.ts'],
      repoRoot: '/tmp',
      recordedAt: '2026-01-01T00:00:00.000Z',
      valid_from: '2026-01-01T00:00:00.000Z',
      logger: noopLogger,
    });

    expect(result.introduced_commit_sha).toBe(INTRO_SHA);
    expect(result.edges_inserted).toBe(1);

    close();
  }, 30000);

  test('blame returns fixCommitSha → excluded → null', async () => {
    const { db, bugId, close } = await openTestDb();

    // The blame output returns the fix SHA itself
    const BLAME_SAME_AS_FIX = `${FIX_SHA}\nauthor Test\nauthor-time 1000000\nfilename foo.ts\n\told line`;

    mockedExecFileSync
      .mockReturnValueOnce(DIFF_OUTPUT as any)
      .mockReturnValueOnce(BLAME_SAME_AS_FIX as any);

    const result = inferIntroducedBy({
      db,
      bugEntityId: bugId,
      fixCommitSha: FIX_SHA,
      affectedFilePaths: ['src/foo.ts'],
      repoRoot: '/tmp',
      recordedAt: '2026-01-01T00:00:00.000Z',
      valid_from: '2026-01-01T00:00:00.000Z',
      logger: noopLogger,
    });

    // fix commit sha is excluded from shaCount - shaCount ends up empty → null
    expect(result.introduced_commit_sha).toBeNull();
    expect(result.edges_inserted).toBe(0);

    close();
  }, 30000);

  test('candidate is a fix commit → skipped → null', async () => {
    const { db, bugId, trailHandle, close } = await openTestDb();

    // Insert the intro commit as a fix commit in session_commits
    trailHandle.run(
      `INSERT INTO session_commits (commit_hash, commit_message, repo_name) VALUES (?, ?, ?)`,
      [INTRO_SHA, 'fix(web-app): something broken', 'repo']
    );

    mockedExecFileSync
      .mockReturnValueOnce(DIFF_OUTPUT as any)
      .mockReturnValueOnce(BLAME_INTRO as any);

    const result = inferIntroducedBy({
      db,
      bugEntityId: bugId,
      fixCommitSha: FIX_SHA,
      affectedFilePaths: ['src/foo.ts'],
      repoRoot: '/tmp',
      recordedAt: '2026-01-01T00:00:00.000Z',
      valid_from: '2026-01-01T00:00:00.000Z',
      logger: noopLogger,
    });

    expect(result.introduced_commit_sha).toBeNull();
    expect(result.edges_inserted).toBe(0);

    close();
  }, 30000);

  test('all file blame failures → null + edges_inserted=0', async () => {
    const { db, bugId, close } = await openTestDb();

    mockedExecFileSync.mockImplementation(() => {
      throw new Error('git command failed');
    });

    const result = inferIntroducedBy({
      db,
      bugEntityId: bugId,
      fixCommitSha: FIX_SHA,
      affectedFilePaths: ['src/foo.ts', 'src/bar.ts'],
      repoRoot: '/tmp',
      recordedAt: '2026-01-01T00:00:00.000Z',
      valid_from: '2026-01-01T00:00:00.000Z',
      logger: noopLogger,
    });

    expect(result.introduced_commit_sha).toBeNull();
    expect(result.edges_inserted).toBe(0);

    close();
  }, 30000);
});
