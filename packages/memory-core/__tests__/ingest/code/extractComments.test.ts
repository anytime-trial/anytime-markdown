import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../../src/db/migrations/runner';
import {
  ingestDecisionComments,
  type DecisionCommentItem,
} from '../../../src/ingest/code/extractComments';
import { entityId } from '../../../src/canonical/entityId';
import { createHash } from 'crypto';
import type { MemoryLogger } from '../../../src/logger';

// AST 走査（ts.Program 依存）は trail-server の scanDecisionComments へ移設済み。
// 本テストは抽出済み DecisionCommentItem[] を受け取って memory DB へ ingest する
// ingestDecisionComments の挙動（Decision/File entity・rationale_for edge・冪等性）を検証する。

// ── Constants ────────────────────────────────────────────────────────────────

const RECORDED_AT = '2026-01-01T00:00:00.000Z';
const REPO = 'test-repo';

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeDb(): Promise<BetterSqlite3MemoryDb> {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function ingest(db: BetterSqlite3MemoryDb, comments: DecisionCommentItem[]) {
  return ingestDecisionComments({ db, comments, repoName: REPO, recordedAt: RECORDED_AT, logger: silentLogger });
}

function countDecisions(db: BetterSqlite3MemoryDb): number {
  const result = db.exec(`SELECT COUNT(*) FROM memory_entities WHERE type = 'Decision'`);
  return (result[0]?.values[0][0] as number) ?? 0;
}

function countEdges(db: BetterSqlite3MemoryDb, predicate?: string): number {
  if (predicate) {
    const stmt = db.prepare(`SELECT COUNT(*) AS c FROM memory_edges WHERE predicate = ?`);
    try {
      return (stmt.get(predicate)?.['c'] as number) ?? 0;
    } finally {
      stmt.free?.();
    }
  }
  const result = db.exec(`SELECT COUNT(*) FROM memory_edges`);
  return (result[0]?.values[0][0] as number) ?? 0;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ingestDecisionComments', () => {
  test('EC-1: 1 comment → 1 Decision entity + 1 rationale_for edge', async () => {
    const db = await makeDb();
    const stats = ingest(db, [
      { filePath: 'src/index.ts', line: 2, text: 'ロジック A の理由', symbolName: 'myFunc' },
    ]);

    expect(stats.decisions_inserted).toBe(1);
    expect(stats.edges_inserted).toBe(1);
    expect(countDecisions(db)).toBe(1);
    expect(countEdges(db, 'rationale_for')).toBe(1);

    const rows = db.exec(
      `SELECT summary, display_name FROM memory_entities WHERE type = 'Decision'`
    );
    expect(rows[0]?.values).toHaveLength(1);
    expect(rows[0].values[0][0] as string).toContain('ロジック A の理由');
    expect(rows[0].values[0][1] as string).toContain('ロジック A の理由');

    const edgeRows = db.exec(
      `SELECT source_type, source_ref, confidence_label FROM memory_edges WHERE predicate = 'rationale_for'`
    );
    expect(edgeRows[0].values[0][0]).toBe('code');
    expect(edgeRows[0].values[0][1] as string).toMatch(/^code_fact:comment:.+#\d+$/);
    expect(edgeRows[0].values[0][2]).toBe('EXTRACTED');
  });

  test('EC-2: multiple comments → N Decision entities', async () => {
    const db = await makeDb();
    const stats = ingest(db, [
      { filePath: 'src/a.ts', line: 1, text: 'reason a', symbolName: null },
      { filePath: 'src/a.ts', line: 5, text: 'reason b', symbolName: 'fnB' },
      { filePath: 'src/b.ts', line: 3, text: 'reason c', symbolName: null },
    ]);
    expect(stats.decisions_inserted).toBe(3);
    expect(stats.edges_inserted).toBe(3);
    expect(countDecisions(db)).toBe(3);
  });

  test('EC-3: empty text is skipped', async () => {
    const db = await makeDb();
    const stats = ingest(db, [{ filePath: 'src/x.ts', line: 1, text: '   ', symbolName: null }]);
    expect(stats.decisions_inserted).toBe(0);
    expect(countDecisions(db)).toBe(0);
  });

  test('EC-4: idempotent — re-ingest same comment inserts 0', async () => {
    const db = await makeDb();
    const comments: DecisionCommentItem[] = [
      { filePath: 'src/index.ts', line: 2, text: 'パフォーマンス向上のため', symbolName: 'myFunc' },
    ];
    const first = ingest(db, comments);
    expect(first.decisions_inserted).toBe(1);
    const second = ingest(db, comments);
    expect(second.decisions_inserted).toBe(0);
    expect(second.edges_inserted).toBe(0);
    expect(countDecisions(db)).toBe(1);
    expect(countEdges(db, 'rationale_for')).toBe(1);
  });

  test('EC-5: Decision entity id is derived from sha1(repo:file:line:text)', async () => {
    const db = await makeDb();
    const filePath = 'src/index.ts';
    const line = 2;
    const text = 'use sync IO';
    ingest(db, [{ filePath, line, text, symbolName: null }]);

    const canonName = createHash('sha1')
      .update(`${REPO}:${filePath}:${line}:${text}`)
      .digest('hex')
      .slice(0, 16);
    const expectedId = entityId('Decision', canonName);

    const rows = db.exec(`SELECT id FROM memory_entities WHERE type = 'Decision'`);
    expect(rows[0]?.values[0][0]).toBe(expectedId);
  });

  test('EC-6: File entity created once per file; edge Decision → File', async () => {
    const db = await makeDb();
    ingest(db, [
      { filePath: 'src/index.ts', line: 1, text: 'r1', symbolName: null },
      { filePath: 'src/index.ts', line: 9, text: 'r2', symbolName: null },
    ]);
    const fileRows = db.exec(`SELECT COUNT(*) FROM memory_entities WHERE type = 'File'`);
    expect(fileRows[0]?.values[0][0] as number).toBe(1);

    // 同名列 (type) を 2 つ select すると sql.js が collapse するため別名にする。
    const edgeRows = db.exec(`
      SELECT s.type AS subject_type, o.type AS object_type FROM memory_edges e
        JOIN memory_entities s ON s.id = e.subject_entity_id
        JOIN memory_entities o ON o.id = e.object_entity_id
       WHERE e.predicate = 'rationale_for' LIMIT 1
    `);
    expect(edgeRows[0].values[0][0]).toBe('Decision');
    expect(edgeRows[0].values[0][1]).toBe('File');
  });

  test('EC-7: displayName prefixes symbol name and truncates body to 80', async () => {
    const db = await makeDb();
    const longText = 'x'.repeat(200);
    ingest(db, [{ filePath: 'src/index.ts', line: 1, text: longText, symbolName: 'mySymbol' }]);
    const rows = db.exec(`SELECT display_name FROM memory_entities WHERE type = 'Decision'`);
    const displayName = rows[0].values[0][0] as string;
    expect(displayName.startsWith('mySymbol: ')).toBe(true);
    expect(displayName.length).toBeLessThanOrEqual(90); // symbol + ': ' + 80
  });
});
