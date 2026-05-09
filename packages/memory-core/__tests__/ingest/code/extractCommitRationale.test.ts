import { createHash } from 'crypto';
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { runMigrations } from '../../../src/db/migrations/runner';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { extractCommitRationale } from '../../../src/ingest/code/extractCommitRationale';
import { entityId } from '../../../src/canonical/entityId';
import type { MemoryLogger } from '../../../src/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

const RECORDED_AT = '2026-01-01T00:00:00.000Z';
const REPO = 'test-repo';

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

async function makeMemoryDb(): Promise<Database> {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTrailDb(): Database {
  const trailDb = new SQL.Database();
  // Minimal schema matching trail.session_commits
  trailDb.run(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL DEFAULT ''
    ) STRICT
  `);
  trailDb.run(`
    CREATE TABLE session_commits (
      session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      commit_hash  TEXT NOT NULL,
      commit_message TEXT NOT NULL DEFAULT '',
      committed_at TEXT,
      repo_name    TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (session_id, commit_hash)
    ) STRICT
  `);
  return trailDb;
}

function insertSession(trailDb: Database, sessionId: string): void {
  trailDb.run(
    `INSERT INTO sessions (id, started_at) VALUES (?, ?)`,
    [sessionId, RECORDED_AT]
  );
}

function insertCommit(
  trailDb: Database,
  opts: {
    sessionId: string;
    commitHash: string;
    commitMessage: string;
    committedAt?: string;
    repoName?: string;
  }
): void {
  trailDb.run(
    `INSERT INTO session_commits (session_id, commit_hash, commit_message, committed_at, repo_name)
     VALUES (?, ?, ?, ?, ?)`,
    [
      opts.sessionId,
      opts.commitHash,
      opts.commitMessage,
      opts.committedAt ?? RECORDED_AT,
      opts.repoName ?? REPO,
    ]
  );
}

function countEntities(db: Database, type: string): number {
  const stmt = db.prepare(`SELECT COUNT(*) FROM memory_entities WHERE type = ?`);
  stmt.bind([type]);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return (row['COUNT(*)'] as number) ?? 0;
}

function countEdges(db: Database, predicate?: string): number {
  if (predicate) {
    const stmt = db.prepare(`SELECT COUNT(*) FROM memory_edges WHERE predicate = ?`);
    stmt.bind([predicate]);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return (row['COUNT(*)'] as number) ?? 0;
  }
  const result = db.exec(`SELECT COUNT(*) FROM memory_edges`);
  return (result[0]?.values[0][0] as number) ?? 0;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('extractCommitRationale', () => {
  // ECR-1: Rationale: section in commit body → 1 Decision + 1 edge
  test('ECR-1: Rationale: section → 1 Decision + 1 Commit + 1 rationale_for edge', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'abc123def456',
      commitMessage:
        'feat(foo): add bar\n\nRationale: 既存 baz 関数が肥大化したため分離する。',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.commits_processed).toBe(1);
    expect(stats.decisions_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    expect(countEntities(memDb, 'Decision')).toBe(1);
    expect(countEntities(memDb, 'Commit')).toBe(1);
    expect(countEdges(memDb, 'rationale_for')).toBe(1);

    // Verify Decision summary contains the rationale text
    const rows = memDb.exec(`SELECT summary FROM memory_entities WHERE type = 'Decision'`);
    const summary = rows[0]?.values[0][0] as string;
    expect(summary).toContain('既存 baz 関数が肥大化したため分離する');

    trailDb.close();
    memDb.close();
  });

  // ECR-2: Reason: pattern
  test('ECR-2: Reason: pattern → Decision extracted', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'aaa111bbb222',
      commitMessage:
        'refactor(api): cleanup\n\nReason: Legacy adapter was causing circular imports.',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    const rows = memDb.exec(`SELECT summary FROM memory_entities WHERE type = 'Decision'`);
    const summary = rows[0]?.values[0][0] as string;
    expect(summary).toContain('Legacy adapter was causing circular imports');

    trailDb.close();
    memDb.close();
  });

  // ECR-3: 理由: Japanese pattern
  test('ECR-3: 理由: pattern → Decision extracted', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'ccc333ddd444',
      commitMessage: 'fix(ui): button style\n\n理由: デザインシステムに合わせるため統一した。',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    const rows = memDb.exec(`SELECT summary FROM memory_entities WHERE type = 'Decision'`);
    const summary = rows[0]?.values[0][0] as string;
    expect(summary).toContain('デザインシステムに合わせるため統一した');

    trailDb.close();
    memDb.close();
  });

  // ECR-4: full-width colon 全角コロン
  test('ECR-4: full-width colon 「Rationale：」 → Decision extracted', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'eee555fff666',
      commitMessage: 'docs: update\n\nRationale： 全角コロンにも対応する必要がある。',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.decisions_inserted).toBe(1);

    trailDb.close();
    memDb.close();
  });

  // ECR-5: subject-only Rationale: → NOT extracted (body-only rule)
  test('ECR-5: subject line with Rationale: only → no Decision (body-only rule)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'ggg777hhh888',
      commitMessage: 'Rationale: should not be extracted because it is on subject line',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.commits_processed).toBe(1);
    expect(stats.decisions_inserted).toBe(0);
    expect(stats.edges_inserted).toBe(0);
    expect(countEntities(memDb, 'Decision')).toBe(0);

    trailDb.close();
    memDb.close();
  });

  // ECR-6: commit with no Rationale section → skipped
  test('ECR-6: commit without Rationale section → skipped', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'iii999jjjaaa',
      commitMessage:
        'feat: add feature\n\nThis is a normal commit body without rationale section.',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.commits_processed).toBe(1);
    expect(stats.decisions_inserted).toBe(0);
    expect(stats.edges_inserted).toBe(0);

    trailDb.close();
    memDb.close();
  });

  // ECR-7: idempotency — same commit processed twice → no-op on second run
  test('ECR-7: processing same commit twice → decisions/edges remain at 1 (idempotent)', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'bbb222ccc333',
      commitMessage:
        'feat: stable\n\nRationale: deterministic id test for idempotency.',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats1 = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const stats2 = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats1.decisions_inserted).toBe(1);
    expect(stats1.edges_inserted).toBe(1);

    // Second run: decision already exists → INSERT OR IGNORE → 0 new
    expect(stats2.decisions_inserted).toBe(0);
    expect(stats2.edges_inserted).toBe(0);

    // DB totals unchanged
    expect(countEntities(memDb, 'Decision')).toBe(1);
    expect(countEntities(memDb, 'Commit')).toBe(1);
    expect(countEdges(memDb, 'rationale_for')).toBe(1);

    trailDb.close();
    memDb.close();
  });

  // ECR-8: sinceCommittedAt cursor filters older commits
  test('ECR-8: sinceCommittedAt cursor filters commits on or before the cutoff', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');

    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'old111111111',
      commitMessage: 'chore: old\n\nRationale: old commit before cursor.',
      committedAt: '2025-01-01T00:00:00.000Z',
    });
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'new222222222',
      commitMessage: 'chore: new\n\nRationale: new commit after cursor.',
      committedAt: '2026-06-01T00:00:00.000Z',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: '2026-01-01T00:00:00.000Z',
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    // Only the new commit (2026-06-01) should be processed
    expect(stats.commits_processed).toBe(1);
    expect(stats.decisions_inserted).toBe(1);

    const rows = memDb.exec(`SELECT summary FROM memory_entities WHERE type = 'Decision'`);
    const summary = rows[0]?.values[0][0] as string;
    expect(summary).toContain('new commit after cursor');

    trailDb.close();
    memDb.close();
  });

  // ECR-9: multiple commits → multiple Decisions
  test('ECR-9: 3 commits with Rationale sections → 3 Decisions + 3 edges', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');

    for (let i = 1; i <= 3; i++) {
      insertCommit(trailDb, {
        sessionId: 'session-1',
        commitHash: `commit${i.toString().padStart(10, '0')}`,
        commitMessage: `feat: change ${i}\n\nRationale: reason ${i} for the change.`,
      });
    }

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.commits_processed).toBe(3);
    expect(stats.decisions_inserted).toBe(3);
    expect(stats.edges_inserted).toBe(3);
    expect(countEntities(memDb, 'Decision')).toBe(3);
    expect(countEntities(memDb, 'Commit')).toBe(3);
    expect(countEdges(memDb, 'rationale_for')).toBe(3);

    trailDb.close();
    memDb.close();
  });

  // ECR-10: Decision entity ID is deterministic
  test('ECR-10: Decision entity ID is deterministic from commit_hash', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    const commitHash = 'deterministic0';
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash,
      commitMessage: 'feat: stable\n\nRationale: testing deterministic id.',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    // Expected canonical_name = sha1("commit:<repo>:<hash>:rationale").slice(0,16)
    const expectedCanonName = createHash('sha1')
      .update(`commit:${REPO}:${commitHash}:rationale`)
      .digest('hex')
      .slice(0, 16);
    const expectedDecisionId = entityId('Decision', expectedCanonName);

    const stmt = memDb.prepare(
      `SELECT id, canonical_name FROM memory_entities WHERE type = 'Decision'`
    );
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();

    expect(row['id']).toBe(expectedDecisionId);
    expect(row['canonical_name']).toBe(expectedCanonName);

    trailDb.close();
    memDb.close();
  });

  // ECR-11: edge metadata is correct
  test('ECR-11: edge has source_type=code, source_ref=session_commits#<hash>, confidence_label=EXTRACTED', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    const commitHash = 'edge0meta0000';
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash,
      commitMessage: 'feat: edge test\n\nRationale: testing edge metadata.',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const edgeRows = memDb.exec(
      `SELECT source_type, source_ref, confidence_label, confidence, predicate
         FROM memory_edges WHERE predicate = 'rationale_for'`
    );
    expect(edgeRows[0]?.values).toHaveLength(1);
    const [sourceType, sourceRef, confidenceLabel, confidence, predicate] =
      edgeRows[0].values[0];

    expect(sourceType).toBe('code');
    expect(sourceRef).toBe(`session_commits#${commitHash}`);
    expect(confidenceLabel).toBe('EXTRACTED');
    expect(confidence).toBe(1.0);
    expect(predicate).toBe('rationale_for');

    trailDb.close();
    memDb.close();
  });

  // ECR-12: edge direction is Decision → rationale_for → Commit
  test('ECR-12: edge subject is Decision, object is Commit', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'direction00000',
      commitMessage: 'feat: dir test\n\nRationale: edge direction test.',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const rows = memDb.exec(`
      SELECT me_subj.type AS subj_type, me_obj.type AS obj_type
      FROM memory_edges e
      JOIN memory_entities me_subj ON me_subj.id = e.subject_entity_id
      JOIN memory_entities me_obj  ON me_obj.id  = e.object_entity_id
      WHERE e.predicate = 'rationale_for'
    `);
    expect(rows[0]?.values).toHaveLength(1);
    const [subjType, objType] = rows[0].values[0];
    expect(subjType).toBe('Decision');
    expect(objType).toBe('Commit');

    trailDb.close();
    memDb.close();
  });

  // ECR-13: write to trail.* is blocked by readonly guard
  test('ECR-13: guard blocks write to trail.session_commits', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();

    attachTrailDbFromHandle(memDb, trailDb);

    expect(() => {
      memDb.run(`UPDATE trail.session_commits SET commit_message = 'x' WHERE 1=0`);
    }).toThrow(/Write to trail\.\* is forbidden/);

    trailDb.close();
    memDb.close();
  });

  // ECR-14: sinceCommittedAt null processes all commits
  test('ECR-14: sinceCommittedAt=null processes all commits regardless of date', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');

    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'very0old00000',
      commitMessage: 'chore: ancient\n\nRationale: very old commit.',
      committedAt: '2020-01-01T00:00:00.000Z',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    expect(stats.commits_processed).toBe(1);
    expect(stats.decisions_inserted).toBe(1);

    trailDb.close();
    memDb.close();
  });

  // ECR-16: multi-line rationale body is captured in full
  test('ECR-16: multi-line rationale body captured without truncation', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    insertSession(trailDb, 'session-1');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'multiline00000',
      commitMessage:
        'feat: X\n\nRationale: line1\nline2 continued\n\nOther: something else',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    const rows = memDb.exec(`SELECT summary FROM memory_entities WHERE type = 'Decision'`);
    const summary = rows[0]?.values[0][0] as string;
    expect(summary).toContain('line1');
    expect(summary).toContain('line2 continued');

    trailDb.close();
    memDb.close();
  });

  // ECR-15: same commit_hash in multiple sessions → deduplicated by GROUP BY
  test('ECR-15: same commit_hash across multiple sessions → processed once', async () => {
    const memDb = await makeMemoryDb();
    const trailDb = makeTrailDb();
    // Same commit hash appears in two different sessions (common in trail.db)
    insertSession(trailDb, 'session-1');
    insertSession(trailDb, 'session-2');
    insertCommit(trailDb, {
      sessionId: 'session-1',
      commitHash: 'shared0hash000',
      commitMessage: 'feat: shared\n\nRationale: same commit in multiple sessions.',
    });
    insertCommit(trailDb, {
      sessionId: 'session-2',
      commitHash: 'shared0hash000',
      commitMessage: 'feat: shared\n\nRationale: same commit in multiple sessions.',
    });

    attachTrailDbFromHandle(memDb, trailDb);

    const stats = extractCommitRationale({
      db: memDb,
      repoName: REPO,
      sinceCommittedAt: null,
      recordedAt: RECORDED_AT,
      logger: silentLogger,
    });

    // GROUP BY commit_hash → only 1 commit processed, 1 decision
    expect(stats.commits_processed).toBe(1);
    expect(stats.decisions_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);

    trailDb.close();
    memDb.close();
  });
});
