// __non_webpack_require__ は webpack グローバル。テスト環境では sql-asm.js を直接ロードするよう差し替え
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sqlAsmActual = require(require.resolve('sql.js/dist/sql-asm.js'));
(global as Record<string, unknown>).__non_webpack_require__ = (_path: string) => sqlAsmActual;

jest.mock('@anytime-markdown/memory-core', () => ({
  resolveDrift: jest.fn(() => ({ resolved: true })),
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import initSqlJs from 'sql.js';
import { MemoryApiHandler } from '../MemoryApiHandler';

const TS = '2026-05-09T10:00:00.000Z';
const TS2 = '2026-05-09T11:00:00.000Z';

async function buildTestDb(dbPath: string): Promise<void> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run(`CREATE TABLE memory_entities (
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

  db.run(`CREATE TABLE memory_relation_types (
    predicate TEXT PRIMARY KEY,
    cardinality TEXT NOT NULL,
    directionality TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  ) STRICT`);

  db.run(`CREATE TABLE memory_drift_events (
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

  db.run(`CREATE TABLE memory_bug_fixes (
    id TEXT PRIMARY KEY,
    commit_sha TEXT NOT NULL UNIQUE,
    bug_entity_id TEXT NOT NULL,
    package TEXT NOT NULL,
    category TEXT NOT NULL,
    subject_summary TEXT NOT NULL,
    body_excerpt TEXT NOT NULL DEFAULT '',
    affected_file_paths_json TEXT NOT NULL DEFAULT '[]',
    committed_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  ) STRICT`);

  db.run(`CREATE TABLE memory_reviews (
    id TEXT PRIMARY KEY,
    source_kind TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    review_entity_id TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_refs_json TEXT NOT NULL DEFAULT '[]',
    title TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  ) STRICT`);

  db.run(`CREATE TABLE memory_review_findings (
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

  db.run(`CREATE TABLE memory_pipeline_runs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    items_processed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
  ) STRICT`);

  db.run(`CREATE TABLE memory_failed_items (
    scope TEXT NOT NULL,
    item_key TEXT NOT NULL,
    failed_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (scope, item_key)
  ) STRICT`);

  db.run(`CREATE TABLE memory_edges (
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

  db.run(`CREATE TABLE memory_edge_invalidations (
    id TEXT PRIMARY KEY,
    edge_id TEXT NOT NULL,
    invalidated_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    superseding_edge_id TEXT
  ) STRICT`);

  // Seed: entity
  db.run(
    `INSERT INTO memory_entities (id, type, canonical_name, display_name, first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['ent-1', 'Package', 'trail-viewer', 'trail-viewer', TS, TS, TS],
  );

  // Seed: drift events
  db.run(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at, resolution_note, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, NULL, '', '{"key":"val"}')`,
    ['drift-1', 'ent-1', 'prefers', 'spec_vs_code', 'warn', TS],
  );
  db.run(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at, resolution_note, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'fixed', '{}')`,
    ['drift-2', 'ent-1', 'depends_on', 'conv_vs_code', 'error', TS2, TS2],
  );

  // Seed: recurring bug drift events
  db.run(
    `INSERT INTO memory_drift_events (id, subject_entity_id, predicate, drift_type, severity, detected_at, resolved_at, resolution_note, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, NULL, '', '{}')`,
    ['drift-3', 'ent-1', 'prefers', 'regression_cluster', 'error', TS],
  );

  // Seed: bug fixes
  db.run(
    `INSERT INTO memory_bug_fixes (id, commit_sha, bug_entity_id, package, category, subject_summary, committed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['bf-1', 'abc123', 'ent-1', 'trail-viewer', 'logic', 'Fix null ref', TS, TS],
  );

  // Seed: reviews and findings
  db.run(
    `INSERT INTO memory_reviews (id, source_kind, source_ref, review_entity_id, target_kind, title, reviewed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['rev-1', 'review_doc', 'doc/r1.md', 'ent-1', 'code', 'Code Review 1', TS, TS],
  );
  db.run(
    `INSERT INTO memory_review_findings (id, review_id, finding_entity_id, finding_index, target_file_path, category, severity, finding_text, addressed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    ['rf-1', 'rev-1', 'ent-1', 0, 'src/foo.ts', 'logic', 'warn', 'Missing null check', TS],
  );
  db.run(
    `INSERT INTO memory_review_findings (id, review_id, finding_entity_id, finding_index, target_file_path, category, severity, finding_text, addressed_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['rf-2', 'rev-1', 'ent-1', 1, 'src/bar.ts', 'perf', 'info', 'Slow loop', TS, TS],
  );

  // Seed: pipeline runs
  db.run(
    `INSERT INTO memory_pipeline_runs (id, scope, started_at, completed_at, status, items_processed)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['run-1', 'drift', TS, TS2, 'success', 5],
  );

  // Seed: failed items
  db.run(
    `INSERT INTO memory_failed_items (scope, item_key, failed_at, reason, attempt_count)
     VALUES (?, ?, ?, ?, ?)`,
    ['drift', 'msg-abc', TS, 'timeout', 2],
  );

  // Seed: edge + invalidation
  db.run(
    `INSERT INTO memory_edges (id, subject_entity_id, predicate, object_literal, valid_from, recorded_at, source_type, source_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['edge-1', 'ent-1', 'prefers', 'TypeScript', TS, TS, 'conversation', 'session-1'],
  );
  db.run(
    `INSERT INTO memory_edge_invalidations (id, edge_id, invalidated_at, reason, superseding_edge_id)
     VALUES (?, ?, ?, ?, NULL)`,
    ['inv-1', 'edge-1', TS2, 'rule_exclusive'],
  );

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
}

describe('MemoryApiHandler', () => {
  let tmpDir: string;
  let dbPath: string;
  let handler: MemoryApiHandler;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-api-test-'));
    dbPath = path.join(tmpDir, 'memory-core.db');
    await buildTestDb(dbPath);
    handler = new (MemoryApiHandler as new (p: string) => MemoryApiHandler)(dbPath);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('handleStatus', () => {
    it('returns exists:true when db file is present', async () => {
      const result = await handler.handleStatus();
      expect(result).toEqual({ exists: true });
    });

    it('returns exists:false when db file is absent', async () => {
      const h = new (MemoryApiHandler as new (p: string) => MemoryApiHandler)(path.join(tmpDir, 'no-such.db'));
      expect(await h.handleStatus()).toEqual({ exists: false });
    });
  });

  describe('listDriftEvents', () => {
    it('returns only unresolved events by default', async () => {
      const rows = await handler.listDriftEvents({});
      expect(rows.length).toBeGreaterThanOrEqual(2); // drift-1, drift-3
      expect(rows.every((r) => r.resolvedAt === null)).toBe(true);
    });

    it('returns all events when unresolvedOnly=false', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false });
      expect(rows.length).toBe(3);
    });

    it('filters by severity', async () => {
      const rows = await handler.listDriftEvents({ unresolvedOnly: false, severity: 'error' });
      expect(rows.every((r) => r.severity === 'error')).toBe(true);
    });

    it('returns empty array when db is absent', async () => {
      const h = new (MemoryApiHandler as new (p: string) => MemoryApiHandler)(path.join(tmpDir, 'no-such.db'));
      expect(await h.listDriftEvents({})).toEqual([]);
    });
  });

  describe('getDriftEventDetail', () => {
    it('returns drift event detail with parsed detailJson', async () => {
      const detail = await handler.getDriftEventDetail('drift-1');
      expect(detail).not.toBeNull();
      expect(detail?.id).toBe('drift-1');
      expect(detail?.driftType).toBe('spec_vs_code');
      expect(detail?.detailJson).toEqual({ key: 'val' });
    });

    it('returns null for unknown id', async () => {
      expect(await handler.getDriftEventDetail('nonexistent')).toBeNull();
    });
  });

  describe('listRecurringBugs', () => {
    it('returns only cluster-type drift events (unresolved)', async () => {
      const rows = await handler.listRecurringBugs({});
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const types = new Set(rows.map((r) => r.driftType));
      const allowed = new Set(['regression_cluster', 'spec_violation_cluster', 'recurring_root_cause']);
      for (const t of types) expect(allowed.has(t)).toBe(true);
    });
  });

  describe('getBugHistory', () => {
    it('returns bug fix records', async () => {
      const rows = await handler.getBugHistory({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.commitSha).toBe('abc123');
      expect(rows[0]?.package).toBe('trail-viewer');
    });

    it('filters by package', async () => {
      const rows = await handler.getBugHistory({ package: 'no-such' });
      expect(rows).toEqual([]);
    });
  });

  describe('listUnaddressedReviewFindings', () => {
    it('returns only unaddressed findings', async () => {
      const rows = await handler.listUnaddressedReviewFindings({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe('rf-1');
    });
  });

  describe('getReviewHistory', () => {
    it('returns all findings with review info', async () => {
      const rows = await handler.getReviewHistory({});
      expect(rows.length).toBe(2);
      expect(rows[0]?.reviewId).toBe('rev-1');
    });

    it('filters by targetFilePath', async () => {
      const rows = await handler.getReviewHistory({ targetFilePath: 'src/bar.ts' });
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe('rf-2');
    });
  });

  describe('listPipelineRuns', () => {
    it('returns pipeline runs', async () => {
      const rows = await handler.listPipelineRuns({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe('run-1');
      expect(rows[0]?.status).toBe('success');
      expect(rows[0]?.itemsProcessed).toBe(5);
    });
  });

  describe('listFailedItems', () => {
    it('returns failed items', async () => {
      const rows = await handler.listFailedItems({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.itemKey).toBe('msg-abc');
      expect(rows[0]?.attemptCount).toBe(2);
    });
  });

  describe('listTopEntities', () => {
    it('returns entities ordered by last_updated_at desc', async () => {
      const rows = await handler.listTopEntities({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe('ent-1');
      expect(rows[0]?.canonicalName).toBe('trail-viewer');
    });
  });

  describe('listInvalidations', () => {
    it('returns edge invalidation records', async () => {
      const rows = await handler.listInvalidations({});
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe('inv-1');
      expect(rows[0]?.reason).toBe('rule_exclusive');
      expect(rows[0]?.supersedingEdgeId).toBeNull();
    });
  });
});
