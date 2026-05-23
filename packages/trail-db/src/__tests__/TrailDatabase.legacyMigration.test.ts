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

  it('Phase D flip: 旧 PK の legacy session_commits / commit_files / session_commit_resolutions を repo_id PK へ再構築しデータを保持する', async () => {
    // legacy 状態 (旧 PK・repo_id 列なし) を再現し、各テーブルに 1 行入れてから
    // createTables を再実行する。flip 後は repo_id 列 + 新 PK になり、旧データの repo_id が
    // repos.repo_name 経由で backfill されることを確認する。
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS session_commits');
    inner.run('DROP TABLE IF EXISTS commit_files');
    inner.run('DROP TABLE IF EXISTS session_commit_resolutions');
    // 旧スキーマ (repo_id 列なし) を再現。
    inner.run(`
      CREATE TABLE session_commits (
        session_id TEXT NOT NULL,
        commit_hash TEXT NOT NULL,
        commit_message TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '',
        committed_at TEXT,
        is_ai_assisted INTEGER NOT NULL DEFAULT 0,
        files_changed INTEGER NOT NULL DEFAULT 0,
        lines_added INTEGER NOT NULL DEFAULT 0,
        lines_deleted INTEGER NOT NULL DEFAULT 0,
        repo_name TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (session_id, commit_hash)
      )
    `);
    inner.run(`
      CREATE TABLE commit_files (
        commit_hash TEXT NOT NULL,
        file_path TEXT NOT NULL,
        repo_name TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (commit_hash, file_path)
      )
    `);
    inner.run(`
      CREATE TABLE session_commit_resolutions (
        session_id TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        resolved_at TEXT NOT NULL,
        PRIMARY KEY (session_id, repo_name)
      )
    `);
    inner.run(
      "INSERT INTO session_commits (session_id, commit_hash, repo_name, committed_at) VALUES ('legacy-sess', 'h-legacy', 'legacy-sc', '2026-05-23T00:00:00.000Z')",
    );
    inner.run(
      "INSERT INTO commit_files (commit_hash, file_path, repo_name) VALUES ('h-legacy', 'src/a.ts', 'legacy-sc')",
    );
    inner.run(
      "INSERT INTO session_commit_resolutions (session_id, repo_name, resolved_at) VALUES ('legacy-sess', 'legacy-sc', '2026-05-23T00:00:00.000Z')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    // flip 後の各テーブルの PK を確認する。
    const pkOf = (table: string): string[] => {
      const info = inner.exec(`PRAGMA table_info(${table})`);
      const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
      return rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1])).sort();
    };
    const colsOf = (table: string): string[] => {
      const info = inner.exec(`PRAGMA table_info(${table})`);
      const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
      return rows.map((c) => String(c[1]));
    };

    expect(colsOf('session_commits')).toContain('repo_id');
    expect(colsOf('session_commits')).toContain('repo_name'); // 移行互換で残置
    // PK は (session_id, repo_id, commit_hash) → ソートで commit_hash, repo_id, session_id。
    expect(pkOf('session_commits')).toEqual(['commit_hash', 'repo_id', 'session_id']);
    expect(pkOf('commit_files')).toEqual(['commit_hash', 'file_path', 'repo_id']);
    expect(pkOf('session_commit_resolutions')).toEqual(['repo_id', 'session_id']);

    // 旧データが repo_id backfill 済で残っている。
    const repoIdViaName = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('legacy-sc');
    const sc = inner.exec("SELECT repo_id, repo_name, commit_hash FROM session_commits WHERE session_id = 'legacy-sess'");
    expect(Number(sc[0]?.values?.[0]?.[0])).toBe(repoIdViaName);
    expect(String(sc[0]?.values?.[0]?.[1])).toBe('legacy-sc');

    const cf = inner.exec("SELECT repo_id, file_path FROM commit_files WHERE commit_hash = 'h-legacy'");
    expect(Number(cf[0]?.values?.[0]?.[0])).toBe(repoIdViaName);
    expect(String(cf[0]?.values?.[0]?.[1])).toBe('src/a.ts');

    const res = inner.exec("SELECT repo_id FROM session_commit_resolutions WHERE session_id = 'legacy-sess'");
    expect(Number(res[0]?.values?.[0]?.[0])).toBe(repoIdViaName);
  });

  it('Phase D additive: legacy sessions (repo_id 列なし) に repo_id を追加し repo_name から backfill する', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS sessions');
    // 旧 sessions (repo_id 列なし)。PK は id のまま。
    inner.run(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL DEFAULT '',
        repo_name TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        entrypoint TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        start_time TEXT,
        end_time TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT,
        source TEXT NOT NULL DEFAULT 'claude_code'
      )
    `);
    inner.run(
      "INSERT INTO sessions (id, repo_name) VALUES ('legacy-s', 'legacy-sessrepo')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    const info = inner.exec('PRAGMA table_info(sessions)');
    const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const colNames = rows.map((c) => String(c[1]));
    expect(colNames).toContain('repo_id');
    // PK は id のまま (additive のため変更しない)。
    const pkCols = rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1]));
    expect(pkCols).toEqual(['id']);

    const repoIdViaName = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('legacy-sessrepo');
    const s = inner.exec("SELECT repo_id, repo_name FROM sessions WHERE id = 'legacy-s'");
    expect(Number(s[0]?.values?.[0]?.[0])).toBe(repoIdViaName);
  });

  it('Phase D: legacy sessions に project 列が残る DB でも、project 撤去再構築後に repo_id とその backfill 値が保持される', async () => {
    // 旧 DB が project 列を持つケース: migrateSessionCommitTablesRepoId(→migrateSessionsRepoIdColumn)
    // で repo_id を追加・backfill した後に migrateDropSessionsProjectColumn が sessions を再構築する。
    // 再構築 SELECT に repo_id を含めないと、追加直後の repo_id 列とその値が消失する (回帰)。
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS sessions');
    // 旧 sessions (project 列あり・repo_id 列なし)。
    inner.run(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL DEFAULT '',
        repo_name TEXT NOT NULL DEFAULT '',
        project TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        entrypoint TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        message_count INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL DEFAULT '',
        file_size INTEGER NOT NULL DEFAULT 0,
        imported_at TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'claude_code'
      )
    `);
    inner.run(
      "INSERT INTO sessions (id, repo_name, project) VALUES ('proj-s', 'proj-sessrepo', 'old-project')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    const info = inner.exec('PRAGMA table_info(sessions)');
    const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const colNames = rows.map((c) => String(c[1]));
    // project は撤去され、repo_id は保持される。
    expect(colNames).not.toContain('project');
    expect(colNames).toContain('repo_id');
    expect(colNames).toContain('repo_name');

    // repo_id の backfill 値が project 撤去再構築をまたいで保持される。
    const repoIdViaName = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('proj-sessrepo');
    const s = inner.exec("SELECT repo_id, repo_name FROM sessions WHERE id = 'proj-s'");
    expect(Number(s[0]?.values?.[0]?.[0])).toBe(repoIdViaName);
    expect(String(s[0]?.values?.[0]?.[1])).toBe('proj-sessrepo');
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
