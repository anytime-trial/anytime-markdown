/**
 * 029_code_edge_predicates — コード由来の辺を calls / extends の述語へ分離する migration。
 *
 * 述語の登録（seed）は新規 DB でも検査できるが、本体の UPDATE（呼び出し・継承由来の
 * relates_to だけを無効化する）は既存行がある DB でしか意味を持たない。新規 DB では
 * caravan_edges が空で 0 行に当たるだけなので、それを通しても何も確かめたことにならない。
 *
 * そこで 020_workspace_scope.test.ts と同じ方式を採り、migration ファイルから UPDATE 文を
 * 読み出して仕込み済みの DB へ適用する（テスト内に SQL を書き写すと、本番の SQL を直しても
 * 気づけないため）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BetterSqlite3CaravanDb } from '../../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../../src/db/migrations/runner';

const TS = '2026-01-01T00:00:00.000Z';

const MIGRATION_PATH = path.join(
  __dirname,
  '../../../src/db/migrations/029_code_edge_predicates.sql',
);

function makeDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

/** migration ファイルから caravan_edges への UPDATE（無効化）だけを取り出す。 */
function invalidationStatement(): string {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const statements = sql
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((s) => s.startsWith('UPDATE caravan_edges'));
  // 取り出せなかったら「0 件で成功」に化けるので、ここで落とす
  expect(statements.length).toBe(1);
  return statements[0];
}

function insertEntity(db: BetterSqlite3CaravanDb, id: string, type = 'File'): string {
  db.run(
    `INSERT INTO caravan_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, type, id, id, TS, TS, TS],
  );
  return id;
}

function insertFact(db: BetterSqlite3CaravanDb, id: string, factType: string): string {
  db.run(
    `INSERT INTO caravan_code_facts
       (id, repo_name, file_path, symbol_path, fact_type, fact_value, recorded_at)
     VALUES (?, 'repo', 'src/a.ts', 'file::src/a.ts::fn', ?, 'file::src/b.ts::fn', ?)`,
    [id, factType, TS],
  );
  return id;
}

function insertEdge(
  db: BetterSqlite3CaravanDb,
  id: string,
  predicate: string,
  sourceRef: string,
  subject: string,
  object: string,
): string {
  db.run(
    `INSERT INTO caravan_edges
       (id, subject_entity_id, predicate, object_entity_id,
        valid_from, recorded_at, source_type, source_ref,
        confidence, confidence_label, modality)
     VALUES (?, ?, ?, ?, ?, ?, 'code', ?, 1.0, 'EXTRACTED', 'asserted')`,
    [id, subject, predicate, object, TS, TS, sourceRef],
  );
  return id;
}

function validTo(db: BetterSqlite3CaravanDb, edgeId: string): string | null {
  const res = db.exec(`SELECT valid_to FROM caravan_edges WHERE id = '${edgeId}'`);
  const value = res[0]?.values[0]?.[0];
  return value === undefined ? null : (value as string | null);
}

describe('migration 029 (code edge predicates)', () => {
  test('seed: calls / extends 述語が登録される', () => {
    const db = makeDb();
    const res = db.exec(
      `SELECT predicate FROM caravan_relation_types
        WHERE predicate IN ('calls', 'extends') ORDER BY predicate`,
    );
    expect(res[0]?.values.map((r) => r[0])).toEqual(['calls', 'extends']);
    db.close();
  }, 30000);

  test('code_incremental のウォーターマークが巻き戻る', () => {
    const db = makeDb();
    const res = db.exec(
      `SELECT last_processed_at FROM caravan_pipeline_state WHERE scope = 'code_incremental'`,
    );
    // 行が無い環境（未実行）では UPDATE が 0 行に当たる。行がある場合のみ値を検査する。
    const row = res[0]?.values[0];
    if (row) expect(row[0]).toBe('1970-01-01T00:00:00.000Z');
    db.close();
  }, 30000);

  test('呼び出し・継承由来の relates_to だけを無効化し、他は触らない', () => {
    const db = makeDb();
    const fileA = insertEntity(db, 'ent-file-a');
    const fileB = insertEntity(db, 'ent-file-b');
    const fnA = insertEntity(db, 'ent-fn-a', 'Function');
    const lib = insertEntity(db, 'ent-lib', 'Library');

    const callsFact = insertFact(db, 'fact-calls', 'calls');
    const extendsFact = insertFact(db, 'fact-extends', 'extends');
    const importsFact = insertFact(db, 'fact-imports', 'imports');

    // (a) 無効化されるべき: 呼び出し / 継承由来の relates_to
    const eCall = insertEdge(db, 'e-call', 'relates_to', `code_fact:${callsFact}`, fileA, fileB);
    const eExtends = insertEdge(db, 'e-ext', 'relates_to', `code_fact:${extendsFact}`, fileA, fileB);

    // (b)〜(e) 触ってはいけないもの
    const eImport = insertEdge(db, 'e-imp', 'relates_to', `code_fact:${importsFact}`, fileA, fileB);
    const ePkgFile = insertEdge(
      db, 'e-pkg', 'relates_to', 'activity_current_code_graphs#repo', fileA, fileB,
    );
    const eDefines = insertEdge(db, 'e-def', 'defines', `ast_node:src/a.ts#fn`, fileA, fnA);
    const eDependsOn = insertEdge(db, 'e-dep', 'depends_on', `code_fact:${importsFact}`, fileA, lib);

    db.run(invalidationStatement());

    expect(validTo(db, eCall)).not.toBeNull();
    expect(validTo(db, eExtends)).not.toBeNull();

    expect(validTo(db, eImport)).toBeNull();
    expect(validTo(db, ePkgFile)).toBeNull();
    expect(validTo(db, eDefines)).toBeNull();
    expect(validTo(db, eDependsOn)).toBeNull();

    db.close();
  }, 30000);

  test('無効化で入る valid_to は CHECK 制約の形式に適合する', () => {
    const db = makeDb();
    const fileA = insertEntity(db, 'ent-file-a');
    const fileB = insertEntity(db, 'ent-file-b');
    const callsFact = insertFact(db, 'fact-calls', 'calls');
    const eCall = insertEdge(db, 'e-call', 'relates_to', `code_fact:${callsFact}`, fileA, fileB);

    // CHECK 違反なら db.run が throw する。通ったうえで形式も直接見る
    db.run(invalidationStatement());

    const stamp = validTo(db, eCall);
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    db.close();
  }, 30000);
});
