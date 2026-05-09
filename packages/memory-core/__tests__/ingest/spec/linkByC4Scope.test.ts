/**
 * Tests for linkByC4Scope.
 *
 * sql.js はホスト FS パスでの ATTACH が動作しない（WASM 内部 VFS のみ）。
 * テストでは attachTrailDbFromHandle を使い、同じ WASM モジュール内の
 * インメモリ trail DB を ATTACH する。
 */
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { openMemoryCoreDb } from '../../../src/db/connection';
import { attachTrailDbFromHandle } from '../../../src/db/attach';
import { linkByC4Scope } from '../../../src/ingest/spec/linkByC4Scope';
import { entityId } from '../../../src/canonical/entityId';
import type { MemoryLogger } from '../../../src/logger';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TS = '2026-05-09T12:00:00.000Z';

function makeTmpPath(suffix: string): string {
  return path.join(os.tmpdir(), `linkByC4Scope-${process.pid}-${Date.now()}-${suffix}.db`);
}

type TrailRow = { id: string; name: string };

/**
 * メイン DB（memory-core 全マイグレーション済み）と
 * trail インメモリ DB（c4_manual_elements に指定行を挿入済み）を開く。
 * attachTrailDbFromHandle で trail を ATTACH し、readonly ガードを設置する。
 */
async function openFreshWithTrailRows(rows: TrailRow[]): Promise<{
  db: Database;
  mainPath: string;
  trailDb: Database;
  cleanup: () => void;
}> {
  const mainPath = makeTmpPath('main');
  process.env.MEMORY_CORE_DB_PATH = mainPath;
  const { db } = await openMemoryCoreDb();

  // trail DB をメモリで作成（同じ WASM モジュール内のインスタンス）
  const SQL = await initSqlJs();
  const trailDb = new SQL.Database();
  trailDb.run(`
    CREATE TABLE c4_manual_elements (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    ) STRICT
  `);
  for (const row of rows) {
    trailDb.run(
      `INSERT INTO c4_manual_elements (id, name, description) VALUES (?, ?, ?)`,
      [row.id, row.name, ''],
    );
  }

  // ATTACH（内部 VFS filename を使用）
  attachTrailDbFromHandle(db, trailDb);

  return {
    db,
    mainPath,
    trailDb,
    cleanup: () => {
      try { db.close(); } catch (_) {}
      try { trailDb.close(); } catch (_) {}
      try { fs.unlinkSync(mainPath); } catch (_) {}
      delete process.env.MEMORY_CORE_DB_PATH;
    },
  };
}

/**
 * memory_spec_documents に必要な行を挿入する（FK 制約のために必要）。
 */
function insertSpecDoc(db: Database, specDocId: string): void {
  // installTrailReadonlyGuard 後は db.run のラッパー経由。trail.* でないため通過する。
  const run = (db as unknown as { run: Database['run'] }).run.bind(db);
  run(
    `INSERT OR IGNORE INTO memory_spec_documents
       (id, rel_path, type, title, c4_scope_json, updated_at, source_hash, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [specDocId, `docs/${specDocId}.md`, 'spec', 'Test Doc', '[]', TS, 'hash123', TS],
  );
}

/**
 * memory_entities に specEntityId の Concept entity を挿入する（edges の FK 制約のために必要）。
 */
function insertSpecEntity(db: Database, specEntityId: string): void {
  const run = (db as unknown as { run: Database['run'] }).run.bind(db);
  run(
    `INSERT OR IGNORE INTO memory_entities
       (id, type, canonical_name, display_name, attributes_json,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [specEntityId, 'Concept', `concept-${specEntityId}`, 'Test Concept', '{}', TS, TS, TS],
  );
}

function makeLogger(): { logger: MemoryLogger; warns: string[] } {
  const warns: string[] = [];
  const logger: MemoryLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn((msg: string) => { warns.push(msg); }),
  };
  return { logger, warns };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('linkByC4Scope', () => {
  // ── シナリオ 1: 正常解決 ────────────────────────────────────────────────────

  test('シナリオ1: pkg_ の c4Scope が 1 件解決されること', async () => {
    const { db, cleanup } = await openFreshWithTrailRows([
      { id: 'pkg_memory-core', name: 'memory-core' },
    ]);
    try {
      const specDocId = 'spec-doc-001';
      const specEntityId = entityId('Concept', 'test-spec');
      insertSpecDoc(db, specDocId);
      insertSpecEntity(db, specEntityId);

      const { logger } = makeLogger();
      const result = linkByC4Scope({
        db,
        specDocId,
        specEntityId,
        c4Scope: ['pkg_memory-core'],
        recordedAt: TS,
        logger,
      });

      expect(result.resolved_count).toBe(1);
      expect(result.skipped_count).toBe(0);
      expect(result.edges_inserted).toBe(2);

      // memory_entities に Package entity が 1 件
      const entRows = db.exec(
        `SELECT type, canonical_name FROM memory_entities WHERE type = 'Package'`,
      );
      expect(entRows[0].values).toHaveLength(1);
      expect(entRows[0].values[0][1]).toBe('pkg_memory-core');

      // memory_edges に mentioned_in / relates_to の 2 本
      const edgeRows = db.exec(
        `SELECT predicate FROM memory_edges ORDER BY predicate`,
      );
      const predicates = edgeRows[0].values.map((r) => r[0]);
      expect(predicates).toContain('mentioned_in');
      expect(predicates).toContain('relates_to');
      expect(edgeRows[0].values).toHaveLength(2);

      // memory_spec_doc_entities に 1 件
      const sdeRows = db.exec(
        `SELECT spec_doc_id, entity_id FROM memory_spec_doc_entities`,
      );
      expect(sdeRows[0].values).toHaveLength(1);
      expect(sdeRows[0].values[0][0]).toBe(specDocId);
    } finally {
      cleanup();
    }
  });

  // ── シナリオ 2: 不明 c4Scope → スキップ ────────────────────────────────────

  test('シナリオ2: 不明な c4Scope は skipped_count=1 かつ logger.warn が呼ばれること', async () => {
    const { db, cleanup } = await openFreshWithTrailRows([]);
    try {
      const specDocId = 'spec-doc-002';
      const specEntityId = entityId('Concept', 'test-spec-2');
      insertSpecDoc(db, specDocId);
      insertSpecEntity(db, specEntityId);

      const { logger, warns } = makeLogger();
      const result = linkByC4Scope({
        db,
        specDocId,
        specEntityId,
        c4Scope: ['pkg_unknown'],
        recordedAt: TS,
        logger,
      });

      expect(result.resolved_count).toBe(0);
      expect(result.skipped_count).toBe(1);
      expect(result.edges_inserted).toBe(0);
      expect(warns.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  // ── シナリオ 3: 冪等性（2 回呼んでも重複なし）────────────────────────────────

  test('シナリオ3: 同じ入力で 2 回呼んでも entities/edges が重複しないこと', async () => {
    const { db, cleanup } = await openFreshWithTrailRows([
      { id: 'pkg_memory-core', name: 'memory-core' },
    ]);
    try {
      const specDocId = 'spec-doc-003';
      const specEntityId = entityId('Concept', 'test-spec-3');
      insertSpecDoc(db, specDocId);
      insertSpecEntity(db, specEntityId);

      const { logger } = makeLogger();
      const args = {
        db,
        specDocId,
        specEntityId,
        c4Scope: ['pkg_memory-core'],
        recordedAt: TS,
        logger,
      };

      // 1 回目
      const r1 = linkByC4Scope(args);
      expect(r1.resolved_count).toBe(1);
      expect(r1.edges_inserted).toBe(2);

      // 2 回目
      linkByC4Scope(args);

      // DB 上のレコード数は重複しない
      const entRows = db.exec(`SELECT COUNT(*) FROM memory_entities WHERE type = 'Package'`);
      expect(entRows[0].values[0][0]).toBe(1);

      const edgeRows = db.exec(`SELECT COUNT(*) FROM memory_edges`);
      expect(edgeRows[0].values[0][0]).toBe(2);

      const sdeRows = db.exec(`SELECT COUNT(*) FROM memory_spec_doc_entities`);
      expect(sdeRows[0].values[0][0]).toBe(1);
    } finally {
      cleanup();
    }
  });

  // ── ボーナス: sys_ → Concept としてマップされること ──────────────────────────

  test('sys_ プレフィックスの c4Scope が Concept type として解決されること', async () => {
    const { db, cleanup } = await openFreshWithTrailRows([
      { id: 'sys_anytime-markdown', name: 'anytime-markdown' },
    ]);
    try {
      const specDocId = 'spec-doc-004';
      const specEntityId = entityId('Concept', 'test-spec-4');
      insertSpecDoc(db, specDocId);
      insertSpecEntity(db, specEntityId);

      const { logger } = makeLogger();
      const result = linkByC4Scope({
        db,
        specDocId,
        specEntityId,
        c4Scope: ['sys_anytime-markdown'],
        recordedAt: TS,
        logger,
      });

      expect(result.resolved_count).toBe(1);
      expect(result.skipped_count).toBe(0);
      expect(result.edges_inserted).toBe(2);

      const entRows = db.exec(
        `SELECT type FROM memory_entities WHERE canonical_name = 'sys_anytime-markdown'`,
      );
      expect(entRows[0].values[0][0]).toBe('Concept');
    } finally {
      cleanup();
    }
  });
});
