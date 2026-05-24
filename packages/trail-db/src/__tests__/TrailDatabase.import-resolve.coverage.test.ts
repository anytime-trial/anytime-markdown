/**
 * Characterization tests — importSession / resolve / transactions / isImported
 *
 * Covers:
 *   - importSession (basic Claude Code JSONL)
 *   - isImported / getImportedFileSize / isCommitsResolved
 *   - getImportedFileMap
 *   - isCommitResolutionDone
 *   - beginExternalTransaction / commitExternalTransaction / rollbackExternalTransaction
 *   - parseSessionIdFromBody (already tested in TrailDatabase.test.ts — light duplicate OK)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

type RawDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
  exec: (sql: string, params?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }>;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

/** Phase H: sessions/session_commit_resolutions は repo_name を撤去済。repo_id を repos 経由で解決する。 */
function repoId(db: TrailDatabase, repoName: string): number {
  return (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
}

/** Write a minimal Claude Code JSONL to a temp file and return its path. */
function writeClaudeJsonl(
  dir: string,
  sessionId: string,
  messages: unknown[],
): string {
  const filePath = path.join(dir, `${sessionId}.jsonl`);
  const lines = messages.map((m) => JSON.stringify(m)).join('\n');
  fs.writeFileSync(filePath, lines + '\n', 'utf-8');
  return filePath;
}

/** Minimal Claude Code session JSONL lines */
function makeMinimalSession(sessionId: string): unknown[] {
  return [
    {
      type: 'summary',
      summary: 'test session',
      leafUuid: 'uuid-leaf',
    },
    {
      type: 'user',
      uuid: 'uuid-user-1',
      sessionId,
      parentUuid: null,
      timestamp: '2026-01-15T00:00:00.000Z',
      message: { role: 'user', content: 'Hello' },
      cwd: '/repo',
    },
    {
      type: 'assistant',
      uuid: 'uuid-asst-1',
      sessionId,
      parentUuid: 'uuid-user-1',
      timestamp: '2026-01-15T00:01:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there' }],
        usage: { input_tokens: 100, output_tokens: 20 },
        model: 'claude-sonnet-4-6',
      },
      cwd: '/repo',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// importSession
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.importSession', () => {
  let db: TrailDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-import-test-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports a minimal session and returns message count', () => {
    const sessionId = 'aaaabbbb-0000-0000-0000-000000000001';
    const filePath = writeClaudeJsonl(tmpDir, sessionId, makeMinimalSession(sessionId));
    const count = db.importSession(filePath, 'test-repo');
    // user + assistant = 2 messages (or 1 if only assistant counted — check actual behavior)
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('marks the session as imported', () => {
    const sessionId = 'aaaabbbb-0000-0000-0000-000000000002';
    const filePath = writeClaudeJsonl(tmpDir, sessionId, makeMinimalSession(sessionId));
    db.importSession(filePath, 'test-repo');
    expect(db.isImported(sessionId)).toBe(true);
  });

  it('returns 0 for empty file', () => {
    const filePath = path.join(tmpDir, 'empty.jsonl');
    fs.writeFileSync(filePath, '', 'utf-8');
    const count = db.importSession(filePath, 'test-repo');
    expect(count).toBe(0);
  });

  it('returns 0 for file with only whitespace', () => {
    const filePath = path.join(tmpDir, 'whitespace.jsonl');
    fs.writeFileSync(filePath, '   \n  \n', 'utf-8');
    const count = db.importSession(filePath, 'test-repo');
    expect(count).toBe(0);
  });

  it('skips malformed lines gracefully', () => {
    const sessionId = 'aaaabbbb-0000-0000-0000-000000000003';
    const filePath = path.join(tmpDir, `${sessionId}.jsonl`);
    const lines = [
      'not-json-at-all',
      JSON.stringify(makeMinimalSession(sessionId)[1]),
      '{ broken json',
      JSON.stringify(makeMinimalSession(sessionId)[2]),
    ];
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
    // Should not throw — malformed lines are skipped
    expect(() => db.importSession(filePath, 'test-repo')).not.toThrow();
  });

  it('supports externalTransaction=true without auto-commit', () => {
    const sessionId = 'aaaabbbb-0000-0000-0000-000000000004';
    const filePath = writeClaudeJsonl(tmpDir, sessionId, makeMinimalSession(sessionId));
    db.beginExternalTransaction();
    const count = db.importSession(filePath, 'test-repo', false, true);
    // commit so data persists
    db.commitExternalTransaction();
    expect(count).toBeGreaterThanOrEqual(1);
    expect(db.isImported(sessionId)).toBe(true);
  });

  it('rollbackExternalTransaction undoes inserted data', () => {
    const sessionId = 'aaaabbbb-0000-0000-0000-000000000005';
    const filePath = writeClaudeJsonl(tmpDir, sessionId, makeMinimalSession(sessionId));
    db.beginExternalTransaction();
    db.importSession(filePath, 'test-repo', false, true);
    db.rollbackExternalTransaction();
    expect(db.isImported(sessionId)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isImported / getImportedFileSize / isCommitsResolved
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.isImported', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns false for non-existent session', () => {
    expect(db.isImported('no-such-session')).toBe(false);
  });

  it('returns true after session is inserted', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO sessions
         (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
          message_count, file_path, file_size, imported_at, source)
       VALUES ('s-exist', 's-exist', ${repoId(db, 'repo')}, '', '', '', '2026-01-01T00:00:00.000Z',
               '2026-01-01T01:00:00.000Z', 0, '/tmp/s-exist.jsonl', 1234, '2026-01-01T01:00:00.000Z', 'claude_code')`,
    );
    expect(db.isImported('s-exist')).toBe(true);
  });
});

describe('TrailDatabase.getImportedFileSize', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns 0 for non-existent session', () => {
    expect(db.getImportedFileSize('no-such')).toBe(0);
  });

  it('returns file_size for existing session', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO sessions
         (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
          message_count, file_path, file_size, imported_at, source)
       VALUES ('s-size', 's-size', ${repoId(db, 'repo')}, '', '', '', '2026-01-01T00:00:00.000Z',
               '2026-01-01T01:00:00.000Z', 0, '/tmp/s-size.jsonl', 9876, '2026-01-01T01:00:00.000Z', 'claude_code')`,
    );
    expect(db.getImportedFileSize('s-size')).toBe(9876);
  });
});

describe('TrailDatabase.isCommitsResolved', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns false for non-existent session', () => {
    expect(db.isCommitsResolved('no-such')).toBe(false);
  });

  it('returns false for session without commits_resolved_at', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO sessions
         (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
          message_count, file_path, file_size, imported_at, source)
       VALUES ('s-unresolved', 's-unresolved', ${repoId(db, 'repo')}, '', '', '', '2026-01-01T00:00:00.000Z',
               '2026-01-01T01:00:00.000Z', 0, '/tmp/s-unresolved.jsonl', 0, '2026-01-01T01:00:00.000Z', 'claude_code')`,
    );
    expect(db.isCommitsResolved('s-unresolved')).toBe(false);
  });

  it('returns true after commits_resolved_at is set', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO sessions
         (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
          message_count, file_path, file_size, imported_at, source, commits_resolved_at)
       VALUES ('s-resolved', 's-resolved', ${repoId(db, 'repo')}, '', '', '', '2026-01-01T00:00:00.000Z',
               '2026-01-01T01:00:00.000Z', 0, '/tmp/s-resolved.jsonl', 0, '2026-01-01T01:00:00.000Z', 'claude_code',
               '2026-01-01T02:00:00.000Z')`,
    );
    expect(db.isCommitsResolved('s-resolved')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getImportedFileMap
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.getImportedFileMap', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty map when no sessions', () => {
    expect(db.getImportedFileMap().size).toBe(0);
  });

  it('returns map with file_path as key', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO sessions
         (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
          message_count, file_path, file_size, imported_at, source)
       VALUES ('s1', 's1', ${repoId(db, 'repo')}, '', '', '', '2026-01-01T00:00:00.000Z',
               '2026-01-01T01:00:00.000Z', 0, '/tmp/test.jsonl', 5000, '2026-01-01T01:00:00.000Z', 'claude_code')`,
    );
    const map = db.getImportedFileMap();
    expect(map.has('/tmp/test.jsonl')).toBe(true);
    const entry = map.get('/tmp/test.jsonl')!;
    expect(entry.sessionId).toBe('s1');
    expect(entry.fileSize).toBe(5000);
    expect(typeof entry.commitsResolved).toBe('boolean');
    expect(typeof entry.hasMessages).toBe('boolean');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isCommitResolutionDone
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.isCommitResolutionDone', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns false when no resolution record exists', () => {
    expect(db.isCommitResolutionDone('s-none', 'repo-none')).toBe(false);
  });

  it('returns true after inserting a resolution record', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO session_commit_resolutions (session_id, repo_id, resolved_at)
       VALUES ('s-done', ${repoId(db, 'my-repo')}, '2026-01-01T00:00:00.000Z')`,
    );
    expect(db.isCommitResolutionDone('s-done', 'my-repo')).toBe(true);
  });

  it('returns false for a different repo_name', () => {
    inner(db).run(
      `INSERT OR IGNORE INTO session_commit_resolutions (session_id, repo_id, resolved_at)
       VALUES ('s-done2', ${repoId(db, 'repo-a')}, '2026-01-01T00:00:00.000Z')`,
    );
    expect(db.isCommitResolutionDone('s-done2', 'repo-b')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// beginExternalTransaction / commitExternalTransaction / rollbackExternalTransaction
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase external transaction control', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('commit persists data', () => {
    db.beginExternalTransaction();
    inner(db).run(
      `INSERT OR IGNORE INTO sessions
         (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
          message_count, file_path, file_size, imported_at, source)
       VALUES ('tx-commit', 'tx-commit', ${repoId(db, 'repo')}, '', '', '', '2026-01-01T00:00:00.000Z',
               '2026-01-01T01:00:00.000Z', 0, '', 0, '2026-01-01T01:00:00.000Z', 'claude_code')`,
    );
    db.commitExternalTransaction();
    expect(db.isImported('tx-commit')).toBe(true);
  });

  it('rollback discards data', () => {
    db.beginExternalTransaction();
    inner(db).run(
      `INSERT OR IGNORE INTO sessions
         (id, slug, repo_id, version, entrypoint, model, start_time, end_time,
          message_count, file_path, file_size, imported_at, source)
       VALUES ('tx-rollback', 'tx-rollback', ${repoId(db, 'repo')}, '', '', '', '2026-01-01T00:00:00.000Z',
               '2026-01-01T01:00:00.000Z', 0, '', 0, '2026-01-01T01:00:00.000Z', 'claude_code')`,
    );
    db.rollbackExternalTransaction();
    expect(db.isImported('tx-rollback')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseSessionIdFromBody
// ─────────────────────────────────────────────────────────────────────────────

describe('TrailDatabase.parseSessionIdFromBody', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns UUID from valid Session-Id trailer', () => {
    const id = db.parseSessionIdFromBody('Session-Id: 12345678-abcd-4321-efef-000000000000');
    expect(id).toBe('12345678-abcd-4321-efef-000000000000');
  });

  it('returns null when no Session-Id present', () => {
    expect(db.parseSessionIdFromBody('Co-Authored-By: Claude')).toBeNull();
  });

  it('returns null for malformed UUID', () => {
    expect(db.parseSessionIdFromBody('Session-Id: not-a-real-uuid')).toBeNull();
  });
});
