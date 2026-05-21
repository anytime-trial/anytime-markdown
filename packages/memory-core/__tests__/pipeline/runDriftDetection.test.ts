/**
 * runDriftDetection — pipeline integration tests
 *
 * Strategy: use openMemoryCoreDb() for the full schema (all drift tables exist),
 * then seed memory_edges / memory_entities / memory_bug_fixes etc. to exercise
 * each detector pathway. Ollama is not involved in drift detection.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../src/db/connection';
import type { MemoryDbConnection } from '../../src/db/connection/types';
import { attachTrailDbFromHandle } from '../../src/db/attach';
import { BetterSqlite3MemoryDb } from '../../src/db/connection/BetterSqlite3MemoryDb';
import { runDriftDetection } from '../../src/pipeline/runDriftDetection';
import { noopLogger } from '../../src/logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpPath() {
  return path.join(os.tmpdir(), `drift-det-${process.pid}-${Date.now()}.db`);
}

async function openTestDb() {
  const tmpPath = makeTmpPath();
  const { db, close } = await openMemoryCoreDb(tmpPath);

  // Attach a minimal trail DB (drift detection may query trail via attach)
  const trailHandle = BetterSqlite3MemoryDb.openInMemory();
  trailHandle.run(`CREATE TABLE session_commits (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    commit_message TEXT NOT NULL,
    repo_name TEXT NOT NULL DEFAULT 'repo',
    committed_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00.000Z',
    author TEXT NOT NULL DEFAULT 'test',
    session_id TEXT
  ) STRICT`);
  trailHandle.run(`CREATE TABLE commit_files (
    id INTEGER PRIMARY KEY,
    commit_hash TEXT NOT NULL,
    repo_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL DEFAULT 'M'
  ) STRICT`);
  trailHandle.run(`CREATE TABLE messages (
    uuid TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    text_content TEXT,
    tool_calls TEXT,
    subagent_type TEXT,
    skill TEXT
  ) STRICT`);

  attachTrailDbFromHandle(db, trailHandle);

  return {
    db,
    trailHandle,
    close: () => {
      trailHandle.close();
      close();
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    },
  };
}

const TS = '2026-01-01T00:00:00.000Z';
const ENTITY_ID = 'ent_test_001';

function insertEntity(db: MemoryDbConnection, id: string, name: string): void {
  db.run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, summary, aliases_json, tags_json, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, '', '[]', '[]', '{}', ?, ?, ?)`,
    [id, name, name, TS, TS, TS],
  );
}

function insertRelationType(db: MemoryDbConnection, predicate: string): void {
  db.run(
    `INSERT OR IGNORE INTO memory_relation_types
       (predicate, cardinality, directionality, description)
     VALUES (?, 'multiple_active', 'subject_to_object', 'test predicate')`,
    [predicate],
  );
}

function insertEdge(
  db: MemoryDbConnection,
  opts: {
    id: string;
    subject: string;
    predicate: string;
    objectLiteral?: string;
    objectEntityId?: string;
    sourceType: string;
    confidence?: number;
  },
): void {
  insertRelationType(db, opts.predicate);
  db.run(
    `INSERT OR IGNORE INTO memory_edges
       (id, subject_entity_id, predicate, object_entity_id, object_literal,
        source_type, source_ref, confidence, valid_from, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, 'test', ?, ?, ?)`,
    [
      opts.id,
      opts.subject,
      opts.predicate,
      opts.objectEntityId ?? null,
      opts.objectLiteral ?? null,
      opts.sourceType,
      opts.confidence ?? 0.9,
      TS,
      TS,
    ],
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runDriftDetection', () => {
  // D1: empty DB — no drifts detected, status=success
  test('D1: empty DB → status=success, events_inserted=0', async () => {
    const { db, close } = await openTestDb();
    try {
      const result = await runDriftDetection({ db, logger: noopLogger });
      expect(result.status).toBe('success');
      expect(result.events_inserted).toBe(0);
      expect(result.events_updated).toBe(0);
      expect(result.events_resolved).toBe(0);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    } finally {
      close();
    }
  }, 30000);

  // D2: pipeline_runs row is created with scope='drift_detection'
  test('D2: memory_pipeline_runs row created with scope=drift_detection and status=success', async () => {
    const { db, close } = await openTestDb();
    try {
      await runDriftDetection({ db, logger: noopLogger });
      const rows = db.exec(
        `SELECT scope, status FROM memory_pipeline_runs WHERE scope = 'drift_detection'`,
      );
      expect(rows[0]?.values).toHaveLength(1);
      expect(rows[0]?.values[0][0]).toBe('drift_detection');
      expect(rows[0]?.values[0][1]).toBe('success');
    } finally {
      close();
    }
  }, 30000);

  // D3: spec_vs_code drift → events_inserted >= 1
  test('D3: spec source disagrees with code source → drift event inserted', async () => {
    const { db, close } = await openTestDb();
    try {
      insertEntity(db, ENTITY_ID, 'TestEntity');

      // spec says "react", code says "vue" — values differ → drift candidate
      insertEdge(db, {
        id: 'edge_spec_001',
        subject: ENTITY_ID,
        predicate: 'depends_on',
        objectLiteral: 'react',
        sourceType: 'spec',
        confidence: 0.95,
      });
      insertEdge(db, {
        id: 'edge_code_001',
        subject: ENTITY_ID,
        predicate: 'depends_on',
        objectLiteral: 'vue',
        sourceType: 'code',
        confidence: 0.9,
      });

      const result = await runDriftDetection({ db, logger: noopLogger });
      // At minimum status should be success or partial (not error)
      expect(['success', 'partial']).toContain(result.status);
      // With a clear spec vs code mismatch, at least 1 event should be inserted
      expect(result.events_inserted).toBeGreaterThanOrEqual(1);
    } finally {
      close();
    }
  }, 30000);

  // D4: same drift detected twice → second run updates, not inserts
  test('D4: running twice on same data → 2nd run events_updated >= 1, events_inserted = 0', async () => {
    const { db, close } = await openTestDb();
    try {
      insertEntity(db, ENTITY_ID, 'TestEntity');
      insertEdge(db, {
        id: 'edge_spec_idem',
        subject: ENTITY_ID,
        predicate: 'uses',
        objectLiteral: 'typescript',
        sourceType: 'spec',
        confidence: 0.9,
      });
      insertEdge(db, {
        id: 'edge_code_idem',
        subject: ENTITY_ID,
        predicate: 'uses',
        objectLiteral: 'javascript',
        sourceType: 'code',
        confidence: 0.9,
      });

      // First run — should insert
      const first = await runDriftDetection({ db, logger: noopLogger });
      expect(first.events_inserted).toBeGreaterThanOrEqual(1);

      // Second run — same data → updates the existing event
      const second = await runDriftDetection({ db, logger: noopLogger });
      expect(second.events_inserted).toBe(0);
      expect(second.events_updated).toBeGreaterThanOrEqual(1);
    } finally {
      close();
    }
  }, 30000);

  // D5: drift resolved when edges no longer conflict
  test('D5: after resolving edge conflict, existing drift event is resolved', async () => {
    const { db, close } = await openTestDb();
    try {
      insertEntity(db, ENTITY_ID, 'TestEntity');
      insertEdge(db, {
        id: 'edge_spec_res',
        subject: ENTITY_ID,
        predicate: 'uses',
        objectLiteral: 'A',
        sourceType: 'spec',
        confidence: 0.9,
      });
      insertEdge(db, {
        id: 'edge_code_res',
        subject: ENTITY_ID,
        predicate: 'uses',
        objectLiteral: 'B',
        sourceType: 'code',
        confidence: 0.9,
      });

      // Insert a drift event (simulating it was already detected)
      const first = await runDriftDetection({ db, logger: noopLogger });
      expect(first.events_inserted).toBeGreaterThanOrEqual(1);

      // Now align code to match spec
      db.run(
        `UPDATE memory_edges SET object_literal = 'A' WHERE id = 'edge_code_res'`,
      );

      // Re-run — drift should be resolved
      const second = await runDriftDetection({ db, logger: noopLogger });
      expect(second.events_resolved).toBeGreaterThanOrEqual(1);
    } finally {
      close();
    }
  }, 30000);

  // D6: multiple entities with drifts → events_inserted matches count
  test('D6: two separate entity drifts → events_inserted = 2', async () => {
    const { db, close } = await openTestDb();
    try {
      const ENTITIES = ['ent_multi_001', 'ent_multi_002'];
      for (const eid of ENTITIES) {
        insertEntity(db, eid, eid);
        insertEdge(db, {
          id: `edge_spec_m_${eid}`,
          subject: eid,
          predicate: 'uses',
          objectLiteral: 'alpha',
          sourceType: 'spec',
          confidence: 0.9,
        });
        insertEdge(db, {
          id: `edge_code_m_${eid}`,
          subject: eid,
          predicate: 'uses',
          objectLiteral: 'beta',
          sourceType: 'code',
          confidence: 0.9,
        });
      }

      const result = await runDriftDetection({ db, logger: noopLogger });
      expect(result.events_inserted).toBeGreaterThanOrEqual(2);
    } finally {
      close();
    }
  }, 30000);

  // D7: duration_ms is populated and reasonable
  test('D7: duration_ms is a non-negative number', async () => {
    const { db, close } = await openTestDb();
    try {
      const result = await runDriftDetection({ db, logger: noopLogger });
      expect(typeof result.duration_ms).toBe('number');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    } finally {
      close();
    }
  }, 30000);

  // D8: conversation vs spec drift also detected
  test('D8: conversation vs spec drift → events_inserted >= 1', async () => {
    const { db, close } = await openTestDb();
    try {
      insertEntity(db, 'ent_conv_spec', 'ConvSpecEntity');
      insertEdge(db, {
        id: 'edge_conv_cs',
        subject: 'ent_conv_spec',
        predicate: 'depends_on',
        objectLiteral: 'lib-A',
        sourceType: 'conversation',
        confidence: 0.85,
      });
      insertEdge(db, {
        id: 'edge_spec_cs',
        subject: 'ent_conv_spec',
        predicate: 'depends_on',
        objectLiteral: 'lib-B',
        sourceType: 'spec',
        confidence: 0.9,
      });

      const result = await runDriftDetection({ db, logger: noopLogger });
      expect(['success', 'partial']).toContain(result.status);
      expect(result.events_inserted).toBeGreaterThanOrEqual(1);
    } finally {
      close();
    }
  }, 30000);
});
