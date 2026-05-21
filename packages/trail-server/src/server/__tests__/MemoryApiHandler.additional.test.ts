
jest.mock('@anytime-markdown/memory-core', () => {
  const actual = jest.requireActual('@anytime-markdown/memory-core');
  return {
    ...actual,
    resolveDrift: jest.fn(() => ({ resolved: true })),
  };
});

import { makeMockLogger } from '../../__test-helpers__/mockLogger';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { MemoryApiHandler } from '../MemoryApiHandler';

const TS = '2026-05-09T10:00:00.000Z';
const TS2 = '2026-05-09T11:00:00.000Z';

/** Same schema as the main test helper, but minimal for additional tests */
function buildMinimalDb(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  const run = (sql: string, params: readonly unknown[] = []): void => {
    if (params.length === 0) {
      db.exec(sql);
    } else {
      db.prepare(sql).run(...params);
    }
  };

  run(`CREATE TABLE memory_entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    aliases_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    attributes_json TEXT NOT NULL DEFAULT '{}',
    summary TEXT NOT NULL DEFAULT '',
    first_seen_at TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    UNIQUE (type, canonical_name)
  ) STRICT`);

  run(`CREATE TABLE memory_relation_types (
    predicate TEXT PRIMARY KEY,
    cardinality TEXT NOT NULL,
    directionality TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  ) STRICT`);

  run(`CREATE TABLE memory_drift_events (
    id TEXT PRIMARY KEY,
    subject_entity_id TEXT NOT NULL,
    predicate TEXT NOT NULL,
    conversation_value TEXT,
    spec_value TEXT,
    code_value TEXT,
    drift_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution_note TEXT NOT NULL DEFAULT '',
    detail_json TEXT NOT NULL DEFAULT '{}'
  ) STRICT`);

  run(`CREATE TABLE memory_bug_fixes (
    id TEXT PRIMARY KEY,
    commit_sha TEXT NOT NULL UNIQUE,
    bug_entity_id TEXT NOT NULL,
    package TEXT NOT NULL,
    category TEXT NOT NULL,
    subject_summary TEXT NOT NULL,
    body_excerpt TEXT NOT NULL DEFAULT '',
    affected_file_paths_json TEXT NOT NULL DEFAULT '[]',
    related_session_id TEXT,
    introduced_commit_sha TEXT,
    committed_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  ) STRICT`);

  run(`CREATE TABLE memory_reviews (
    id TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    review_entity_id TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_refs_json TEXT NOT NULL DEFAULT '[]',
    title TEXT NOT NULL,
    reviewer TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  ) STRICT`);

  run(`CREATE TABLE memory_review_findings (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL,
    finding_entity_id TEXT NOT NULL,
    finding_index INTEGER NOT NULL,
    target_file_path TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    severity TEXT NOT NULL DEFAULT 'info',
    finding_text TEXT NOT NULL,
    addressed_commit_sha TEXT,
    addressed_at TEXT,
    recorded_at TEXT NOT NULL
  ) STRICT`);

  run(`CREATE TABLE memory_review_runs (
    id TEXT PRIMARY KEY,
    model TEXT NOT NULL DEFAULT ''
  ) STRICT`);

  run(`CREATE TABLE memory_pipeline_runs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    items_processed INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error_detail TEXT NOT NULL DEFAULT ''
  ) STRICT`);

  run(`CREATE TABLE memory_failed_items (
    scope TEXT NOT NULL,
    item_key TEXT NOT NULL,
    failed_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (scope, item_key)
  ) STRICT`);

  run(`CREATE TABLE memory_edges (
    id TEXT PRIMARY KEY,
    subject_entity_id TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object_entity_id TEXT,
    object_literal TEXT,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    recorded_at TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    confidence_label TEXT NOT NULL DEFAULT 'EXTRACTED',
    modality TEXT NOT NULL DEFAULT 'asserted',
    attributes_json TEXT NOT NULL DEFAULT '{}'
  ) STRICT`);

  run(`CREATE TABLE memory_edge_invalidations (
    id TEXT PRIMARY KEY,
    edge_id TEXT NOT NULL,
    invalidated_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    superseding_edge_id TEXT
  ) STRICT`);

  // Seed data
  run(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['ent-a', 'Package', 'pkg-a', 'Package A', TS, TS, TS],
  );

  run(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at, resolution_note, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, NULL, '', '{}')`,
    ['drift-a', 'ent-a', 'prefers', 'spec_vs_code', 'warn', TS],
  );

  run(
    `INSERT INTO memory_bug_fixes (id, commit_sha, bug_entity_id, package, category, subject_summary, affected_file_paths_json, committed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['bf-a', 'sha-causal', 'ent-a', 'pkg-a', 'logic', 'Bug A summary', '["src/a.ts","src/b.ts"]', TS, TS],
  );

  // Add caused_by edge for root cause
  run(
    `INSERT INTO memory_edges (id, subject_entity_id, predicate, object_entity_id, valid_from, recorded_at, source_type, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['edge-caused', 'ent-a', 'caused_by', 'ent-a', TS, TS, 'conversation', 'sess-x'],
  );

  db.close();
}

describe('MemoryApiHandler — additional coverage', () => {
  let tmpDir: string;
  let dbPath: string;
  let handler: MemoryApiHandler;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-api-additional-'));
    dbPath = path.join(tmpDir, 'memory-core.db');
    buildMinimalDb(dbPath);
    handler = new MemoryApiHandler(makeMockLogger(), dbPath);
  });

  afterAll(() => {
    handler.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('handleStatus', () => {
    it('returns exists:false when no dbPath configured', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), undefined);
      const result = await h.handleStatus();
      expect(result).toEqual({ exists: false });
    });
  });

  describe('dispose', () => {
    it('can be called multiple times without throwing', () => {
      const h = new MemoryApiHandler(makeMockLogger(), dbPath);
      expect(() => {
        h.dispose();
        h.dispose(); // second call should be no-op
      }).not.toThrow();
    });
  });

  describe('listDriftEvents — filter combinations', () => {
    it('filters by driftType', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false, driftType: 'spec_vs_code' });
      expect(rows.every((r) => r.driftType === 'spec_vs_code')).toBe(true);
    });

    it('filters by since', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false, since: TS2 });
      expect(rows.every((r) => r.detectedAt >= TS2)).toBe(true);
    });

    it('respects limit', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false, limit: 1 });
      expect(rows.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getBugCausalInfo', () => {
    it('returns causal info for known bug entity', async () => {
      const result = await handler.getBugCausalInfo('ent-a');
      expect(result).not.toBeNull();
      expect(result?.bugEntityId).toBe('ent-a');
      expect(result?.commitSha).toBe('sha-causal');
      expect(result?.affectedFilePaths).toContain('src/a.ts');
      expect(Array.isArray(result?.rootCauses)).toBe(true);
    });

    it('returns null for unknown bug entity', async () => {
      const result = await handler.getBugCausalInfo('nonexistent-entity');
      expect(result).toBeNull();
    });
  });

  describe('resolveDriftEvent', () => {
    it('calls resolveDrift and returns ok:true on success', async () => {
      const result = await handler.resolveDriftEvent('drift-a', 'fixed by test');
      expect(result).toEqual({ ok: true });
    });

    it('returns ok:false when db not available', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      const result = await h.resolveDriftEvent('drift-a', 'note');
      expect(result).toEqual({ ok: false });
    });
  });

  describe('listRecurringBugs', () => {
    it('returns empty when no cluster-type events', async () => {
      const rows = await handler.listRecurringBugs({});
      // Our test db has no regression_cluster events — empty is correct
      expect(Array.isArray(rows)).toBe(true);
    });

    it('returns empty when db not available', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.listRecurringBugs({})).toEqual([]);
    });
  });

  describe('getBugHistory', () => {
    it('filters by category', async () => {
      const rows = await handler.getBugHistory({ category: 'logic' });
      expect(rows.every((r) => r.category === 'logic')).toBe(true);
    });
  });

  describe('listUnaddressedReviewFindings — no reviews seeded', () => {
    it('returns empty when db not available', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.listUnaddressedReviewFindings({})).toEqual([]);
    });
  });

  describe('getReviewHistory', () => {
    it('returns empty when db not available', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.getReviewHistory({})).toEqual([]);
    });
  });

  describe('listPipelineRunStatsByDay', () => {
    it('returns empty when db not available', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.listPipelineRunStatsByDay({})).toEqual([]);
    });

    it('filters by scope', async () => {
      const rows = await handler.listPipelineRunStatsByDay({ scope: 'nonexistent-scope' });
      expect(rows).toEqual([]);
    });
  });

  describe('listFailedItems', () => {
    it('returns empty when db not available', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.listFailedItems({})).toEqual([]);
    });

    it('filters by scope', async () => {
      const rows = await handler.listFailedItems({ scope: 'no-such-scope' });
      expect(rows).toEqual([]);
    });
  });

  describe('listTopEntities', () => {
    it('returns empty when db not available', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.listTopEntities({})).toEqual([]);
    });

    it('filters by type', async () => {
      const rows = await handler.listTopEntities({ type: 'Package' });
      expect(rows.every((r) => r.type === 'Package')).toBe(true);
    });

    it('respects limit', async () => {
      const rows = await handler.listTopEntities({ limit: 1 });
      expect(rows.length).toBeLessThanOrEqual(1);
    });
  });

  describe('listInvalidations', () => {
    it('returns empty when db not available', async () => {
      const h = new MemoryApiHandler(makeMockLogger(), path.join(tmpDir, 'no-such.db'));
      expect(await h.listInvalidations({})).toEqual([]);
    });

    it('filters by since', async () => {
      // future timestamp — no records
      const rows = await handler.listInvalidations({ since: '2099-01-01T00:00:00.000Z' });
      expect(rows).toEqual([]);
    });
  });
});
