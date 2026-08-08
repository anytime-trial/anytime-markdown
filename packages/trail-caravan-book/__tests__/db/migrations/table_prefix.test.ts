import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openMemoryCoreDb } from '../../../src/db/connection';

/**
 * 023/024: memory_* / pipeline_* → caravan_* 接頭辞移行。
 * レガシー DB（001〜022 適用済み・データ入り）を better-sqlite3 で直接構築し、
 * openMemoryCoreDb が 023/024 を適用してデータ温存のまま改名することを検証する。
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-table-prefix-'));
const legacyDb = path.join(tmpDir, 'legacy.db');
const migrationsDir = path.join(__dirname, '../../../src/db/migrations');

function buildLegacyDb(file: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  const db = new Database(file);
  for (let v = 1; v <= 22; v++) {
    const sqlFile = fs
      .readdirSync(migrationsDir)
      .find((f) => f.startsWith(`${String(v).padStart(3, '0')}_`) && f.endsWith('.sql'));
    if (!sqlFile) throw new Error(`migration file for version ${v} not found`);
    db.exec(fs.readFileSync(path.join(migrationsDir, sqlFile), 'utf8'));
  }
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT`);
  const ins = db.prepare(`INSERT INTO _migrations (version, applied_at) VALUES (?, ?)`);
  for (let v = 1; v <= 22; v++) ins.run(v, '2026-08-08T00:00:00Z');
  db.prepare(
    `INSERT INTO memory_entities
       (id, type, canonical_name, display_name, aliases_json, summary,
        first_seen_at, last_updated_at, recorded_at)
     VALUES (?, 'Concept', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'ent1',
    'table prefix',
    'Table Prefix',
    JSON.stringify(['prefix rename', '接頭辞']),
    'テーブル接頭辞移行の検証用エンティティ',
    '2026-08-08T00:00:00Z',
    '2026-08-08T00:00:00Z',
    '2026-08-08T00:00:00Z',
  );
  // 旧 FTS にも 1 行入れて「旧 FTS が捨てられ新 FTS が再構成される」ことを観測する
  db.prepare(
    `INSERT INTO memory_entities_fts (rowid, display_name, summary, aliases_text)
     VALUES ((SELECT rowid FROM memory_entities WHERE id = 'ent1'), 'Table Prefix',
             'テーブル接頭辞移行の検証用エンティティ', 'prefix rename 接頭辞')`,
  ).run();
  db.close();
}

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('migration 023/024 (table prefix)', () => {
  test('レガシー DB のデータを温存したまま caravan_ 接頭辞へ改名する', async () => {
    buildLegacyDb(legacyDb);
    const { db, close } = await openMemoryCoreDb(legacyDb);

    const names = (
      db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )[0]?.values ?? []
    ).map((r) => r[0] as string);

    // 旧名の残存ゼロ（FTS の内部 shadow テーブル含む）
    expect(names.filter((n) => n.startsWith('memory_'))).toEqual([]);
    expect(names).not.toContain('pipeline_runs');
    expect(names).not.toContain('pipeline_run_logs');
    // 新名の実在
    expect(names).toContain('caravan_entities');
    expect(names).toContain('caravan_pipeline_state');
    expect(names).toContain('caravan_pipeline_runs');
    expect(names).toContain('caravan_pipeline_run_logs');
    expect(names).toContain('caravan_entities_fts');
    expect(names).toContain('caravan_episodes_fts');
    expect(names).toContain('caravan_drift_events_fts');

    // データ温存
    const row = db.exec(`SELECT display_name, summary FROM caravan_entities WHERE id = 'ent1'`);
    expect(row[0]?.values[0]).toEqual(['Table Prefix', 'テーブル接頭辞移行の検証用エンティティ']);

    // FTS 再構成: 新 FTS で BM25 検索が当たる（aliases_text は aliases_json 由来）
    const hit = db.exec(
      `SELECT rowid FROM caravan_entities_fts WHERE caravan_entities_fts MATCH 'prefix'`,
    );
    expect(hit[0]?.values.length).toBe(1);

    // integrity_check ok（contentless FTS 一括操作の破損罠の検査）
    expect(db.exec('PRAGMA integrity_check')[0]?.values[0][0]).toBe('ok');

    close();
  }, 30000);

  test('新規 DB（全 migration 一括適用）でも同じ最終状態に収束する', async () => {
    const freshDb = path.join(tmpDir, 'fresh.db');
    const { db, close } = await openMemoryCoreDb(freshDb);

    const names = (
      db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )[0]?.values ?? []
    ).map((r) => r[0] as string);
    expect(names.filter((n) => n.startsWith('memory_'))).toEqual([]);
    expect(names).toContain('caravan_entities');
    expect(names).toContain('caravan_relation_types');

    // seed（relation_types 21 件）が新名テーブルに引き継がれている
    const count = db.exec('SELECT COUNT(*) FROM caravan_relation_types')[0]?.values[0][0];
    expect(count).toBe(21);

    close();
  }, 30000);
});
