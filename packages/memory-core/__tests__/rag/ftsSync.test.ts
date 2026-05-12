import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import type { MemoryDbConnection } from '../../src/db/connection/types';
import {
  aliasesJsonToText,
  upsertEntityFts,
  deleteEntityFts,
  upsertEpisodeFts,
  deleteEpisodeFts,
  upsertDriftFts,
  deleteDriftFts,
} from '../../src/rag/ftsSync';

function makeTmpDb(): string {
  return path.join(os.tmpdir(), `memory-ftssync-${process.pid}-${Date.now()}-${Math.random()}.db`);
}

describe('aliasesJsonToText (pure function)', () => {
  test('JSON 配列を半角スペース区切り文字列に変換', () => {
    expect(aliasesJsonToText('["foo","bar","baz"]')).toBe('foo bar baz');
  });

  test('空配列は空文字', () => {
    expect(aliasesJsonToText('[]')).toBe('');
  });

  test('空文字 / null / undefined は空文字', () => {
    expect(aliasesJsonToText('')).toBe('');
    expect(aliasesJsonToText(null as unknown as string)).toBe('');
    expect(aliasesJsonToText(undefined as unknown as string)).toBe('');
  });

  test('壊れた JSON は空文字 (throw しない)', () => {
    expect(aliasesJsonToText('not-json')).toBe('');
  });

  test('文字列以外の要素は除外する', () => {
    expect(aliasesJsonToText('["foo", 1, null, "bar"]')).toBe('foo bar');
  });

  test('オブジェクトや配列以外の JSON は空文字', () => {
    expect(aliasesJsonToText('{"a": 1}')).toBe('');
    expect(aliasesJsonToText('"plain string"')).toBe('');
  });
});

describe('upsertEntityFts / deleteEntityFts', () => {
  const dbs: string[] = [];
  let db: MemoryDbConnection;
  let close: () => void;

  beforeEach(async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    const opened = await openMemoryCoreDb();
    db = opened.db;
    close = opened.close;
    db.run(
      `INSERT INTO memory_entities
        (id, type, canonical_name, display_name, summary, aliases_json,
         first_seen_at, last_updated_at, recorded_at)
       VALUES
        ('e1','Function','foo_bar','fooBar','foo bar function','["foo","bar"]',
         '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
    );
  });

  afterEach(() => {
    close();
  });

  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {
        // ignore
      }
    }
    delete process.env.MEMORY_CORE_DB_PATH;
  });

  test('upsert で FTS に display_name / summary / aliases が投入される', () => {
    upsertEntityFts(db, 'e1');
    const matchFoo = db.exec(
      `SELECT count(*) FROM memory_entities_fts WHERE memory_entities_fts MATCH 'foo'`,
    );
    expect(matchFoo[0]?.values[0][0]).toBeGreaterThan(0);
    const matchFn = db.exec(
      `SELECT count(*) FROM memory_entities_fts WHERE memory_entities_fts MATCH 'function'`,
    );
    expect(matchFn[0]?.values[0][0]).toBeGreaterThan(0);
  });

  test('同じ id への upsert は冪等 (重複しない)', () => {
    upsertEntityFts(db, 'e1');
    upsertEntityFts(db, 'e1');
    const count = db.exec(`SELECT count(*) FROM memory_entities_fts`);
    expect(count[0]?.values[0][0]).toBe(1);
  });

  test('存在しない id への upsert は何もしない', () => {
    expect(() => upsertEntityFts(db, 'nonexistent')).not.toThrow();
    const count = db.exec(`SELECT count(*) FROM memory_entities_fts`);
    expect(count[0]?.values[0][0]).toBe(0);
  });

  test('delete で FTS から除去される', () => {
    upsertEntityFts(db, 'e1');
    deleteEntityFts(db, 'e1');
    const matchFoo = db.exec(
      `SELECT count(*) FROM memory_entities_fts WHERE memory_entities_fts MATCH 'foo'`,
    );
    expect(matchFoo[0]?.values[0][0]).toBe(0);
  });

  test('存在しない id への delete は throw しない', () => {
    expect(() => deleteEntityFts(db, 'nonexistent')).not.toThrow();
  });
});

describe('upsertEpisodeFts / deleteEpisodeFts', () => {
  const dbs: string[] = [];
  let db: MemoryDbConnection;
  let close: () => void;

  beforeEach(async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    const opened = await openMemoryCoreDb();
    db = opened.db;
    close = opened.close;
    db.run(
      `INSERT INTO memory_episodes
        (id, session_id, message_uuid_start, message_uuid_end, agent_runtime, model,
         valid_from, recorded_at, raw_excerpt)
       VALUES ('ep1','sess-1','msg-start','msg-end','claude_code','sonnet',
         '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','The quick brown fox')`,
    );
  });

  afterEach(() => close());
  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
    delete process.env.MEMORY_CORE_DB_PATH;
  });

  test('upsert で raw_excerpt が FTS に入る', () => {
    upsertEpisodeFts(db, 'ep1');
    const r = db.exec(
      `SELECT count(*) FROM memory_episodes_fts WHERE memory_episodes_fts MATCH 'quick'`,
    );
    expect(r[0]?.values[0][0]).toBeGreaterThan(0);
  });

  test('delete で FTS から除去', () => {
    upsertEpisodeFts(db, 'ep1');
    deleteEpisodeFts(db, 'ep1');
    const r = db.exec(`SELECT count(*) FROM memory_episodes_fts`);
    expect(r[0]?.values[0][0]).toBe(0);
  });
});

describe('upsertDriftFts / deleteDriftFts', () => {
  const dbs: string[] = [];
  let db: MemoryDbConnection;
  let close: () => void;

  beforeEach(async () => {
    const tmpDb = makeTmpDb();
    dbs.push(tmpDb);
    process.env.MEMORY_CORE_DB_PATH = tmpDb;
    const opened = await openMemoryCoreDb();
    db = opened.db;
    close = opened.close;
    db.run(
      `INSERT INTO memory_entities
        (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
       VALUES ('subj','Concept','subj','subj',
         '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
    );
    db.run(
      `INSERT INTO memory_drift_events
        (id, subject_entity_id, predicate, drift_type, severity,
         conversation_value, spec_value, code_value, resolution_note, detected_at)
       VALUES ('d1','subj','returns','spec_vs_code','warn',
         'returns string','returns number','returns number','manual review',
         '2026-01-01T00:00:00.000Z')`,
    );
  });

  afterEach(() => close());
  afterAll(() => {
    for (const p of dbs) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
    delete process.env.MEMORY_CORE_DB_PATH;
  });

  test('upsert で predicate / values / note が FTS に入る', () => {
    upsertDriftFts(db, 'd1');
    const r = db.exec(
      `SELECT count(*) FROM memory_drift_events_fts WHERE memory_drift_events_fts MATCH 'returns'`,
    );
    expect(r[0]?.values[0][0]).toBeGreaterThan(0);
    const r2 = db.exec(
      `SELECT count(*) FROM memory_drift_events_fts WHERE memory_drift_events_fts MATCH 'manual'`,
    );
    expect(r2[0]?.values[0][0]).toBeGreaterThan(0);
  });

  test('delete で FTS から除去', () => {
    upsertDriftFts(db, 'd1');
    deleteDriftFts(db, 'd1');
    const r = db.exec(`SELECT count(*) FROM memory_drift_events_fts`);
    expect(r[0]?.values[0][0]).toBe(0);
  });
});
