import { BetterSqlite3CaravanDb } from '../../src/db/connection/BetterSqlite3CaravanDb';
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
  'テストが実挙動を検証しており、モックによる偽陽性が無い点は評価できる。',
  '',
  '### 1. busy_timeout が無い',
  '',
  'openDocDb は journal_mode と foreign_keys しか設定しておらず、daemon との同時書き込みで SQLITE_BUSY になる。',
  '対象は packages/markdown-catalog/src/db/open.ts である。',
].join('\n');

function makeDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function insertReview(db: BetterSqlite3CaravanDb, id: string, bodyExcerpt: string): string {
  const reviewId = entityId('Review', id);
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Review', ?, 'Session review', ?, ?, ?)`,
    [reviewId, id, AT, AT, AT],
  );
  db.run(
    `INSERT INTO caravan_reviews
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
            target_file_path: 'packages/markdown-catalog/src/db/open.ts',
          },
        ],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.status).toBe('success');
    expect(result.findings_inserted).toBe(1);
    const row = db.prepare(
      'SELECT severity, category, target_file_path, extracted_by FROM caravan_review_findings WHERE review_id = ?',
    ).get(reviewId);
    expect(row?.['severity']).toBe('warn');
    expect(row?.['category']).toBe('logic');
    expect(row?.['target_file_path']).toBe('packages/markdown-catalog/src/db/open.ts');
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
    // 捏造は ungrounded として数える（形式不備・上限超過と混ぜない）
    expect(result.rejected).toEqual({ ungrounded: 1, malformed: 0, overflow: 0 });
    expect(db.prepare('SELECT COUNT(*) n FROM caravan_review_findings WHERE review_id = ?').get(reviewId)?.['n']).toBe(0);

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

    const row = db.prepare('SELECT target_file_path FROM caravan_review_findings WHERE review_id = ?').get(reviewId);
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
    expect(result.rejected).toEqual({ ungrounded: 0, malformed: 1, overflow: 0 });

    db.close();
  });

  test('総合評価・良い点から引用した指摘は捨てる（引用の実在 ≠ 指摘の実在）', async () => {
    const db = makeDb();
    insertReview(db, 'sess-praise#m1', BODY);

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama({
        findings: [
          {
            title: '捏造された指摘',
            // 本文には実在するが「## 良い点」セクションの文
            quote: 'テストが実挙動を検証しており、モックによる偽陽性が無い点は評価できる。',
            finding_text: 'テストが不十分である',
            severity: 'error',
            category: 'logic',
          },
        ],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.findings_inserted).toBe(0);
    expect(result.rejected.ungrounded).toBe(1);

    db.close();
  });

  test('重大度・カテゴリが不正なら既定値で埋めず捨てる', async () => {
    const db = makeDb();
    insertReview(db, 'sess-bad#m1', BODY);

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama({
        findings: [
          {
            title: 'x',
            quote: 'daemon との同時書き込みで SQLITE_BUSY になる',
            finding_text: '説明',
            severity: 'CRITICAL',
            category: 'logic',
          },
        ],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    // info で埋めると linkAddresses の skip 内訳（severity_info）を汚す
    expect(result.findings_inserted).toBe(0);
    expect(result.rejected.malformed).toBe(1);

    db.close();
  });

  test('finding_index は実パーサの範囲と衝突しない', async () => {
    const db = makeDb();
    const reviewId = insertReview(db, 'sess-idx#m1', BODY);

    await runReviewFindingExtraction({
      db,
      ollama: makeOllama({
        findings: [
          {
            title: 'a', quote: 'daemon との同時書き込みで SQLITE_BUSY になる',
            finding_text: '説明', severity: 'warn', category: 'logic',
          },
        ],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    const idx = db.prepare('SELECT finding_index FROM caravan_review_findings WHERE review_id = ?').get(reviewId);
    // 0 起点だと、後から書式準拠でパースし直した本物の指摘が
    // UNIQUE(review_id, finding_index) + INSERT OR IGNORE で黙って捨てられる
    expect(Number(idx?.['finding_index'])).toBeGreaterThanOrEqual(10000);

    db.close();
  });

  test('review_doc は既定では対象にしない（書き直しで直せるため）', async () => {
    const db = makeDb();
    const reviewId = entityId('Review', 'review/a.md');
    db.run(
      `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Review', 'review/a.md', 'doc', ?, ?, ?)`,
      [reviewId, AT, AT, AT],
    );
    db.run(
      `INSERT INTO caravan_reviews
         (id, source_kind, source_ref, source_hash, review_entity_id, target_kind, target_refs_json,
          title, reviewer, severity_overall, summary, body_excerpt, reviewed_at, recorded_at)
       VALUES (?, 'review_doc', 'review/a.md', 'h', ?, 'code', '[]', 'doc', '', 'info', '', ?, ?, ?)`,
      [reviewId, reviewId, BODY, AT, AT],
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

  test('dryRun では DB へ書かない', async () => {
    const db = makeDb();
    const reviewId = insertReview(db, 'sess-dry#m1', BODY);

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama({
        findings: [
          {
            title: 'a', quote: 'daemon との同時書き込みで SQLITE_BUSY になる',
            finding_text: '説明', severity: 'warn', category: 'logic',
          },
        ],
      }),
      resolveBody: () => BODY,
      recordedAt: NOW,
      dryRun: true,
    });

    expect(result.findings_inserted).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM caravan_review_findings WHERE review_id = ?').get(reviewId)?.['n']).toBe(0);

    db.close();
  });

  test('値に生の改行が入って壊れた JSON を復旧する（コードブロックの引用）', async () => {
    const db = makeDb();
    insertReview(db, 'sess-raw#m1', BODY);

    // モデルがコードブロックをそのまま値へ入れた形（実測で支配的な壊れ方）
    const broken =
      '{"findings":[{"title":"a","quote":"daemon との同時書き込みで SQLITE_BUSY になる",' +
      '"finding_text":"次のコードが問題:\n```ts\nconst x = 1;\n```\n","severity":"warn","category":"logic"}]}';

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama(broken),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.reviews_failed).toBe(0);
    expect(result.findings_inserted).toBe(1);

    db.close();
  });

  test('改行以外の壊れ方は推測で直さず捨てる', async () => {
    const db = makeDb();
    insertReview(db, 'sess-trunc#m1', BODY);

    // 途中で切れた出力。埋めると「不完全な結果」を完全なものとして登録してしまう
    const truncated = '{"findings":[{"title":"a","quote":"daemon との同時書き込みで SQLITE';

    const result = await runReviewFindingExtraction({
      db,
      ollama: makeOllama(truncated),
      resolveBody: () => BODY,
      recordedAt: NOW,
    });

    expect(result.reviews_failed).toBe(1);
    expect(result.findings_inserted).toBe(0);

    db.close();
  });

  test('既に指摘がある review は対象にしない', async () => {
    const db = makeDb();
    const reviewId = insertReview(db, 'sess-e#m1', BODY);
    const findingEntity = entityId('ReviewFinding', `${reviewId}:0`);
    db.run(
      `INSERT INTO caravan_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'ReviewFinding', ?, 'f', ?, ?, ?)`,
      [findingEntity, `${reviewId}:0`, AT, AT, AT],
    );
    db.run(
      `INSERT INTO caravan_review_findings
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
