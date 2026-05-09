import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { runMigrations } from '../../src/db/migrations/runner';
import { detectRecurringQuestions } from '../../src/drift/recurringQuestions';
import type { MemoryLogger } from '../../src/logger';

const silentLogger: MemoryLogger = { info: () => {}, error: () => {} };
let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs();
});

function makeDb(): Database {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

const TS = '2026-01-01T00:00:00.000Z';
let seq = 0;

/** Create a Float32Array embedding of length 4, normalized */
function makeEmbedding(values: [number, number, number, number]): Uint8Array {
  const arr = new Float32Array(values);
  const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
  for (let i = 0; i < arr.length; i++) arr[i] /= norm;
  return new Uint8Array(arr.buffer);
}

function insertQuestion(
  db: Database,
  opts: {
    id?: string;
    embedding: Uint8Array;
    targetSpecPath?: string | null;
    targetSymbol?: string | null;
    lastUpdatedAt?: string;
  },
): string {
  const eid = opts.id ?? `q-${++seq}`;
  const attrs: Record<string, unknown> = {};
  if (opts.targetSpecPath != null) attrs['target_spec_path'] = opts.targetSpecPath;
  if (opts.targetSymbol != null) attrs['target_symbol'] = opts.targetSymbol;

  db.run(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at,
        attributes_json, embedding)
     VALUES (?, 'Question', ?, ?, ?, ?, ?, ?, ?)`,
    [eid, eid, eid, TS, opts.lastUpdatedAt ?? TS, TS, JSON.stringify(attrs), opts.embedding],
  );
  return eid;
}

describe('detectRecurringQuestions', () => {
  it('I15: 同 target_spec_path 2 件 + cosine >= threshold → spec_clarification_recurring 1 件', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    // Nearly identical embeddings → cosine ~ 1
    const emb1 = makeEmbedding([1, 0, 0, 0]);
    const emb2 = makeEmbedding([0.99, 0.14, 0, 0]);

    insertQuestion(db, { embedding: emb1, targetSpecPath: 'spec/api.md', lastUpdatedAt: recent });
    insertQuestion(db, { embedding: emb2, targetSpecPath: 'spec/api.md', lastUpdatedAt: recent });

    const results = detectRecurringQuestions({
      db,
      windowDays: 90,
      minCount: 2,
      cosineThreshold: 0.8,
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('spec_clarification_recurring');
    expect(results[0].severity).toBe('warn');
    expect((results[0].detail['target_spec_path'] as string)).toBe('spec/api.md');
  });

  it('cosine < threshold → 検知なし', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    // Orthogonal embeddings → cosine = 0
    const emb1 = makeEmbedding([1, 0, 0, 0]);
    const emb2 = makeEmbedding([0, 1, 0, 0]);

    insertQuestion(db, { embedding: emb1, targetSpecPath: 'spec/api.md', lastUpdatedAt: recent });
    insertQuestion(db, { embedding: emb2, targetSpecPath: 'spec/api.md', lastUpdatedAt: recent });

    const results = detectRecurringQuestions({
      db,
      windowDays: 90,
      minCount: 2,
      cosineThreshold: 0.8,
      logger: silentLogger,
    });

    expect(results).toHaveLength(0);
  });

  it('minCount 未満 (1 件のみ) → 検知なし', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    const emb1 = makeEmbedding([1, 0, 0, 0]);
    insertQuestion(db, { embedding: emb1, targetSpecPath: 'spec/single.md', lastUpdatedAt: recent });

    const results = detectRecurringQuestions({
      db,
      windowDays: 90,
      minCount: 2,
      cosineThreshold: 0.8,
      logger: silentLogger,
    });

    expect(results).toHaveLength(0);
  });

  it('target_spec_path も target_symbol も null → スキップ', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    const emb = makeEmbedding([1, 0, 0, 0]);
    insertQuestion(db, { embedding: emb, targetSpecPath: null, targetSymbol: null, lastUpdatedAt: recent });
    insertQuestion(db, { embedding: emb, targetSpecPath: null, targetSymbol: null, lastUpdatedAt: recent });

    const results = detectRecurringQuestions({
      db,
      windowDays: 90,
      minCount: 2,
      cosineThreshold: 0.8,
      logger: silentLogger,
    });

    expect(results).toHaveLength(0);
  });

  it('windowDays 外の question → 検知なし', () => {
    const db = makeDb();
    // TS is 2026-01-01, windowDays=30 → only detect if last_updated_at within 30 days
    const emb1 = makeEmbedding([1, 0, 0, 0]);
    const emb2 = makeEmbedding([0.99, 0.14, 0, 0]);
    insertQuestion(db, { embedding: emb1, targetSpecPath: 'spec/old.md', lastUpdatedAt: TS });
    insertQuestion(db, { embedding: emb2, targetSpecPath: 'spec/old.md', lastUpdatedAt: TS });

    const results = detectRecurringQuestions({
      db,
      windowDays: 30,
      minCount: 2,
      cosineThreshold: 0.8,
      logger: silentLogger,
    });

    expect(results).toHaveLength(0);
  });

  it('target_symbol で grouping → spec_clarification_recurring 検知', () => {
    const db = makeDb();
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 5);
    const recent = recentDate.toISOString().replace(/\.\d{3}Z$/, '.000Z');

    const emb1 = makeEmbedding([1, 0, 0, 0]);
    const emb2 = makeEmbedding([0.99, 0.14, 0, 0]);
    insertQuestion(db, { embedding: emb1, targetSpecPath: null, targetSymbol: 'MyClass', lastUpdatedAt: recent });
    insertQuestion(db, { embedding: emb2, targetSpecPath: null, targetSymbol: 'MyClass', lastUpdatedAt: recent });

    const results = detectRecurringQuestions({
      db,
      windowDays: 90,
      minCount: 2,
      cosineThreshold: 0.8,
      logger: silentLogger,
    });

    expect(results).toHaveLength(1);
    expect(results[0].drift_type).toBe('spec_clarification_recurring');
    expect((results[0].detail['group_key'] as string)).toBe('symbol:MyClass');
  });
});
