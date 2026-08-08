import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runMigrations } from '../../src/db/migrations/runner';
import { runReviewBackfill } from '../../src/pipeline/runReviewBackfill';
import { entityId } from '../../src/canonical/entityId';

const AT = '2026-03-02T00:00:00.000Z';
const NOW = '2026-03-03T00:00:00.000Z';

function makeMainDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeTrailDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run(`
    CREATE TABLE messages (
      uuid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      text_content TEXT,
      tool_calls TEXT,
      subagent_type TEXT,
      skill TEXT,
      is_sidechain INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

function insertMsg(
  trailDb: BetterSqlite3MemoryDb,
  opts: { uuid: string; session: string; ts: string; text: string; subagent?: string; skill?: string },
): void {
  trailDb.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, text_content, subagent_type, skill)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?)`,
    [opts.uuid, opts.session, opts.ts, opts.text, opts.subagent ?? null, opts.skill ?? null],
  );
}

/** 修正前の取込が作っていた行（本文列が空）を再現する */
function insertLegacyReview(
  db: BetterSqlite3MemoryDb,
  sourceRef: string,
  opts: { withFinding?: boolean } = {},
): string {
  const reviewId = entityId('Review', sourceRef);
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Review', ?, 'Session review', ?, ?, ?)`,
    [reviewId, sourceRef, AT, AT, AT],
  );
  db.run(
    `INSERT INTO memory_reviews
       (id, source_kind, source_ref, source_hash, review_entity_id, target_kind, target_refs_json,
        title, reviewer, severity_overall, summary, body_excerpt, reviewed_at, recorded_at)
     VALUES (?, 'session', ?, '', ?, 'code', '[]', 'Session review', 'code-reviewer', 'info', '', '', ?, ?)`,
    [reviewId, sourceRef, reviewId, AT, AT],
  );
  if (opts.withFinding) {
    const findingEntity = entityId('ReviewFinding', `${reviewId}:0`);
    db.run(
      `INSERT INTO memory_entities
         (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'ReviewFinding', ?, 'finding', ?, ?, ?)`,
      [findingEntity, `${reviewId}:0`, AT, AT, AT],
    );
    db.run(
      `INSERT INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index, category, severity,
          finding_text, suggestion_text, addressed_commit_sha, recorded_at)
       VALUES (?, ?, ?, 0, 'logic', 'error', '既知の指摘', '直す', 'abc123', ?)`,
      [entityId('finding_row', `${reviewId}:0`), reviewId, findingEntity, AT],
    );
  }
  return reviewId;
}

describe('runReviewBackfill', () => {
  test('カーソルより古い行の空の本文列を埋める', () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();
    insertMsg(trailDb, {
      uuid: 'msg-1',
      session: 'sess-old',
      ts: AT,
      text: '### 1. こわれている\n\n**問題:** 落ちる\n**提案:** 直す',
      subagent: 'code-reviewer',
    });
    attachTrailDbFromHandle(mainDb, trailDb);
    const reviewId = insertLegacyReview(mainDb, 'sess-old#msg-1', { withFinding: true });

    const result = runReviewBackfill({ db: mainDb, recordedAt: NOW });

    expect(result.status).toBe('success');
    expect(result.bodies_filled).toBe(1);
    const row = mainDb.prepare('SELECT summary, body_excerpt FROM memory_reviews WHERE id = ?').get(reviewId);
    expect(String(row?.['body_excerpt'])).toContain('こわれている');
    expect(String(row?.['summary'])).toMatch(/^指摘 1 件/);

    mainDb.close();
    trailDb.close();
  });

  test('本文も指摘も無い空殻を削除し、Review entity を無効化する', () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();
    // スキル起動だけの痕跡（本文ゼロ）
    insertMsg(trailDb, {
      uuid: 'skill-1',
      session: 'sess-shell',
      ts: AT,
      text: '',
      skill: 'superpowers:requesting-code-review',
    });
    attachTrailDbFromHandle(mainDb, trailDb);
    const shellId = insertLegacyReview(mainDb, 'sess-shell#skill-1');

    const result = runReviewBackfill({ db: mainDb, recordedAt: NOW });

    expect(result.shells_removed).toBe(1);
    expect(result.shell_entities_invalidated).toBe(1);
    expect(mainDb.prepare('SELECT COUNT(*) n FROM memory_reviews').get()?.['n']).toBe(0);
    expect(mainDb.prepare('SELECT valid_until FROM memory_entities WHERE id = ?').get(shellId)?.['valid_until']).toBe(NOW);

    mainDb.close();
    trailDb.close();
  });

  test('指摘を持つ行は本文が空でも削除しない（対処の記録を失わない）', () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();
    attachTrailDbFromHandle(mainDb, trailDb);
    // trail 側に対応メッセージが無い（＝本文を復元できない）が、指摘は残っている
    const reviewId = insertLegacyReview(mainDb, 'sess-gone#msg-x', { withFinding: true });

    const result = runReviewBackfill({ db: mainDb, recordedAt: NOW });

    expect(result.shells_removed).toBe(0);
    expect(mainDb.prepare('SELECT COUNT(*) n FROM memory_reviews WHERE id = ?').get(reviewId)?.['n']).toBe(1);
    expect(
      mainDb.prepare('SELECT addressed_commit_sha FROM memory_review_findings WHERE review_id = ?').get(reviewId)?.[
        'addressed_commit_sha'
      ],
    ).toBe('abc123');

    mainDb.close();
    trailDb.close();
  });

  test('dryRun では 1 行も書き換えない', () => {
    const mainDb = makeMainDb();
    const trailDb = makeTrailDb();
    insertMsg(trailDb, { uuid: 'msg-1', session: 'sess-dry', ts: AT, text: 'レビュー本文', subagent: 'code-reviewer' });
    insertMsg(trailDb, { uuid: 'skill-1', session: 'sess-shell', ts: AT, text: '', skill: 'security-review' });
    attachTrailDbFromHandle(mainDb, trailDb);
    const filled = insertLegacyReview(mainDb, 'sess-dry#msg-1');
    insertLegacyReview(mainDb, 'sess-shell#skill-1');

    const result = runReviewBackfill({ db: mainDb, recordedAt: NOW, dryRun: true });

    expect(result.bodies_filled).toBe(1);
    expect(result.shells_removed).toBe(2); // 埋める前の状態で数えるので両方が空殻候補
    expect(mainDb.prepare('SELECT body_excerpt FROM memory_reviews WHERE id = ?').get(filled)?.['body_excerpt']).toBe('');
    expect(mainDb.prepare('SELECT COUNT(*) n FROM memory_reviews').get()?.['n']).toBe(2);

    mainDb.close();
    trailDb.close();
  });
});
