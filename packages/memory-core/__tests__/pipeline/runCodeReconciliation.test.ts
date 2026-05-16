import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { runCodeReconciliation } from '../../src/pipeline/runCodeReconciliation';

const RECORDED_AT = '2026-05-12T00:00:00.000Z';

async function makeDb(): Promise<BetterSqlite3MemoryDb> {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function insertEntity(
  db: BetterSqlite3MemoryDb,
  id: string,
  type: string,
  canon: string,
  repoName: string | null,
  validUntil: string | null = null,
) {
  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, repo_name, valid_until,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, type, canon, canon, repoName, validUntil, RECORDED_AT, RECORDED_AT, RECORDED_AT],
  );
}

describe('runCodeReconciliation', () => {
  test('snapshot に含まれない Function を soft-delete する', async () => {
    const db = await makeDb();
    insertEntity(db, 'fn-bar', 'Function', 'test:src/foo.ts::bar', 'test');
    insertEntity(db, 'fn-baz', 'Function', 'test:src/foo.ts::baz', 'test');

    const result = runCodeReconciliation({
      db,
      repoName: 'test',
      currentEntityIds: new Set(['fn-bar']), // baz is missing
      recordedAt: '2026-05-12T01:00:00.000Z',
    });

    expect(result.status).toBe('success');
    expect(result.scanned).toBe(2);
    expect(result.soft_deleted).toBe(1);

    const stmt = db.prepare(`SELECT valid_until FROM memory_entities WHERE id = ?`);
    expect(stmt.get('fn-baz')?.['valid_until']).toBe('2026-05-12T01:00:00.000Z');
    stmt.free?.();

    db.close();
  });

  test('既に valid_until がセット済みの entity は再度上書きしない', async () => {
    const db = await makeDb();
    insertEntity(db, 'fn-old', 'Function', 'test:foo::old', 'test', '2026-01-01T00:00:00.000Z');

    const result = runCodeReconciliation({
      db,
      repoName: 'test',
      currentEntityIds: new Set(),
      recordedAt: '2026-05-12T01:00:00.000Z',
    });

    // 既に soft-deleted なので scan 対象外
    expect(result.scanned).toBe(0);
    expect(result.soft_deleted).toBe(0);

    const stmt = db.prepare(`SELECT valid_until FROM memory_entities WHERE id = ?`);
    expect(stmt.get('fn-old')?.['valid_until']).toBe('2026-01-01T00:00:00.000Z');
    stmt.free?.();

    db.close();
  });

  test('他 repo の entity は対象外', async () => {
    const db = await makeDb();
    insertEntity(db, 'fn-a', 'Function', 'repoA:foo::a', 'repoA');
    insertEntity(db, 'fn-b', 'Function', 'repoB:foo::b', 'repoB');

    const result = runCodeReconciliation({
      db,
      repoName: 'repoA',
      currentEntityIds: new Set(), // empty for repoA
      recordedAt: RECORDED_AT,
    });

    expect(result.scanned).toBe(1);
    expect(result.soft_deleted).toBe(1);

    // repoB は影響なし
    const stmt = db.prepare(`SELECT valid_until FROM memory_entities WHERE id = ?`);
    expect(stmt.get('fn-b')?.['valid_until']).toBeNull();
    stmt.free?.();

    db.close();
  });

  test('Function と File 両方を対象にする', async () => {
    const db = await makeDb();
    insertEntity(db, 'file-a', 'File', 'src/a.ts', 'test');
    insertEntity(db, 'fn-a', 'Function', 'test:src/a.ts::doIt', 'test');
    insertEntity(db, 'bug-1', 'Bug', 'commit-abc', 'test'); // 対象外 type

    const result = runCodeReconciliation({
      db,
      repoName: 'test',
      currentEntityIds: new Set(), // 全部 missing
      recordedAt: RECORDED_AT,
    });

    expect(result.scanned).toBe(2); // File + Function だけ
    expect(result.soft_deleted).toBe(2);

    // Bug は影響なし
    const stmt = db.prepare(`SELECT valid_until FROM memory_entities WHERE id = ?`);
    expect(stmt.get('bug-1')?.['valid_until']).toBeNull();
    stmt.free?.();

    db.close();
  });

  test('repo_name が NULL の entity は対象外 (会話 entity 等)', async () => {
    const db = await makeDb();
    insertEntity(db, 'concept-1', 'Concept', 'some-concept', null);

    const result = runCodeReconciliation({
      db,
      repoName: 'test',
      currentEntityIds: new Set(),
      recordedAt: RECORDED_AT,
    });

    expect(result.scanned).toBe(0);
    expect(result.soft_deleted).toBe(0);

    db.close();
  });
});
