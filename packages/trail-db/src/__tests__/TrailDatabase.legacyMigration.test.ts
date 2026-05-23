import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';
import type { SqlJsCompatDatabase as Database } from '../internal/SqlJsCompatDatabase';

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

  it('Phase C-2 flip: repo_name PK の legacy current_code_graph_communities を repo_id PK へ再構築する', async () => {
    // legacy 状態 (repo_name PK・repo_id 列なし) を再現し、data を 1 行入れてから
    // createTables を再実行する。flip 後は repo_id 列 + (repo_id, community_id) PK になり、
    // 旧データの repo_id が repos.repo_name 経由で backfill されることを確認する。
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS current_code_graph_communities');
    inner.run('DROP INDEX IF EXISTS idx_ccgc_stable_key');
    inner.run(`
      CREATE TABLE current_code_graph_communities (
        repo_name    TEXT    NOT NULL,
        community_id INTEGER NOT NULL,
        label        TEXT    NOT NULL DEFAULT '',
        name         TEXT    NOT NULL DEFAULT '',
        summary      TEXT    NOT NULL DEFAULT '',
        stable_key   TEXT    NOT NULL DEFAULT '',
        generated_at TEXT,
        updated_at   TEXT,
        PRIMARY KEY (repo_name, community_id)
      )
    `);
    inner.run(
      "INSERT INTO current_code_graph_communities (repo_name, community_id, label, name, summary, stable_key, generated_at, updated_at) VALUES ('legacy-repo', 3, 'L', 'N', 'S', 'sk', '2026-05-23T00:00:00.000Z', '2026-05-23T00:00:00.000Z')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    // flip 後: repo_id 列が追加され、PK が (repo_id, community_id) になっている。
    const info = inner.exec('PRAGMA table_info(current_code_graph_communities)');
    const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const colNames = rows.map((c) => String(c[1]));
    expect(colNames).toContain('repo_id');
    expect(colNames).toContain('repo_name'); // 移行互換のため残置
    // pk 列 (5 番目フィールド) が 1 以上の列を PK 構成列とみなす。
    const pkCols = rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1])).sort();
    expect(pkCols).toEqual(['community_id', 'repo_id']);

    // 旧データが repo_id backfill 済で残っている。
    const data = inner.exec(
      "SELECT repo_id, repo_name, community_id, name FROM current_code_graph_communities WHERE repo_name = 'legacy-repo'",
    );
    const dataRow = data[0]?.values?.[0];
    expect(dataRow).toBeDefined();
    expect(Number(dataRow![0])).toBeGreaterThan(0); // repo_id が backfill された
    expect(String(dataRow![3])).toBe('N');
    // repo_id が repos.repo_name='legacy-repo' に対応している。
    const repoIdViaName = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('legacy-repo');
    expect(Number(dataRow![0])).toBe(repoIdViaName);
  });

  it('Phase C-2 flip: repo_name PK の legacy current_file_analysis を repo_id PK へ再構築しデータを保持する', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS current_file_analysis');
    inner.run(`
      CREATE TABLE current_file_analysis (
        repo_name                  TEXT NOT NULL,
        file_path                  TEXT NOT NULL,
        importance_score           REAL    NOT NULL DEFAULT 0,
        fan_in_total               INTEGER NOT NULL DEFAULT 0,
        cognitive_complexity_max   INTEGER NOT NULL DEFAULT 0,
        line_count                 INTEGER NOT NULL DEFAULT 0,
        cyclomatic_complexity_max  INTEGER NOT NULL DEFAULT 0,
        function_count             INTEGER NOT NULL DEFAULT 0,
        dead_code_score            INTEGER NOT NULL DEFAULT 0,
        signal_orphan              INTEGER NOT NULL DEFAULT 0,
        signal_fan_in_zero         INTEGER NOT NULL DEFAULT 0,
        signal_no_recent_churn     INTEGER NOT NULL DEFAULT 0,
        signal_zero_coverage       INTEGER NOT NULL DEFAULT 0,
        signal_isolated_community  INTEGER NOT NULL DEFAULT 0,
        is_ignored                 INTEGER NOT NULL DEFAULT 0,
        ignore_reason              TEXT NOT NULL DEFAULT '',
        cross_pkg_in_count         INTEGER NOT NULL DEFAULT 0,
        external_consumer_pkgs     INTEGER NOT NULL DEFAULT 0,
        total_in_count             INTEGER NOT NULL DEFAULT 0,
        is_barrel                  INTEGER NOT NULL DEFAULT 0,
        centrality_score           REAL    NOT NULL DEFAULT 0,
        category                   TEXT NOT NULL DEFAULT 'logic',
        analyzed_at                TEXT NOT NULL,
        PRIMARY KEY (repo_name, file_path)
      )
    `);
    inner.run(
      "INSERT INTO current_file_analysis (repo_name, file_path, analyzed_at) VALUES ('legacy-fa', 'src/a.ts', '2026-05-23T00:00:00.000Z')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    const info = inner.exec('PRAGMA table_info(current_file_analysis)');
    const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const colNames = rows.map((c) => String(c[1]));
    expect(colNames).toContain('repo_id');
    const pkCols = rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1])).sort();
    expect(pkCols).toEqual(['file_path', 'repo_id']);

    // データが repo_id backfill 済で生存している。
    const fa = db.getCurrentFileAnalysis('legacy-fa');
    expect(fa).toHaveLength(1);
    expect(fa[0].filePath).toBe('src/a.ts');
  });

  it('createTables は新規 DB でも従来通り動作する (既存 *_code_graph_communities テーブル無し)', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    const cur = inner.exec('PRAGMA table_info(current_code_graph_communities)');
    const curCols = (cur[0]?.values ?? []).map((c: ReadonlyArray<unknown>) => String(c[1]));
    expect(curCols).toContain('stable_key');
    // Phase C-2 flip: 新規 DB の current_code_graph_communities は repo_id 列を持つ。
    expect(curCols).toContain('repo_id');

    const rel = inner.exec('PRAGMA table_info(release_code_graph_communities)');
    const relCols = (rel[0]?.values ?? []).map((c: ReadonlyArray<unknown>) => String(c[1]));
    expect(relCols).toContain('stable_key');
  });
});
