/**
 * postProcessF22 のエラーパス (L34-37, L62) をカバーするテスト。
 * - SQL query 失敗時の catch (L34-37)
 * - UPDATE 失敗時の catch (L62)
 */
import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../src/db/migrations/runner';
import { postProcessF22 } from '../../src/drift/postProcessF22';
import type { MemoryLogger } from '../../src/logger';
import type { MemoryDbConnection, SqlValue } from '../../src/db/connection/types';
import type { DriftEventInput } from '../../src/drift/report';

const TS = '2026-01-01T00:00:00.000Z';

function makeDriftEvent(targetSpecPath: string | null): DriftEventInput {
  const groupKey = targetSpecPath ?? 'symbol:MyClass';
  return {
    subject_entity_id: `spec_clarification:${groupKey}`,
    predicate: 'recurring_question',
    conversation_value: null,
    spec_value: null,
    code_value: null,
    drift_type: 'spec_clarification_recurring',
    severity: 'warn',
    detail: {
      target_spec_path: targetSpecPath,
      group_key: groupKey,
      question_ids: [],
      pairs: [],
    },
  };
}

describe('postProcessF22 - SQL クエリ失敗パス', () => {
  it('exec が例外を投げたとき findings_suggested=0 を返しエラーをログする', () => {
    const errors: string[] = [];
    const logger: MemoryLogger = {
      info: () => {},
      error: (msg: string) => { errors.push(msg); },
    };

    // exec が常に throw するモック DB
    const brokenDb: MemoryDbConnection = {
      exec: (_sql: string, _params?: ReadonlyArray<SqlValue>) => {
        throw new Error('query error');
      },
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

    const result = postProcessF22({
      db: brokenDb,
      driftEvents: [makeDriftEvent('spec/api.md')],
      recordedAt: TS,
      logger,
    });

    expect(result.findings_suggested).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('[postProcessF22]');
    expect(errors[0]).toContain('query failed');
  });
});

describe('postProcessF22 - UPDATE 失敗パス', () => {
  it('UPDATE が例外を投げたとき findings_suggested が増えない', () => {
    const errors: string[] = [];
    const logger: MemoryLogger = {
      info: () => {},
      error: (msg: string) => { errors.push(msg); },
    };

    // exec は rows を返すが run が失敗するモック DB
    let runCount = 0;
    const db: MemoryDbConnection = {
      exec: (_sql: string, _params?: ReadonlyArray<SqlValue>) => {
        // SELECT クエリ → finding を1件返す
        return [{
          columns: ['id', 'attributes_json'],
          values: [['ent-id-1', '{}']],
        }];
      },
      run: (_sql: string, _params?: ReadonlyArray<SqlValue>) => {
        runCount++;
        throw new Error('update error');
      },
      execMany: () => {},
      prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ changes: 0, lastInsertRowid: 0n }), iterate: function* () {} }),
      getRowsModified: () => 0,
      pragma: () => null,
      attach: () => {},
      detach: () => {},
      close: () => {},
      serialize: () => Buffer.alloc(0),
    };

    const result = postProcessF22({
      db,
      driftEvents: [makeDriftEvent('spec/api.md')],
      recordedAt: TS,
      logger,
    });

    expect(result.findings_suggested).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('update failed');
  });

  it('attributes_json が "{}" の entity は正常に更新される (suggested_by フィールドが設定される)', () => {
    const db = BetterSqlite3MemoryDb.openInMemory();
    db.run('PRAGMA foreign_keys = ON');
    runMigrations(db);

    let seq = 0;
    const insertEntity = (id: string, attrsJson: string): void => {
      db.run(
        `INSERT INTO memory_entities
           (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at, attributes_json)
         VALUES (?, 'Tool', ?, ?, ?, ?, ?, ?)`,
        [id, id, id, TS, TS, TS, attrsJson],
      );
    };

    const insertReview = (): string => {
      const rid = `rev-pf22-${++seq}`;
      const reviewEntity = `rev-ent-${rid}`;
      insertEntity(reviewEntity, '{}');
      db.run(
        `INSERT INTO memory_reviews
           (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
         VALUES (?, 'review_doc', ?, ?, 'code', 'Test Review', ?, ?)`,
        [rid, rid, reviewEntity, TS, TS],
      );
      return rid;
    };

    const rev = insertReview();
    const entityId = `ent-attrs-${++seq}`;
    // 有効な JSON - suggested_by フィールドが正しく設定されるかチェック
    insertEntity(entityId, '{}');
    db.run(
      `INSERT INTO memory_review_findings
         (id, review_id, finding_entity_id, finding_index, target_file_path, category, finding_text, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, 'text', ?)`,
      [`rf-${++seq}`, rev, entityId, seq, 'spec/attrs.md', 'other', TS],
    );

    const logger: MemoryLogger = { info: () => {}, error: () => {} };
    const driftEvent = makeDriftEvent('spec/attrs.md');
    const result = postProcessF22({
      db,
      driftEvents: [driftEvent],
      recordedAt: TS,
      logger,
    });

    expect(result.findings_suggested).toBe(1);
    const rows = db.exec(`SELECT attributes_json FROM memory_entities WHERE id = ?`, [entityId]);
    const attrs = JSON.parse(rows[0].values[0][0] as string) as Record<string, unknown>;
    expect(attrs['category_suggested']).toBe('spec');
    expect(attrs['suggested_at']).toBe(TS);
    expect(typeof attrs['suggested_by']).toBe('string');
    expect(attrs['suggested_by'] as string).toContain('spec_clarification_recurring');
    db.close();
  });
});
