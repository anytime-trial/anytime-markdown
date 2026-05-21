/**
 * Tests for src/ingest/spec/persist.ts
 *
 * upsertSpecDoc, updateSpecDocSummary, upsertSpecClaims の
 * upsert・重複・更新・型マッピングを検証する。
 */
import { BetterSqlite3MemoryDb } from '../../../src/db/connection/BetterSqlite3MemoryDb';
import { runMigrations } from '../../../src/db/migrations/runner';
import {
  upsertSpecDoc,
  updateSpecDocSummary,
  upsertSpecClaims,
} from '../../../src/ingest/spec/persist';
import { entityId } from '../../../src/canonical/entityId';
import type { ParsedSpec } from '../../../src/ingest/spec/parseFrontmatter';
import type { Claim } from '../../../src/ingest/spec/extractClaims';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TS = '2026-05-01T00:00:00.000Z';

function makeDb(): BetterSqlite3MemoryDb {
  const db = BetterSqlite3MemoryDb.openInMemory();
  db.run('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeParsedSpec(overrides: Partial<ParsedSpec> = {}): ParsedSpec {
  return {
    rel_path: 'spec/01.core/design.md',
    frontmatter: {
      title: 'Core Design Spec',
      type: 'spec',
      date: '2026-05-01',
      updated: undefined,
      c4Scope: ['pkg_memory-core'],
      lang: 'ja',
    },
    raw_body: '# Design\n\nContent here.',
    ...overrides,
  };
}

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    subject: { name: 'memory-core', type: 'Package' },
    predicate: 'uses',
    object: { name: 'better-sqlite3', type: 'Library' },
    modality: 'asserted',
    confidence: 0.9,
    source_line: 10,
    ...overrides,
  };
}

// ── upsertSpecDoc ─────────────────────────────────────────────────────────────

describe('upsertSpecDoc', () => {
  test('new doc → memory_spec_documents + Concept entity + spec_doc_entities', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const result = upsertSpecDoc({ db, parsed, source_hash: 'sha001', recordedAt: TS });

      expect(result.specDocId).toBeTruthy();
      expect(result.specEntityId).toBeTruthy();

      // memory_spec_documents
      const docRows = db.exec(
        `SELECT rel_path, type, title, source_hash FROM memory_spec_documents WHERE id = ?`,
        [result.specDocId],
      );
      expect(docRows[0]?.values).toHaveLength(1);
      expect(docRows[0].values[0][0]).toBe('spec/01.core/design.md');
      expect(docRows[0].values[0][1]).toBe('spec');
      expect(docRows[0].values[0][2]).toBe('Core Design Spec');
      expect(docRows[0].values[0][3]).toBe('sha001');

      // Concept entity
      const entRows = db.exec(
        `SELECT type, canonical_name FROM memory_entities WHERE id = ?`,
        [result.specEntityId],
      );
      expect(entRows[0]?.values).toHaveLength(1);
      expect(entRows[0].values[0][0]).toBe('Concept');
      expect(entRows[0].values[0][1]).toBe('spec/01.core/design.md');

      // spec_doc_entities
      const sdeRows = db.exec(
        `SELECT spec_doc_id, entity_id FROM memory_spec_doc_entities`,
      );
      expect(sdeRows[0]?.values).toHaveLength(1);
      expect(sdeRows[0].values[0][0]).toBe(result.specDocId);
      expect(sdeRows[0].values[0][1]).toBe(result.specEntityId);
    } finally {
      db.close();
    }
  });

  test('second call with same rel_path replaces (INSERT OR REPLACE) → source_hash updated', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const r1 = upsertSpecDoc({ db, parsed, source_hash: 'sha-v1', recordedAt: TS });

      // Second call with different hash
      const r2 = upsertSpecDoc({ db, parsed, source_hash: 'sha-v2', recordedAt: TS });

      expect(r1.specDocId).toBe(r2.specDocId);
      expect(r1.specEntityId).toBe(r2.specEntityId);

      const rows = db.exec(
        `SELECT source_hash FROM memory_spec_documents WHERE id = ?`,
        [r1.specDocId],
      );
      expect(rows[0]?.values[0][0]).toBe('sha-v2');
    } finally {
      db.close();
    }
  });

  test('updated date takes precedence over date for updated_at', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec({
        frontmatter: {
          title: 'Updated Test',
          type: 'spec',
          date: '2026-01-01',
          updated: '2026-05-10',
          c4Scope: [],
          lang: 'ja',
        },
      });
      const result = upsertSpecDoc({ db, parsed, source_hash: 'sha-upd', recordedAt: TS });

      const rows = db.exec(
        `SELECT updated_at FROM memory_spec_documents WHERE id = ?`,
        [result.specDocId],
      );
      expect(rows[0]?.values[0][0]).toBe('2026-05-10T00:00:00.000Z');
    } finally {
      db.close();
    }
  });

  test('date in YYYY-MM-DD format → updated_at ends with T00:00:00.000Z', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const result = upsertSpecDoc({ db, parsed, source_hash: 'sha-date', recordedAt: TS });

      const rows = db.exec(
        `SELECT updated_at FROM memory_spec_documents WHERE id = ?`,
        [result.specDocId],
      );
      expect(rows[0]?.values[0][0]).toBe('2026-05-01T00:00:00.000Z');
    } finally {
      db.close();
    }
  });

  test('c4Scope is stored as JSON array', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec({
        frontmatter: {
          title: 'C4 Test',
          type: 'spec',
          date: '2026-05-01',
          updated: undefined,
          c4Scope: ['pkg_memory-core', 'sys_anytime-markdown'],
          lang: 'ja',
        },
      });
      const result = upsertSpecDoc({ db, parsed, source_hash: 'sha-c4', recordedAt: TS });

      const rows = db.exec(
        `SELECT c4_scope_json FROM memory_spec_documents WHERE id = ?`,
        [result.specDocId],
      );
      const c4Json = JSON.parse(rows[0]?.values[0][0] as string);
      expect(c4Json).toEqual(['pkg_memory-core', 'sys_anytime-markdown']);
    } finally {
      db.close();
    }
  });

  test('empty c4Scope → stored as empty array []', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec({
        frontmatter: {
          title: 'No C4',
          type: 'spec',
          date: '2026-05-01',
          updated: undefined,
          c4Scope: [],
          lang: 'ja',
        },
      });
      const result = upsertSpecDoc({ db, parsed, source_hash: 'sha-noc4', recordedAt: TS });

      const rows = db.exec(
        `SELECT c4_scope_json FROM memory_spec_documents WHERE id = ?`,
        [result.specDocId],
      );
      expect(JSON.parse(rows[0]?.values[0][0] as string)).toEqual([]);
    } finally {
      db.close();
    }
  });

  test('specDocId is deterministic sha1(rel_path).slice(0,16)', () => {
    const db = makeDb();
    try {
      const { createHash } = require('node:crypto');
      const parsed = makeParsedSpec();
      const expectedId = createHash('sha1').update('spec/01.core/design.md').digest('hex').slice(0, 16);
      const result = upsertSpecDoc({ db, parsed, source_hash: 'sha-det', recordedAt: TS });
      expect(result.specDocId).toBe(expectedId);
    } finally {
      db.close();
    }
  });

  test('specEntityId is entityId("Concept", rel_path)', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const expected = entityId('Concept', 'spec/01.core/design.md');
      const result = upsertSpecDoc({ db, parsed, source_hash: 'sha-eid', recordedAt: TS });
      expect(result.specEntityId).toBe(expected);
    } finally {
      db.close();
    }
  });
});

// ── updateSpecDocSummary ──────────────────────────────────────────────────────

describe('updateSpecDocSummary', () => {
  test('sets summary text on existing doc', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-sum', recordedAt: TS });

      updateSpecDocSummary(db, specDocId, 'This is the summary.');

      const rows = db.exec(`SELECT summary FROM memory_spec_documents WHERE id = ?`, [specDocId]);
      expect(rows[0]?.values[0][0]).toBe('This is the summary.');
    } finally {
      db.close();
    }
  });

  test('calling twice replaces previous summary', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-sum2', recordedAt: TS });

      updateSpecDocSummary(db, specDocId, 'Old summary');
      updateSpecDocSummary(db, specDocId, 'New summary');

      const rows = db.exec(`SELECT summary FROM memory_spec_documents WHERE id = ?`, [specDocId]);
      expect(rows[0]?.values[0][0]).toBe('New summary');
    } finally {
      db.close();
    }
  });
});

// ── upsertSpecClaims ──────────────────────────────────────────────────────────

describe('upsertSpecClaims', () => {
  test('single claim → 2 entities + 1 edge', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId, specEntityId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-cl1', recordedAt: TS });

      const claim = makeClaim();
      const result = upsertSpecClaims({ db, specDocId, specEntityId, claims: [claim], recordedAt: TS });

      expect(result.entities_inserted).toBeGreaterThanOrEqual(1);
      expect(result.edges_inserted).toBe(1);

      // Check edge source_type
      const edgeRows = db.exec(
        `SELECT source_type, predicate, confidence, modality FROM memory_edges WHERE source_ref = ?`,
        [`spec_doc#${specDocId}`],
      );
      expect(edgeRows[0]?.values).toHaveLength(1);
      expect(edgeRows[0].values[0][0]).toBe('spec');
      expect(edgeRows[0].values[0][1]).toBe('uses');
      expect(Number(edgeRows[0].values[0][2])).toBeCloseTo(0.9);
      expect(edgeRows[0].values[0][3]).toBe('asserted');
    } finally {
      db.close();
    }
  });

  test('empty claims → 0 entities, 0 edges', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId, specEntityId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-empty', recordedAt: TS });

      const result = upsertSpecClaims({ db, specDocId, specEntityId, claims: [], recordedAt: TS });

      expect(result.entities_inserted).toBe(0);
      expect(result.edges_inserted).toBe(0);
    } finally {
      db.close();
    }
  });

  test('duplicate claim inserted twice → edge is idempotent (INSERT OR IGNORE)', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId, specEntityId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-dup', recordedAt: TS });

      const claim = makeClaim();
      upsertSpecClaims({ db, specDocId, specEntityId, claims: [claim], recordedAt: TS });
      upsertSpecClaims({ db, specDocId, specEntityId, claims: [claim], recordedAt: TS });

      const edgeCount = db.exec(`SELECT COUNT(*) FROM memory_edges WHERE source_type = 'spec'`);
      expect(edgeCount[0]?.values[0][0]).toBe(1);
    } finally {
      db.close();
    }
  });

  test('unknown entity type falls back to Concept', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId, specEntityId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-unk', recordedAt: TS });

      const claim = makeClaim({
        subject: { name: 'FancyThing', type: 'UnknownType' },
        object: { name: 'OtherThing', type: 'AlsoUnknown' },
        predicate: 'uses', // must be registered in memory_relation_types
      });
      const result = upsertSpecClaims({ db, specDocId, specEntityId, claims: [claim], recordedAt: TS });

      expect(result.edges_inserted).toBe(1);

      // Both entities should be Concept
      const entRows = db.exec(
        `SELECT type, canonical_name FROM memory_entities WHERE canonical_name IN ('FancyThing', 'OtherThing') ORDER BY canonical_name`,
      );
      expect(entRows[0]?.values).toHaveLength(2);
      for (const row of entRows[0].values) {
        expect(row[0]).toBe('Concept');
      }
    } finally {
      db.close();
    }
  });

  test('multiple claims → edges_inserted matches claim count', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId, specEntityId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-multi', recordedAt: TS });

      // All predicates must be in memory_relation_types
      const claims: Claim[] = [
        makeClaim({ subject: { name: 'pkg-a', type: 'Package' }, object: { name: 'lib-x', type: 'Library' }, predicate: 'depends_on' }),
        makeClaim({ subject: { name: 'pkg-a', type: 'Package' }, object: { name: 'tool-y', type: 'Tool' }, predicate: 'uses' }),
        makeClaim({ subject: { name: 'pkg-b', type: 'Package' }, object: { name: 'lib-x', type: 'Library' }, predicate: 'relates_to' }),
      ];
      const result = upsertSpecClaims({ db, specDocId, specEntityId, claims, recordedAt: TS });

      expect(result.edges_inserted).toBe(3);
    } finally {
      db.close();
    }
  });

  test('confidence is clamped to [0, 1]', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId, specEntityId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-clamp', recordedAt: TS });

      // Use registered predicates only (memory_relation_types FK constraint)
      const claims: Claim[] = [
        makeClaim({ confidence: 1.5, predicate: 'uses' }), // clamped to 1.0
        makeClaim({
          subject: { name: 'neg-pkg', type: 'Package' },
          object: { name: 'neg-lib', type: 'Library' },
          confidence: -0.5,
          predicate: 'depends_on', // clamped to 0.0
        }),
      ];
      upsertSpecClaims({ db, specDocId, specEntityId, claims, recordedAt: TS });

      const edgeRows = db.exec(
        `SELECT predicate, confidence FROM memory_edges WHERE source_type = 'spec' ORDER BY predicate`,
      );
      for (const row of edgeRows[0]?.values ?? []) {
        const conf = Number(row[1]);
        expect(conf).toBeGreaterThanOrEqual(0);
        expect(conf).toBeLessThanOrEqual(1);
      }
    } finally {
      db.close();
    }
  });

  test('allowed entity types are inserted with correct type', () => {
    const db = makeDb();
    try {
      const parsed = makeParsedSpec();
      const { specDocId, specEntityId } = upsertSpecDoc({ db, parsed, source_hash: 'sha-types', recordedAt: TS });

      const allowedTypes = ['Person', 'Project', 'Package', 'File', 'Library', 'Tool', 'Concept',
        'Decision', 'Bug', 'Task', 'Skill', 'Rule', 'Commit', 'Question'];

      // Use 'uses' predicate for all (it is registered in memory_relation_types)
      for (let i = 0; i < allowedTypes.length; i++) {
        const t = allowedTypes[i];
        const claim = makeClaim({
          subject: { name: `subj-${t}`, type: t },
          object: { name: `obj-${t}`, type: t },
          predicate: 'uses',
        });
        upsertSpecClaims({ db, specDocId, specEntityId, claims: [claim], recordedAt: TS });
      }

      for (const t of allowedTypes) {
        const rows = db.exec(
          `SELECT COUNT(*) FROM memory_entities WHERE type = ? AND canonical_name LIKE 'subj-%'`,
          [t],
        );
        expect(rows[0]?.values[0][0] as number).toBeGreaterThanOrEqual(1);
      }
    } finally {
      db.close();
    }
  });
});
