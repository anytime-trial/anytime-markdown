/**
 * reviewClusters の SQL エラーパス (catch ブロック) をカバーするテスト。
 * src/drift/reviewClusters.ts L33-36, L88-91, L151-154
 * また existingSpecVsCodeKeys 引数のカバレッジも追加する。
 */
import {
  detectReviewUnfixed,
  detectReviewVsCode,
  detectRecurringReviewFindings,
} from '../../src/drift/reviewClusters';
import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import type { MemoryLogger } from '../../src/logger';
import type { MemoryDbConnection } from '../../src/db/connection/types';

function makeBrokenDb(): MemoryDbConnection {
  return {
    exec: () => { throw new Error('DB exec failed'); },
    run: () => {},
    execMany: () => {},
    prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ changes: 0, lastInsertRowid: 0n }), iterate: function* () {} }),
    getRowsModified: () => 0,
    pragma: () => null,
    attach: () => {},
    detach: () => {},
    close: () => {},
    serialize: () => Buffer.alloc(0),
  };
}

const silentLogger: MemoryLogger = { info: () => {}, error: () => {} };

describe('detectReviewUnfixed - SQL エラーパス', () => {
  it('exec で例外が発生したとき空配列を返しエラーをログする', () => {
    const errors: string[] = [];
    const logger: MemoryLogger = {
      info: () => {},
      error: (msg: string) => { errors.push(msg); },
    };

    const result = detectReviewUnfixed({
      db: makeBrokenDb(),
      logger,
    });

    expect(result).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('[detectReviewUnfixed]');
  });
});

describe('detectReviewVsCode - SQL エラーパス', () => {
  it('exec で例外が発生したとき空配列を返しエラーをログする', () => {
    const errors: string[] = [];
    const logger: MemoryLogger = {
      info: () => {},
      error: (msg: string) => { errors.push(msg); },
    };

    const result = detectReviewVsCode({
      db: makeBrokenDb(),
      logger,
    });

    expect(result).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('[detectReviewVsCode]');
  });

  it('existingSpecVsCodeKeys に一致するキーがあると spec_vs_code_overlap=true になる', () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    db.run('PRAGMA foreign_keys = ON');
    runMigrations(db);

    const TS = '2026-01-01T00:00:00.000Z';

    // entity を追加
    const entityId = 'ent-overlap';
    db.run(
      `INSERT INTO memory_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES (?, 'Tool', ?, ?, ?, ?, ?)`,
      [entityId, entityId, entityId, TS, TS, TS],
    );

    // review と code で異なる値のエッジを挿入
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, object_literal, source_type, source_ref,
          confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES ('edge-review', ?, 'uses', NULL, 'InterfaceA', 'review', 'ref-r', 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
      [entityId, TS, TS],
    );
    db.run(
      `INSERT INTO memory_edges
         (id, subject_entity_id, predicate, object_entity_id, object_literal, source_type, source_ref,
          confidence, confidence_label, modality, valid_from, recorded_at)
       VALUES ('edge-code', ?, 'uses', NULL, 'InterfaceB', 'code', 'ref-c', 0.8, 'EXTRACTED', 'asserted', ?, ?)`,
      [entityId, TS, TS],
    );

    // existingSpecVsCodeKeys に このキーを含める
    const existingSpecVsCodeKeys = new Set<string>([`${entityId}:uses`]);
    const results = detectReviewVsCode({ db, existingSpecVsCodeKeys, logger: silentLogger });

    expect(results).toHaveLength(1);
    expect(results[0].detail['spec_vs_code_overlap']).toBe(true);
    db.close();
  });
});

describe('detectRecurringReviewFindings - SQL エラーパス', () => {
  it('exec で例外が発生したとき空配列を返しエラーをログする', () => {
    const errors: string[] = [];
    const logger: MemoryLogger = {
      info: () => {},
      error: (msg: string) => { errors.push(msg); },
    };

    const result = detectRecurringReviewFindings({
      db: makeBrokenDb(),
      logger,
    });

    expect(result).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('[detectRecurringReviewFindings]');
  });
});
