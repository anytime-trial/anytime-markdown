import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';
import type { Database } from 'sql.js';

describe('TrailDatabase: legacy DB migration on init', () => {
  it('createTables は stable_key 列が無い既存 *_code_graph_communities テーブルでも成功する', async () => {
    // Bootstrap a fresh DB (which already has stable_key), then simulate the
    // legacy state by dropping and recreating those tables WITHOUT the column.
    // This reproduces the production failure where init's CREATE_RELEASE_INDEXES
    // tries to build idx_ccgc_stable_key on a column that doesn't exist.
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS current_code_graph_communities');
    inner.run('DROP TABLE IF EXISTS release_code_graph_communities');
    inner.run('DROP INDEX IF EXISTS idx_ccgc_stable_key');
    inner.run('DROP INDEX IF EXISTS idx_rcgc_stable_key');
    inner.run(`
      CREATE TABLE current_code_graph_communities (
        repo_name    TEXT    NOT NULL,
        community_id INTEGER NOT NULL,
        label        TEXT    NOT NULL DEFAULT '',
        name         TEXT    NOT NULL DEFAULT '',
        summary      TEXT    NOT NULL DEFAULT '',
        generated_at TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        PRIMARY KEY (repo_name, community_id)
      )
    `);
    inner.run(`
      CREATE TABLE release_code_graph_communities (
        release_tag  TEXT    NOT NULL,
        community_id INTEGER NOT NULL,
        label        TEXT    NOT NULL DEFAULT '',
        name         TEXT    NOT NULL DEFAULT '',
        summary      TEXT    NOT NULL DEFAULT '',
        generated_at TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        PRIMARY KEY (release_tag, community_id)
      )
    `);

    // Re-run createTables on the now-degraded DB. Should not throw
    // "no such column: stable_key".
    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    const cur = inner.exec('PRAGMA table_info(current_code_graph_communities)');
    const curCols = (cur[0]?.values ?? []).map((c: ReadonlyArray<unknown>) => String(c[1]));
    expect(curCols).toContain('stable_key');

    const rel = inner.exec('PRAGMA table_info(release_code_graph_communities)');
    const relCols = (rel[0]?.values ?? []).map((c: ReadonlyArray<unknown>) => String(c[1]));
    expect(relCols).toContain('stable_key');
  });

  it('createTables は新規 DB でも従来通り動作する (既存 *_code_graph_communities テーブル無し)', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    const cur = inner.exec('PRAGMA table_info(current_code_graph_communities)');
    const curCols = (cur[0]?.values ?? []).map((c: ReadonlyArray<unknown>) => String(c[1]));
    expect(curCols).toContain('stable_key');

    const rel = inner.exec('PRAGMA table_info(release_code_graph_communities)');
    const relCols = (rel[0]?.values ?? []).map((c: ReadonlyArray<unknown>) => String(c[1]));
    expect(relCols).toContain('stable_key');
  });
});
