/**
 * Tests for src/ingest/conversation/persist.ts
 *
 * persistEpisodeFacts の entity upsert・edge 挿入・
 * questions 処理・エラーハンドリング・冪等性を検証する。
 */
import { BetterSqlite3CaravanDb } from '../../../src/db/connection/BetterSqlite3CaravanDb';
import { runMigrations } from '../../../src/db/migrations/runner';
import { persistEpisodeFacts, episodeId } from '../../../src/ingest/conversation/persist';
import type { Episode } from '../../../src/canonical/splitEpisodes';
import type { ExtractionResult } from '../../../src/ingest/conversation/extractFacts';
import type { CaravanLogger } from '../../../src/logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TS = '2026-05-01T00:00:00.000Z';

function makeDb(): BetterSqlite3CaravanDb {
  const db = BetterSqlite3CaravanDb.openInCaravan();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeLogger(): CaravanLogger & { errors: unknown[]; warns: string[] } {
  const errors: unknown[] = [];
  const warns: string[] = [];
  return {
    info: jest.fn(),
    error: jest.fn((_msg: string, err?: unknown) => { errors.push(err); }),
    warn: jest.fn((msg: string) => { warns.push(msg); }),
    errors,
    warns,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    session_id: 'session-test-001',
    message_uuid_start: '550e8400-e29b-41d4-a716-446655440000',
    message_uuid_end: '550e8400-e29b-41d4-a716-446655440001',
    valid_from: TS,
    raw_excerpt: 'Test episode content',
    ...overrides,
  };
}

function makeExtracted(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    summary: '',
    entities: [],
    relations: [],
    questions: [],
    ...overrides,
  };
}

function countRows(db: BetterSqlite3CaravanDb, table: string): number {
  const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
  return result[0]?.values[0][0] as number;
}

// ── episodeId ─────────────────────────────────────────────────────────────────

describe('episodeId', () => {
  test('is deterministic for same inputs', () => {
    const id1 = episodeId('session-abc', 'uuid-start-001');
    const id2 = episodeId('session-abc', 'uuid-start-001');
    expect(id1).toBe(id2);
  });

  test('differs for different session_id', () => {
    const id1 = episodeId('session-a', 'same-uuid');
    const id2 = episodeId('session-b', 'same-uuid');
    expect(id1).not.toBe(id2);
  });

  test('differs for different message_uuid_start', () => {
    const id1 = episodeId('same-session', 'uuid-001');
    const id2 = episodeId('same-session', 'uuid-002');
    expect(id1).not.toBe(id2);
  });
});

// ── persistEpisodeFacts ───────────────────────────────────────────────────────

describe('persistEpisodeFacts', () => {
  test('empty extraction → inserts 1 episode row, 0 entities, 0 edges', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode = makeEpisode();
      const extracted = makeExtracted();

      const stats = persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });

      expect(stats.entities_inserted).toBe(0);
      expect(stats.entities_updated).toBe(0);
      expect(stats.edges_inserted).toBe(0);
      expect(stats.edges_invalidated).toBe(0);

      // episode row must be inserted
      expect(countRows(db, 'caravan_episodes')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('2 entities → entities_inserted=2, episode_entities=2', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode = makeEpisode();
      const extracted = makeExtracted({
        entities: [
          { type: 'Package', name: 'trail-caravan-book', aliases: [], tags: [], attributes: {} },
          { type: 'Tool', name: 'claude-code', aliases: [], tags: [], attributes: {} },
        ],
      });

      const stats = persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });

      expect(stats.entities_inserted).toBe(2);
      expect(stats.entities_updated).toBe(0);
      expect(countRows(db, 'caravan_entities')).toBe(2);
      expect(countRows(db, 'caravan_episode_entities')).toBe(2);
    } finally {
      db.close();
    }
  });

  test('second call with same entity → entities_updated=1', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode1 = makeEpisode({ message_uuid_start: 'uuid-ep1-000' });
      const episode2 = makeEpisode({ message_uuid_start: 'uuid-ep2-000' });
      const extracted = makeExtracted({
        entities: [{ type: 'Package', name: 'trail-caravan-book', aliases: [], tags: [], attributes: {} }],
      });

      const s1 = persistEpisodeFacts({ db, episode: episode1, extracted, recordedAt: TS, logger });
      expect(s1.entities_inserted).toBe(1);

      const s2 = persistEpisodeFacts({ db, episode: episode2, extracted, recordedAt: TS, logger });
      expect(s2.entities_updated).toBe(1);
      expect(s2.entities_inserted).toBe(0);

      // Still only 1 entity (upsert)
      expect(countRows(db, 'caravan_entities')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('relation → edge inserted for known entities', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode = makeEpisode();
      const extracted = makeExtracted({
        entities: [
          { type: 'Package', name: 'trail-caravan-book', aliases: [], tags: [], attributes: {} },
          { type: 'Library', name: 'better-sqlite3', aliases: [], tags: [], attributes: {} },
        ],
        relations: [
          {
            subject: { type: 'Package', name: 'trail-caravan-book' },
            predicate: 'depends_on',
            object: { type: 'Library', name: 'better-sqlite3' },
          },
        ],
      });

      const stats = persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });

      expect(stats.edges_inserted).toBe(1);

      const edgeRows = db.exec(`SELECT predicate, source_type FROM caravan_edges`);
      expect(edgeRows[0]?.values).toHaveLength(1);
      expect(edgeRows[0].values[0][0]).toBe('depends_on');
      expect(edgeRows[0].values[0][1]).toBe('conversation');
    } finally {
      db.close();
    }
  });

  test('relation with auto-upserted endpoint not in entities[]', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode = makeEpisode();
      const extracted = makeExtracted({
        entities: [
          { type: 'Package', name: 'trail-caravan-book', aliases: [], tags: [], attributes: {} },
        ],
        relations: [
          {
            subject: { type: 'Package', name: 'trail-caravan-book' },
            predicate: 'uses',
            object: { type: 'Library', name: 'auto-upserted-lib' }, // not in entities[]
          },
        ],
      });

      const stats = persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });

      expect(stats.edges_inserted).toBe(1);

      // auto-upserted-lib entity should exist
      const entRows = db.exec(
        `SELECT type, canonical_name FROM caravan_entities WHERE canonical_name = ?`,
        ['auto-upserted-lib'],
      );
      expect(entRows[0]?.values).toHaveLength(1);
      expect(entRows[0].values[0][0]).toBe('Library');
    } finally {
      db.close();
    }
  });

  test('question entity → asked_by edge のみ（answered_in は書かない）', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode = makeEpisode({ session_id: 'session-q-test' });
      const extracted = makeExtracted({
        questions: [{ text: 'What is the memory architecture?' }],
      });

      const stats = persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });

      // 人間の発言だけを取り込むため回答は episode 内に無い。answered_in は書かない。
      expect(stats.edges_inserted).toBe(1);

      const edgeRows = db.exec(
        `SELECT predicate FROM caravan_edges ORDER BY predicate`,
      );
      const predicates = edgeRows[0]?.values.map((r) => r[0]);
      expect(predicates).toContain('asked_by');
      expect(predicates).not.toContain('answered_in');

      // Question entity exists
      const qRows = db.exec(
        `SELECT type FROM caravan_entities WHERE type = 'Question'`,
      );
      expect(qRows[0]?.values).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  test('idempotency: same episode twice → ON CONFLICT DO UPDATE, no duplicate episodes', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode = makeEpisode();
      const extracted = makeExtracted({
        entities: [{ type: 'Package', name: 'test-pkg', aliases: [], tags: [], attributes: {} }],
      });

      persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });
      persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });

      expect(countRows(db, 'caravan_episodes')).toBe(1);
      expect(countRows(db, 'caravan_entities')).toBe(1);
    } finally {
      db.close();
    }
  });

  test('single_active rule invalidates older asked_by edge when same question asked again', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();

      // 'asked_by' は single_active predicate (001_initial.sql で登録済み)
      // Episode 1: Question asked
      const episode1 = makeEpisode({
        session_id: 'session-q-single',
        message_uuid_start: 'uuid-e1-qqq',
        valid_from: '2026-04-01T00:00:00.000Z',
      });
      const extracted = makeExtracted({
        questions: [{ text: 'What is the correct approach here?' }],
      });

      const s1 = persistEpisodeFacts({ db, episode: episode1, extracted, recordedAt: TS, logger });
      // asked_by のみ
      expect(s1.edges_inserted).toBeGreaterThanOrEqual(1);

      // Episode 2: same question again in a new episode
      const episode2 = makeEpisode({
        session_id: 'session-q-single',
        message_uuid_start: 'uuid-e2-qqq',
        valid_from: '2026-05-01T00:00:00.000Z',
      });
      const s2 = persistEpisodeFacts({ db, episode: episode2, extracted, recordedAt: TS, logger });
      expect(s2.edges_inserted).toBeGreaterThanOrEqual(1);
      // asked_by is single_active → older edge invalidated
      expect(s2.edges_invalidated).toBeGreaterThanOrEqual(1);
    } finally {
      db.close();
    }
  });

  test('multiple entities and relations → correct episode_entities count', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode = makeEpisode();
      const extracted = makeExtracted({
        entities: [
          { type: 'Package', name: 'pkg-1', aliases: [], tags: [], attributes: {} },
          { type: 'Package', name: 'pkg-2', aliases: [], tags: [], attributes: {} },
          { type: 'Concept', name: 'concept-x', aliases: [], tags: [], attributes: {} },
        ],
        relations: [
          {
            subject: { type: 'Package', name: 'pkg-1' },
            predicate: 'uses',
            object: { type: 'Concept', name: 'concept-x' },
          },
        ],
      });

      const stats = persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });

      expect(stats.entities_inserted).toBe(3);
      expect(stats.edges_inserted).toBe(1);
      // episode_entities: 3 entities (pkg-1, pkg-2, concept-x)
      expect(countRows(db, 'caravan_episode_entities')).toBe(3);
    } finally {
      db.close();
    }
  });

  test('ollama summary is persisted to caravan_episodes.summary', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode = makeEpisode();
      const extracted = makeExtracted({ summary: 'ユーザーは ollama 要約の保存有無を調査した。' });

      persistEpisodeFacts({ db, episode, extracted, recordedAt: TS, logger });

      const epId = episodeId(episode.session_id, episode.message_uuid_start);
      const rows = db.exec(`SELECT summary FROM caravan_episodes WHERE id = ?`, [epId]);
      expect(rows[0]?.values[0][0]).toBe('ユーザーは ollama 要約の保存有無を調査した。');
    } finally {
      db.close();
    }
  });

  test('episode summary is updated on conflict (re-ingest refreshes summary)', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode1 = makeEpisode({ message_uuid_end: 'end-uuid-s1' });
      persistEpisodeFacts({
        db,
        episode: episode1,
        extracted: makeExtracted({ summary: '初回要約' }),
        recordedAt: TS,
        logger,
      });

      const episode2 = makeEpisode({ message_uuid_end: 'end-uuid-s2' });
      persistEpisodeFacts({
        db,
        episode: episode2,
        extracted: makeExtracted({ summary: '更新後要約' }),
        recordedAt: TS,
        logger,
      });

      const epId = episodeId(episode1.session_id, episode1.message_uuid_start);
      const rows = db.exec(`SELECT summary FROM caravan_episodes WHERE id = ?`, [epId]);
      expect(rows[0]?.values[0][0]).toBe('更新後要約');
    } finally {
      db.close();
    }
  });

  test('empty summary on re-ingest does NOT overwrite existing summary', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode1 = makeEpisode({ message_uuid_end: 'end-uuid-p1' });
      persistEpisodeFacts({
        db,
        episode: episode1,
        extracted: makeExtracted({ summary: '良い要約' }),
        recordedAt: TS,
        logger,
      });

      // 再 ingest で LLM が summary を省略（空文字）
      const episode2 = makeEpisode({ message_uuid_end: 'end-uuid-p2' });
      persistEpisodeFacts({
        db,
        episode: episode2,
        extracted: makeExtracted({ summary: '' }),
        recordedAt: TS,
        logger,
      });

      const epId = episodeId(episode1.session_id, episode1.message_uuid_start);
      const rows = db.exec(`SELECT summary, message_uuid_end FROM caravan_episodes WHERE id = ?`, [epId]);
      // summary は温存、他カラム（message_uuid_end）は更新される
      expect(rows[0]?.values[0][0]).toBe('良い要約');
      expect(rows[0]?.values[0][1]).toBe('end-uuid-p2');
    } finally {
      db.close();
    }
  });

  test('episode raw_excerpt is updated on conflict', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const episode1 = makeEpisode({ raw_excerpt: 'first excerpt', message_uuid_end: 'end-uuid-a' });
      persistEpisodeFacts({ db, episode: episode1, extracted: makeExtracted(), recordedAt: TS, logger });

      const episode2 = makeEpisode({ raw_excerpt: 'updated excerpt', message_uuid_end: 'end-uuid-b' });
      persistEpisodeFacts({ db, episode: episode2, extracted: makeExtracted(), recordedAt: TS, logger });

      const epId = episodeId(episode1.session_id, episode1.message_uuid_start);
      const rows = db.exec(
        `SELECT raw_excerpt, message_uuid_end FROM caravan_episodes WHERE id = ?`,
        [epId],
      );
      expect(rows[0]?.values[0][0]).toBe('updated excerpt');
      expect(rows[0]?.values[0][1]).toBe('end-uuid-b');
    } finally {
      db.close();
    }
  });
});

// ── 低情報エンティティの取込抑制（T-21 リグレッション） ─────────────────────

describe('persistEpisodeFacts low-information entity suppression', () => {
  test('placeholder-named entities are not inserted and are counted as suppressed', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const extracted = makeExtracted({
        entities: [
          { type: 'Bug', name: '不明のバグ', aliases: [], tags: [], attributes: {} },
          { type: 'Concept', name: 'undefined', aliases: [], tags: [], attributes: {} },
          { type: 'File', name: 'packages/trail-caravan-book/src/ingest/conversation/persist.ts', aliases: [], tags: [], attributes: {} },
        ],
      });
      const stats = persistEpisodeFacts({ db, episode: makeEpisode(), extracted, recordedAt: TS, logger });

      expect(countRows(db, 'caravan_entities')).toBe(1);
      expect(stats.entities_inserted).toBe(1);
      expect(stats.entities_suppressed).toBe(2);
      const rows = db.exec(`SELECT display_name FROM caravan_entities`);
      expect(rows[0]?.values[0][0]).toBe('packages/trail-caravan-book/src/ingest/conversation/persist.ts');
    } finally {
      db.close();
    }
  });

  test('specific names containing a generic word are NOT suppressed', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const extracted = makeExtracted({
        entities: [
          { type: 'Bug', name: 'FTS5 の一括 rowid 削除で DB が破損するバグ', aliases: [], tags: [], attributes: {} },
        ],
      });
      const stats = persistEpisodeFacts({ db, episode: makeEpisode(), extracted, recordedAt: TS, logger });

      expect(stats.entities_inserted).toBe(1);
      expect(stats.entities_suppressed).toBe(0);
    } finally {
      db.close();
    }
  });

  test('edges with a low-information endpoint are skipped without auto-upserting the endpoint', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const extracted = makeExtracted({
        entities: [
          { type: 'File', name: 'src/a.ts', aliases: [], tags: [], attributes: {} },
        ],
        relations: [
          {
            subject: { type: 'File', name: 'src/a.ts' },
            predicate: 'relates_to',
            object: { type: 'Bug', name: '不明のバグ' },
            confidence: 0.8,
          },
          {
            subject: { type: 'Bug', name: '未命名のバグ' },
            predicate: 'affects',
            object: { type: 'File', name: 'src/a.ts' },
            confidence: 0.8,
          },
        ],
      });
      const stats = persistEpisodeFacts({ db, episode: makeEpisode(), extracted, recordedAt: TS, logger });

      // 端点の片割れ（低情報）は auto-upsert されず、エッジ自体も入らない
      expect(countRows(db, 'caravan_entities')).toBe(1);
      expect(countRows(db, 'caravan_edges')).toBe(0);
      expect(stats.edges_inserted).toBe(0);
      expect(stats.edges_suppressed).toBe(2);
    } finally {
      db.close();
    }
  });

  test('questions with placeholder text are not inserted as Question entities', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const extracted = makeExtracted({
        questions: [
          { text: '不明' },
          { text: 'FTS5 の再構築はどのタイミングで走らせるべきか' },
        ],
      });
      const stats = persistEpisodeFacts({ db, episode: makeEpisode(), extracted, recordedAt: TS, logger });

      const rows = db.exec(`SELECT display_name FROM caravan_entities WHERE type = 'Question'`);
      expect(rows[0]?.values.length ?? 0).toBe(1);
      expect(rows[0]?.values[0][0]).toBe('FTS5 の再構築はどのタイミングで走らせるべきか');
      expect(stats.entities_suppressed).toBe(1);
    } finally {
      db.close();
    }
  });

  test('suppressed entities never appear in caravan_episode_entities', () => {
    const db = makeDb();
    try {
      const logger = makeLogger();
      const extracted = makeExtracted({
        entities: [
          { type: 'Bug', name: '不明のバグ', aliases: [], tags: [], attributes: {} },
          { type: 'File', name: 'src/a.ts', aliases: [], tags: [], attributes: {} },
        ],
      });
      persistEpisodeFacts({ db, episode: makeEpisode(), extracted, recordedAt: TS, logger });

      expect(countRows(db, 'caravan_episode_entities')).toBe(1);
    } finally {
      db.close();
    }
  });
});
