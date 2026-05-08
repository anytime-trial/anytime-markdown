/**
 * E2E tests for memory-core Phase 1.
 *
 * These tests spin up:
 *   - An in-memory sql.js "trail DB" with synthetic messages
 *   - An in-process mock HTTP server standing in for Ollama
 *   - The full runConversationIncremental pipeline
 *
 * No filesystem writes are performed (all DBs live in WASM memory).
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { startMockOllama, type MockOllamaServer } from './mockOllama';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { runConversationIncremental } from '../../src/pipeline/runConversationIncremental';
import { createOllamaClient } from '../../src/ollama/client';
import type { MemoryCoreDb } from '../../src/db/connection';
import type { MemoryLogger } from '../../src/logger';

// ── Helpers ──────────────────────────────────────────────────────────────────

const silentLogger: MemoryLogger = {
  info: () => {},
  error: () => {},
};

function makeTrailDb(SQL: SqlJsStatic): Database {
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE sessions (
    id        TEXT PRIMARY KEY,
    slug      TEXT NOT NULL DEFAULT '',
    repo_name TEXT NOT NULL DEFAULT '',
    source    TEXT NOT NULL DEFAULT 'claude_code'
              CHECK (source IN ('claude_code','codex','gemini','cursor','other'))
  ) STRICT`);
  db.run(`CREATE TABLE messages (
    uuid            TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    timestamp       TEXT,
    message_excerpt TEXT
  ) STRICT`);
  return db;
}

function insertSession(trailDb: Database, id: string): void {
  trailDb.run(`INSERT INTO sessions (id) VALUES (?)`, [id]);
}

function insertMessage(
  trailDb: Database,
  uuid: string,
  sessionId: string,
  type: string,
  timestamp: string,
  excerpt: string
): void {
  trailDb.run(
    `INSERT INTO messages (uuid, session_id, type, timestamp, message_excerpt)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid, sessionId, type, timestamp, excerpt]
  );
}

/** Opens an in-memory memory-core DB without touching the filesystem. */
async function makeMemoryDb(): Promise<MemoryCoreDb> {
  const SQL = await initSqlJs();
  const rawDb = new SQL.Database();
  rawDb.run('PRAGMA foreign_keys = ON');

  // Run migrations manually (same as openMemoryCoreDb)
  const { runMigrations } = await import('../../src/db/migrations/runner');
  runMigrations(rawDb);

  return {
    db: rawDb,
    save(): void {
      // noop — no filesystem writes in tests
    },
    close(): void {
      rawDb.close();
    },
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('E2E: runConversationIncremental', () => {
  let SQL: SqlJsStatic;
  let mockServer: MockOllamaServer;

  beforeAll(async () => {
    SQL = await initSqlJs();
    mockServer = await startMockOllama();
  });

  afterAll(async () => {
    await mockServer.close();
  });

  // ── E1: multi-session, multi-episode, incremental cursor advance ──────────
  /**
   * Scenario E1 – Two independent sessions, each producing one episode.
   *
   * The pipeline processes both in a single runConversationIncremental call,
   * then a second run sees no new messages (idempotency / cursor advance).
   *
   * Session A: user prefers Library/TypeScript
   * Session B: user uses Package/ESLint
   *
   * Verifies:
   *   - 2 episodes processed
   *   - entities_inserted ≥ 4 (Person + target entities for both sessions)
   *   - edges_inserted = 2 (one per session)
   *   - edges_invalidated = 0 (both are multiple_active predicates)
   *   - pipeline_state.last_processed_at is advanced
   *   - Second run processes 0 items (cursor correctly advanced)
   */
  test(
    'E1: two sessions processed in one run — 2 edges, cursor advances, second run is no-op',
    async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb(SQL);

      // Session A messages
      insertSession(trailDb, 'sess-a');
      insertMessage(trailDb, 'a-msg1', 'sess-a', 'user',      '2026-01-01T00:00:00.000Z', 'I prefer TypeScript');
      insertMessage(trailDb, 'a-msg2', 'sess-a', 'assistant', '2026-01-01T00:00:30.000Z', 'Noted, TypeScript it is.');

      // Session B messages — later timestamps
      insertSession(trailDb, 'sess-b');
      insertMessage(trailDb, 'b-msg1', 'sess-b', 'user',      '2026-01-01T01:00:00.000Z', 'We use ESLint in this project');
      insertMessage(trailDb, 'b-msg2', 'sess-b', 'assistant', '2026-01-01T01:00:30.000Z', 'Got it, ESLint is configured.');

      attachTrailDbFromHandle(memDb.db, trailDb);

      const sessAResponse = JSON.stringify({
        summary: 'User prefers TypeScript',
        entities: [
          { type: 'Person',  name: 'user',       aliases: [], tags: [], attributes: {} },
          { type: 'Library', name: 'TypeScript',  aliases: [], tags: [], attributes: {} },
        ],
        relations: [
          {
            subject: { type: 'Person',  name: 'user' },
            predicate: 'prefers',
            object:  { type: 'Library', name: 'TypeScript' },
          },
        ],
        questions: [],
      });

      const sessBResponse = JSON.stringify({
        summary: 'Project uses ESLint',
        entities: [
          { type: 'Project', name: 'current project', aliases: [], tags: [], attributes: {} },
          { type: 'Package', name: 'ESLint',           aliases: [], tags: [], attributes: {} },
        ],
        relations: [
          {
            subject: { type: 'Project', name: 'current project' },
            predicate: 'uses',
            object:  { type: 'Package', name: 'ESLint' },
          },
        ],
        questions: [],
      });

      mockServer.setResponses([
        { generate: sessAResponse },
        { generate: sessBResponse },
      ]);

      const ollama = createOllamaClient({ baseUrl: mockServer.baseUrl });

      // ── First run ────────────────────────────────────────────────────────
      const result1 = await runConversationIncremental({
        db: memDb.db,
        ollama,
        logger: silentLogger,
      });

      expect(result1.status).toBe('success');
      expect(result1.items_processed).toBe(2);
      expect(result1.entities_inserted).toBe(4);  // user + TypeScript + currentproject + ESLint
      expect(result1.edges_inserted).toBe(2);
      expect(result1.edges_invalidated).toBe(0);
      expect(result1.items_failed).toBe(0);

      // Verify both active edges exist
      const edgeRows = memDb.db.exec(
        `SELECT predicate, valid_to FROM memory_edges WHERE valid_to IS NULL ORDER BY predicate`
      );
      const activeEdges = edgeRows[0]?.values ?? [];
      expect(activeEdges).toHaveLength(2);
      expect(activeEdges.some((r) => r[0] === 'prefers')).toBe(true);
      expect(activeEdges.some((r) => r[0] === 'uses')).toBe(true);

      // pipeline_state advanced
      const stateRows1 = memDb.db.exec(
        `SELECT last_processed_at, status FROM memory_pipeline_state WHERE scope = 'conversation_incremental'`
      );
      const [lastAt1, status1] = stateRows1[0].values[0] as [string, string];
      expect(status1).toBe('idle');
      expect(lastAt1 > '2026-01-01T01:00:00.000Z').toBe(true);

      // ── Second run (no new messages) ─────────────────────────────────────
      // Set a fresh response in case the mock is accidentally called
      mockServer.setResponses([
        { generate: JSON.stringify({ summary: 'should not be called', entities: [], relations: [], questions: [] }) },
      ]);

      const result2 = await runConversationIncremental({
        db: memDb.db,
        ollama,
        logger: silentLogger,
      });

      expect(result2.status).toBe('success');
      expect(result2.items_processed).toBe(0);
      expect(result2.entities_inserted).toBe(0);
      expect(result2.edges_inserted).toBe(0);

      // pipeline_state cursor must not have regressed
      const stateRows2 = memDb.db.exec(
        `SELECT last_processed_at FROM memory_pipeline_state WHERE scope = 'conversation_incremental'`
      );
      const lastAt2 = stateRows2[0].values[0][0] as string;
      expect(lastAt2).toBe(lastAt1);

      trailDb.close();
      memDb.close();
    },
    30000
  );

  // ── E1b: single_active predicate invalidation (replaces) ─────────────────
  /**
   * Scenario E1b — single_active invalidation via 'replaces' predicate.
   *
   * One session with 2 user-led episodes:
   *   Episode 1: Tool/React replaces Tool/Angular
   *   Episode 2: Tool/React replaces Tool/Bootstrap
   *
   * Because 'replaces' is single_active, the second insert must invalidate
   * the first: Angular edge gets valid_to set, Bootstrap edge stays active,
   * memory_edge_invalidations has 1 row.
   */
  test(
    'E1b: single_active invalidation — replaces predicate sets valid_to on old edge',
    async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb(SQL);

      const t1 = '2026-03-01T00:00:00.000Z';
      const t2 = '2026-03-01T00:00:30.000Z';
      const t3 = '2026-03-01T00:01:00.000Z';
      const t4 = '2026-03-01T00:01:30.000Z';

      insertSession(trailDb, 'sess-inv');
      insertMessage(trailDb, 'inv-msg1', 'sess-inv', 'user',      t1, 'React replaces Angular');
      insertMessage(trailDb, 'inv-msg2', 'sess-inv', 'assistant', t2, 'Noted.');
      insertMessage(trailDb, 'inv-msg3', 'sess-inv', 'user',      t3, 'React replaces Bootstrap');
      insertMessage(trailDb, 'inv-msg4', 'sess-inv', 'assistant', t4, 'Noted.');

      attachTrailDbFromHandle(memDb.db, trailDb);

      const ep1Response = JSON.stringify({
        summary: 'React replaces Angular',
        entities: [
          { type: 'Tool', name: 'React',   aliases: [], tags: [], attributes: {} },
          { type: 'Tool', name: 'Angular', aliases: [], tags: [], attributes: {} },
        ],
        relations: [{
          subject: { type: 'Tool', name: 'React' },
          predicate: 'replaces',
          object:   { type: 'Tool', name: 'Angular' },
        }],
        questions: [],
      });

      const ep2Response = JSON.stringify({
        summary: 'React replaces Bootstrap',
        entities: [
          { type: 'Tool', name: 'React',     aliases: [], tags: [], attributes: {} },
          { type: 'Tool', name: 'Bootstrap', aliases: [], tags: [], attributes: {} },
        ],
        relations: [{
          subject: { type: 'Tool', name: 'React' },
          predicate: 'replaces',
          object:   { type: 'Tool', name: 'Bootstrap' },
        }],
        questions: [],
      });

      mockServer.setResponses([
        { generate: ep1Response },
        { generate: ep2Response },
      ]);

      const ollama = createOllamaClient({ baseUrl: mockServer.baseUrl });
      const result = await runConversationIncremental({
        db: memDb.db,
        ollama,
        logger: silentLogger,
      });

      expect(result.status).toBe('success');
      expect(result.items_processed).toBe(2);
      expect(result.edges_inserted).toBe(2);
      expect(result.edges_invalidated).toBe(1);

      // Angular edge: valid_to IS NOT NULL (invalidated)
      const invalidated = memDb.db.exec(
        `SELECT me.valid_to
         FROM memory_edges me
         JOIN memory_entities obj ON obj.id = me.object_entity_id
         WHERE me.predicate = 'replaces' AND obj.canonical_name = 'angular'`
      );
      expect(invalidated[0]?.values).toHaveLength(1);
      expect(invalidated[0].values[0][0]).not.toBeNull();

      // Bootstrap edge: valid_to IS NULL (active)
      const active = memDb.db.exec(
        `SELECT me.valid_to
         FROM memory_edges me
         JOIN memory_entities obj ON obj.id = me.object_entity_id
         WHERE me.predicate = 'replaces' AND obj.canonical_name = 'bootstrap'`
      );
      expect(active[0]?.values).toHaveLength(1);
      expect(active[0].values[0][0]).toBeNull();

      // memory_edge_invalidations has 1 row
      const invRows = memDb.db.exec(`SELECT COUNT(*) FROM memory_edge_invalidations`);
      expect(invRows[0].values[0][0]).toBe(1);

      trailDb.close();
      memDb.close();
    },
    30000
  );

  // ── E2: acceptance — prefers edge created ────────────────────────────────
  /**
   * Scenario E2 – §10.7 acceptance test.
   *
   * A single user message mentions "Conventional Commits". The pipeline
   * must create:
   *   – A Concept entity with canonical_name containing 'conventional'
   *   – An active 'prefers' edge (multiple_active — not invalidated)
   *   – pipeline_state.last_processed_at is advanced past the epoch default
   */
  test(
    'E2: prefers Concept/ConventionalCommits — edge active, pipeline_state advanced',
    async () => {
      const memDb = await makeMemoryDb();
      const trailDb = makeTrailDb(SQL);

      const t1 = '2026-02-01T10:00:00.000Z';
      const t2 = '2026-02-01T10:00:30.000Z';

      insertSession(trailDb, 'sess-e2');
      insertMessage(
        trailDb,
        'msg-e2-1',
        'sess-e2',
        'user',
        t1,
        'I prefer Conventional Commits for commit messages.'
      );
      insertMessage(
        trailDb,
        'msg-e2-2',
        'sess-e2',
        'assistant',
        t2,
        'Got it. I will follow Conventional Commits.'
      );

      attachTrailDbFromHandle(memDb.db, trailDb);

      const ep1Response = JSON.stringify({
        summary: 'User prefers Conventional Commits',
        entities: [
          { type: 'Person',  name: 'user',                 aliases: [], tags: [], attributes: {} },
          { type: 'Concept', name: 'Conventional Commits', aliases: [], tags: [], attributes: {} },
        ],
        relations: [
          {
            subject: { type: 'Person',  name: 'user' },
            predicate: 'prefers',
            object:  { type: 'Concept', name: 'Conventional Commits' },
          },
        ],
        questions: [],
      });

      mockServer.setResponses([{ generate: ep1Response }]);

      const ollama = createOllamaClient({ baseUrl: mockServer.baseUrl });

      const result = await runConversationIncremental({
        db: memDb.db,
        ollama,
        logger: silentLogger,
      });

      expect(result.status).toBe('success');
      expect(result.entities_inserted).toBe(2);  // Person + Concept
      expect(result.edges_inserted).toBe(1);
      expect(result.edges_invalidated).toBe(0);  // prefers is multiple_active

      // Concept entity exists with 'conventional' in canonical_name
      const entRows = memDb.db.exec(
        `SELECT canonical_name FROM memory_entities
         WHERE type = 'Concept' AND canonical_name LIKE '%conventional%'`
      );
      expect(entRows[0]?.values).toHaveLength(1);
      const canonName = entRows[0].values[0][0] as string;
      expect(canonName).toContain('conventional');

      // The 'prefers' edge is active (valid_to IS NULL)
      const edgeRows = memDb.db.exec(
        `SELECT me.valid_to
         FROM memory_edges me
         JOIN memory_entities subj ON subj.id = me.subject_entity_id
         JOIN memory_entities obj  ON obj.id  = me.object_entity_id
         WHERE subj.canonical_name = 'user'
           AND me.predicate = 'prefers'
           AND obj.canonical_name LIKE '%conventional%'`
      );
      expect(edgeRows[0]?.values).toHaveLength(1);
      expect(edgeRows[0].values[0][0]).toBeNull();

      // pipeline_state.last_processed_at advanced past epoch default
      const stateRows = memDb.db.exec(
        `SELECT last_processed_at, status
         FROM memory_pipeline_state
         WHERE scope = 'conversation_incremental'`
      );
      expect(stateRows[0]?.values).toHaveLength(1);
      const [lastProcessedAt, status] = stateRows[0].values[0] as [string, string];
      expect(status).toBe('idle');
      expect(lastProcessedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Must be later than the epoch default
      expect(lastProcessedAt > '1970-01-01T00:00:00.000Z').toBe(true);

      trailDb.close();
      memDb.close();
    },
    30000
  );
});
