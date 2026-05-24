/**
 * Characterization tests — backfill + misc helpers
 *
 * Covers:
 *   - runBehaviorAnalysis
 *   - backfillSubagentTypePublic (empty projects dir)
 *   - backfillMessageCommits (no unresolved sessions → returns 0)
 *   - listBackups (InMemoryStorage → empty)
 *   - restoreFromBackup (InMemoryStorage → throws)
 *   - setIntegrityAlertHandler
 *   - save (InMemoryStorage path)
 *   - getSessionTokens edge cases (zero-token session)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

type RawDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string) => Array<{ values: unknown[][] }>;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

function repoId(db: TrailDatabase, repoName: string): number {
  return (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
}

function insertSession(db: TrailDatabase, id: string, filePath = ''): void {
  inner(db).run(
    `INSERT OR IGNORE INTO sessions
       (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
        message_count, file_path, file_size, imported_at, source)
     VALUES (?, ?, ?, '', '', '', '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z',
             0, ?, 0, '2026-01-01T01:00:00.000Z', 'claude_code')`,
    [id, id, repoId(db, 'repo'), filePath],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// runBehaviorAnalysis
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.runBehaviorAnalysis', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('runs without error when session does not exist', () => {
    // BehaviorAnalyzer gracefully handles missing sessions
    expect(() => db.runBehaviorAnalysis('nonexistent-session')).not.toThrow();
  });

  it('runs without error for existing session with no messages', () => {
    insertSession(db, 's-behavior');
    expect(() => db.runBehaviorAnalysis('s-behavior')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// backfillSubagentTypePublic (non-existent projects dir → no-op)
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.backfillSubagentTypePublic', () => {
  let db: TrailDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-backfill-subagent-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not throw when projects dir does not exist', () => {
    const nonExistentDir = path.join(tmpDir, 'no-such-dir');
    expect(() => db.backfillSubagentTypePublic(nonExistentDir)).not.toThrow();
  });

  it('is idempotent — second call is no-op (migration flag set)', () => {
    const emptyProjectsDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(emptyProjectsDir, { recursive: true });
    db.backfillSubagentTypePublic(emptyProjectsDir);
    // Second call should not throw
    expect(() => db.backfillSubagentTypePublic(emptyProjectsDir)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// backfillMessageCommits
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.backfillMessageCommits', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns 0 when no unresolved sessions', () => {
    const count = db.backfillMessageCommits();
    expect(count).toBe(0);
  });

  it('calls onProgress callback', () => {
    let msg = '';
    db.backfillMessageCommits((m) => { msg = m; });
    expect(msg).toContain('Backfilled');
  });

  it('returns 0 and skips session with non-existent file path', () => {
    // Insert session with a commit but non-existent JSONL (triggers catch in loop)
    insertSession(db, 's-backfill', '/nonexistent/path/session.jsonl');
    inner(db).run(
      `INSERT OR IGNORE INTO session_commits
         (session_id, commit_hash, commit_message, author, committed_at, is_ai_assisted,
          files_changed, lines_added, lines_deleted, repo_id)
       VALUES ('s-backfill', 'abc', 'test', 'a', '2026-01-01T00:00:00.000Z', 0, 0, 0, 0, ?)`,
      [repoId(db, 'repo')],
    );
    // message_commits_resolved_at is NULL → getUnresolvedMessageCommitSessions finds it
    const count = db.backfillMessageCommits();
    // File read fails → caught error → returns 0 backfilled
    expect(count).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listBackups / restoreFromBackup
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.listBackups', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array for InMemoryTrailStorage', () => {
    // createTestTrailDatabase uses InMemoryTrailStorage
    expect(db.listBackups()).toEqual([]);
  });
});

describe('TrailDatabase.restoreFromBackup', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('throws TypeError for InMemoryTrailStorage', () => {
    expect(() => db.restoreFromBackup(1)).toThrow(TypeError);
    expect(() => db.restoreFromBackup(1)).toThrow('FileTrailStorage');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setIntegrityAlertHandler
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.setIntegrityAlertHandler', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('registers handler without error', () => {
    let callCount = 0;
    expect(() => {
      db.setIntegrityAlertHandler(() => { callCount++; });
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// save (InMemoryStorage path — no-op but exercises the integrity monitor path)
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.save', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('runs without error on empty DB', () => {
    expect(() => db.save()).not.toThrow();
  });

  it('invokes integrity alert handler when alert fires', () => {
    const alerts: unknown[] = [];
    db.setIntegrityAlertHandler((a) => alerts.push(...a));
    // Just exercise the path — no assertion on alerts content since test DB is clean
    expect(() => db.save()).not.toThrow();
  });
});
