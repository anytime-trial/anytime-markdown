import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { runReviewFindingExtraction } from '../../src/pipeline/runReviewFindingExtraction';
import { entityId } from '../../src/canonical/entityId';
import type { OllamaClient } from '@anytime-markdown/agent-core';

const AT = '2026-03-02T00:00:00.000Z';
const NOW = '2026-03-03T00:00:00.000Z';

const BODY = [
  '## 総合評価',
  '',
  '全体として妥当。',
  '',
  '## 良い点',
  '',
  'テストが実挙動を検証している。',
  '',
  '### 1. busy_timeout が無い',
  '',
  'openDocDb は journal_mode と foreign_keys しか設定しておらず、daemon との同時書き込みで SQLITE_BUSY になる。',
  '対象は packages/doc-core/src/db/open.ts である。',
].join('\n');

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function insertReview(db: BetterSqlite3MemoryDb, id: string, bodyExcerpt: string): string {
  const reviewId = entityId('Review', id);
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Review', ?, 'Session review', ?, ?, ?)`,
    [reviewId, id, AT, AT, AT],
  );
  db.run(
    `INSERT INTO memory_reviews
       (id, source_kind, source_ref, source_hash, review_entity_id, target_kind, target_refs_json,
        title, reviewer, severity_overall, summary, body_excerpt, reviewed_at, recorded_at)
     VALUES (?, 'session', ?, '', ?, 'code', '[]', 'Session review', 'code-reviewer', 'info', '', ?, ?, ?)`,
    [reviewId, id, reviewId, bodyExcerpt, AT, AT],
  );
  return reviewId;
}

function makeOllama(response: unknown): OllamaClient {
  return {
    generate: async () => ({ response: typeof response === 'string' ? response : JSON.stringify(response) }),
    embeddings: async () => ({ embedding: new Float32Array(1024) }),
  } as unknown as OllamaClient;
}

describe('runReviewFindingExtraction', () => {
  test('原文に引用が現れる指摘を登録し、extracted_by を刻む', async () => {
    const db = makeDb();
    const reviewId = insertReview(db, 'sess-a#m1', BODY);

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama({
        findings: [
          {
            title: 'busy_timeout が無い',
            quote: 'journal_mode と foreign_keys しか設定しておらず',
            finding_text: '同時書き込みで SQLITE_BUSY になる',
            suggestion_text: 'busy_timeout を設定する',
            severity: 'warn',
            category: 'logic',
            target_file_path: 'packages/doc-core/src/db/open.ts',
          },
        ],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.status).toBe('success');
    expect(result.findings_inserted).toBe(1);
    const row = db.prepare(
      'SELECT severity, category, target_file_path, extracted_by FROM memory_review_findings WHERE review_id = ?',
    ).get(reviewId);
    expect(row?.['severity']).toBe('warn');
    expect(row?.['category']).toBe('logic');
    expect(row?.['target_file_path']).toBe('packages/doc-core/src/db/open.ts');
    expect(String(row?.['extracted_by'])).toBe('llm:qwen3:8b');

    db.close();
  });

  test('原文に無い引用の指摘は捨てる（誰も言っていない指摘を作らない）', async () => {
    const db = makeDb();
    const reviewId = insertReview(db, 'sess-b#m1', BODY);

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama({
        findings: [
          {
            title: 'SQL インジェクション',
            quote: '本文には一切書かれていない捏造された引用文である',
            finding_text: '危険',
            suggestion_text: '直す',
            severity: 'error',
            category: 'security',
            target_file_path: 'src/foo.ts',
          },
        ],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.findings_inserted).toBe(0);
    expect(result.findings_rejected).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM memory_review_findings WHERE review_id = ?').get(reviewId)?.['n']).toBe(0);

    db.close();
  });

  test('本文に無い対象パスは記録せず NULL にする', async () => {
    const db = makeDb();
    const reviewId = insertReview(db, 'sess-c#m1', BODY);

    await runReviewFindingExtraction({
      db,
      ollama: makeOllama({
        findings: [
          {
            title: 'busy_timeout',
            quote: 'daemon との同時書き込みで SQLITE_BUSY になる',
            finding_text: '説明',
            suggestion_text: '',
            severity: 'warn',
            category: 'logic',
            target_file_path: 'src/created/by/llm.ts',
          },
        ],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    const row = db.prepare('SELECT target_file_path FROM memory_review_findings WHERE review_id = ?').get(reviewId);
    expect(row?.['target_file_path']).toBeNull();

    db.close();
  });

  test('短すぎる引用は偶然一致するので捨てる', async () => {
    const db = makeDb();
    insertReview(db, 'sess-d#m1', BODY);

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama({
        findings: [{ title: 'x', quote: 'は', finding_text: 'y', severity: 'info', category: 'other' }],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.findings_inserted).toBe(0);
    expect(result.findings_rejected).toBe(1);

    db.close();
  });

  test('既に指摘がある review は対象にしない', async () => {
    const db = makeDb();
    const reviewId = insertReview(db, 'sess-e#m1', BODY);
    const findingEntity = entityId('ReviewFinding', `${reviewId}:0`);
    db.run(
      `INSERT INTO memory_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'ReviewFinding', ?, 'f', ?, ?, ?)`,
      [findingEntity, `${reviewId}:0`, AT, AT, AT],
    );
    db.run(
      `INSERT INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index, category, severity, finding_text, suggestion_text, recorded_at)
       VALUES (?, ?, ?, 0, 'logic', 'error', '既存の指摘', '', ?)`,
      [entityId('finding_row', `${reviewId}:0`), reviewId, findingEntity, AT],
    );

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama({ findings: [] }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.reviews_scanned).toBe(0);

    db.close();
  });

  test('本文を復元できない行は失敗に数えない', async () => {
    const db = makeDb();
    insertReview(db, 'sess-f#m1', BODY);

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama({ findings: [] }),
      resolveBody: () => null,
      recordedAt: NOW,
    });

    expect(result.reviews_scanned).toBe(1);
    expect(result.reviews_failed).toBe(0);
    expect(result.findings_inserted).toBe(0);

    db.close();
  });

  test('思考ブロックが混ざった応答からも JSON を取り出す', async () => {
    const db = makeDb();
    insertReview(db, 'sess-g#m1', BODY);

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama(
        '<think>本文を読んでいる…</think>\n' +
          JSON.stringify({
            findings: [
              {
                title: 'busy_timeout',
                quote: 'daemon との同時書き込みで SQLITE_BUSY になる',
                finding_text: '説明',
                severity: 'warn',
                category: 'logic',
              },
            ],
          }),
      ),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.findings_inserted).toBe(1);

    db.close();
  });
});
