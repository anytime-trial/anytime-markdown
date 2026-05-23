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

  it('Phase E flip: 旧 PK / 複合 FK の legacy c4_manual_* を repo_id PK へ再構築し、データ・複合 FK・backfill を保持する', async () => {
    // legacy 状態 (旧 PK (repo_name, <id>)・自己参照/複合 FK・repo_id 列なし) を再現し、各テーブルに
    // 親子・複合 FK を含む data を入れてから createTables を再実行する。flip 後は repo_id 列 + 新 PK
    // (repo_id, <id>) + repo_id ベースの複合 FK になり、旧データの repo_id が repos.repo_name 経由で
    // backfill される。Phase H-2: 続いて repo_name 列が物理撤去される (複合 PK/FK は repo_id 構成のため不変)。
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS c4_manual_relationships');
    inner.run('DROP TABLE IF EXISTS c4_manual_groups');
    inner.run('DROP TABLE IF EXISTS c4_manual_elements');
    // 旧スキーマ (repo_id 列なし・旧 PK・複合 FK) を再現。
    inner.run(`
      CREATE TABLE c4_manual_elements (
        repo_name    TEXT NOT NULL,
        element_id   TEXT NOT NULL,
        type         TEXT NOT NULL,
        name         TEXT NOT NULL,
        description  TEXT,
        external     INTEGER NOT NULL DEFAULT 0,
        parent_id    TEXT,
        service_type TEXT,
        updated_at   TEXT NOT NULL,
        PRIMARY KEY (repo_name, element_id),
        FOREIGN KEY (repo_name, parent_id) REFERENCES c4_manual_elements(repo_name, element_id)
      ) STRICT
    `);
    inner.run(`
      CREATE TABLE c4_manual_relationships (
        repo_name   TEXT NOT NULL,
        rel_id      TEXT NOT NULL,
        from_id     TEXT NOT NULL,
        to_id       TEXT NOT NULL,
        label       TEXT,
        technology  TEXT,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (repo_name, rel_id),
        FOREIGN KEY (repo_name, from_id) REFERENCES c4_manual_elements(repo_name, element_id),
        FOREIGN KEY (repo_name, to_id)   REFERENCES c4_manual_elements(repo_name, element_id)
      ) STRICT
    `);
    inner.run(`
      CREATE TABLE c4_manual_groups (
        repo_name  TEXT NOT NULL,
        group_id   TEXT NOT NULL,
        member_ids TEXT NOT NULL,
        label      TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (repo_name, group_id)
      ) STRICT
    `);
    // 親要素 → 子要素 (parent_id 自己参照) + relationship (複合 FK) + group。
    inner.run(
      "INSERT INTO c4_manual_elements (repo_name, element_id, type, name, parent_id, updated_at) VALUES ('legacy-c4', 'sys_manual_1', 'system', 'Parent Sys', NULL, '2026-05-23T00:00:00.000Z')",
    );
    inner.run(
      "INSERT INTO c4_manual_elements (repo_name, element_id, type, name, parent_id, updated_at) VALUES ('legacy-c4', 'pkg_manual_1', 'container', 'Child Pkg', 'sys_manual_1', '2026-05-23T00:00:00.000Z')",
    );
    inner.run(
      "INSERT INTO c4_manual_relationships (repo_name, rel_id, from_id, to_id, label, updated_at) VALUES ('legacy-c4', 'rel_manual_1', 'pkg_manual_1', 'sys_manual_1', 'uses', '2026-05-23T00:00:00.000Z')",
    );
    inner.run(
      "INSERT INTO c4_manual_groups (repo_name, group_id, member_ids, label, updated_at) VALUES ('legacy-c4', 'grp_manual_1', '[\"sys_manual_1\",\"pkg_manual_1\"]', 'Group A', '2026-05-23T00:00:00.000Z')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

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

    // flip 後: repo_id 列が追加され、PK が (repo_id, <id>) になっている。
    // Phase H-2: repo_name は物理撤去済 (read は repo_id = ? で絞る)。
    for (const table of ['c4_manual_elements', 'c4_manual_relationships', 'c4_manual_groups']) {
      expect(colsOf(table)).toContain('repo_id');
      expect(colsOf(table)).not.toContain('repo_name');
    }
    // PK は ソートで [element_id, repo_id] / [rel_id, repo_id] / [group_id, repo_id]。
    expect(pkOf('c4_manual_elements')).toEqual(['element_id', 'repo_id']);
    expect(pkOf('c4_manual_relationships')).toEqual(['rel_id', 'repo_id']);
    expect(pkOf('c4_manual_groups')).toEqual(['group_id', 'repo_id']);

    // 複合 FK が repo_id ベースへ張替わっている (foreign_key_list の to/from 列を確認)。
    const elemFks = inner.exec('PRAGMA foreign_key_list(c4_manual_elements)');
    const elemFkRows = (elemFks[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    // 自己参照複合 FK: from 列に repo_id と parent_id、to 列に repo_id と element_id を含む。
    const elemFromCols = elemFkRows.map((r) => String(r[3]));
    const elemToCols = elemFkRows.map((r) => String(r[4]));
    expect(elemFromCols).toContain('repo_id');
    expect(elemFromCols).toContain('parent_id');
    expect(elemToCols).toContain('element_id');

    const relFks = inner.exec('PRAGMA foreign_key_list(c4_manual_relationships)');
    const relFkRows = (relFks[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const relFromCols = relFkRows.map((r) => String(r[3]));
    expect(relFromCols).toContain('repo_id');
    expect(relFromCols).toContain('from_id');
    expect(relFromCols).toContain('to_id');

    // 旧データが repo_id backfill 済で全件残っている (除外 0 件・データ保全)。
    // Phase H-2: repo_name 列は無いため repo_id = ? で絞る。
    const repoIdViaName = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('legacy-c4');
    const elems = inner.exec('SELECT repo_id, element_id, parent_id FROM c4_manual_elements WHERE repo_id = ? ORDER BY element_id', [repoIdViaName]);
    const elemVals = (elems[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    expect(elemVals).toHaveLength(2);
    for (const row of elemVals) {
      expect(Number(row[0])).toBe(repoIdViaName); // repo_id backfill
    }
    // 子要素の parent_id 自己参照が保持されている。
    const child = elemVals.find((r) => String(r[1]) === 'pkg_manual_1');
    expect(String(child?.[2])).toBe('sys_manual_1');

    const rels = inner.exec('SELECT repo_id, from_id, to_id, label FROM c4_manual_relationships WHERE repo_id = ?', [repoIdViaName]);
    const relVals = (rels[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    expect(relVals).toHaveLength(1);
    expect(Number(relVals[0]?.[0])).toBe(repoIdViaName);
    expect(String(relVals[0]?.[1])).toBe('pkg_manual_1');
    expect(String(relVals[0]?.[2])).toBe('sys_manual_1');
    expect(String(relVals[0]?.[3])).toBe('uses');

    const groups = inner.exec('SELECT repo_id, member_ids, label FROM c4_manual_groups WHERE repo_id = ?', [repoIdViaName]);
    const groupVals = (groups[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    expect(groupVals).toHaveLength(1);
    expect(Number(groupVals[0]?.[0])).toBe(repoIdViaName);
    expect(JSON.parse(String(groupVals[0]?.[1]))).toEqual(['sys_manual_1', 'pkg_manual_1']);

    // flip 後の高レベル API が新 PK 上で機能する (consumer 追従の検証)。
    const apiElems = db.getManualElements('legacy-c4');
    expect(apiElems).toHaveLength(2);
    const newId = db.saveManualElement('legacy-c4', { type: 'person', name: 'New User', external: false, parentId: null });
    expect(newId).toBe('person_1');
    expect(db.getManualElements('legacy-c4')).toHaveLength(3);

    db.close();
  });

  it('Phase E flip: 新規 DB の c4_manual_* は repo_id 列 + (repo_id, <id>) PK を持つ', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;
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
    expect(colsOf('c4_manual_elements')).toContain('repo_id');
    // Phase H-2: 新規 DB の c4_manual_* は repo_name 列を持たない。
    expect(colsOf('c4_manual_elements')).not.toContain('repo_name');
    expect(colsOf('c4_manual_relationships')).not.toContain('repo_name');
    expect(colsOf('c4_manual_groups')).not.toContain('repo_name');
    expect(pkOf('c4_manual_elements')).toEqual(['element_id', 'repo_id']);
    expect(pkOf('c4_manual_relationships')).toEqual(['rel_id', 'repo_id']);
    expect(pkOf('c4_manual_groups')).toEqual(['group_id', 'repo_id']);
    db.close();
  });

  it('Phase H-2: repo_name 列ありの legacy c4_manual_* から repo_name を物理撤去し repo_id データ・複合 FK を保全する', async () => {
    // Phase E flip 済の中間スキーマ = repo_id PK + 複合 FK + repo_name 残置列を再現する (撤去直前の状態)。
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;
    const colsOf = (table: string): string[] => {
      const info = inner.exec(`PRAGMA table_info(${table})`);
      const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
      return rows.map((c) => String(c[1]));
    };
    const pkOf = (table: string): string[] => {
      const info = inner.exec(`PRAGMA table_info(${table})`);
      const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
      return rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1])).sort();
    };

    inner.run('DROP TABLE IF EXISTS c4_manual_relationships');
    inner.run('DROP TABLE IF EXISTS c4_manual_groups');
    inner.run('DROP TABLE IF EXISTS c4_manual_elements');
    inner.run(`
      CREATE TABLE c4_manual_elements (
        repo_id      INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
        repo_name    TEXT NOT NULL DEFAULT '',
        element_id   TEXT NOT NULL,
        type         TEXT NOT NULL
          CHECK (type IN ('person', 'system', 'container', 'component', 'code', 'enterprise')),
        name         TEXT NOT NULL,
        description  TEXT,
        external     INTEGER NOT NULL DEFAULT 0 CHECK (external IN (0, 1)),
        parent_id    TEXT,
        service_type TEXT,
        updated_at   TEXT NOT NULL,
        PRIMARY KEY (repo_id, element_id),
        FOREIGN KEY (repo_id, parent_id) REFERENCES c4_manual_elements(repo_id, element_id)
      ) STRICT
    `);
    inner.run(`
      CREATE TABLE c4_manual_relationships (
        repo_id     INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
        repo_name   TEXT NOT NULL DEFAULT '',
        rel_id      TEXT NOT NULL,
        from_id     TEXT NOT NULL,
        to_id       TEXT NOT NULL,
        label       TEXT,
        technology  TEXT,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (repo_id, rel_id),
        FOREIGN KEY (repo_id, from_id) REFERENCES c4_manual_elements(repo_id, element_id),
        FOREIGN KEY (repo_id, to_id)   REFERENCES c4_manual_elements(repo_id, element_id)
      ) STRICT
    `);
    inner.run(`
      CREATE TABLE c4_manual_groups (
        repo_id    INTEGER NOT NULL REFERENCES repos(repo_id) ON DELETE CASCADE,
        repo_name  TEXT NOT NULL DEFAULT '',
        group_id   TEXT NOT NULL,
        member_ids TEXT NOT NULL CHECK (json_valid(member_ids)),
        label      TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (repo_id, group_id)
      ) STRICT
    `);

    // repo_id を repos 経由で確定させてからデータ投入する (repo_id と repo_name を整合)。
    const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('h2-repo');
    inner.run(
      "INSERT INTO c4_manual_elements (repo_id, repo_name, element_id, type, name, parent_id, updated_at) VALUES (?, 'h2-repo', 'sys_manual_1', 'system', 'Parent', NULL, '2026-05-23T00:00:00.000Z')",
      [repoId],
    );
    inner.run(
      "INSERT INTO c4_manual_elements (repo_id, repo_name, element_id, type, name, parent_id, updated_at) VALUES (?, 'h2-repo', 'pkg_manual_1', 'container', 'Child', 'sys_manual_1', '2026-05-23T00:00:00.000Z')",
      [repoId],
    );
    inner.run(
      "INSERT INTO c4_manual_relationships (repo_id, repo_name, rel_id, from_id, to_id, label, updated_at) VALUES (?, 'h2-repo', 'rel_manual_1', 'pkg_manual_1', 'sys_manual_1', 'uses', '2026-05-23T00:00:00.000Z')",
      [repoId],
    );
    inner.run(
      "INSERT INTO c4_manual_groups (repo_id, repo_name, group_id, member_ids, label, updated_at) VALUES (?, 'h2-repo', 'grp_manual_1', '[\"sys_manual_1\",\"pkg_manual_1\"]', 'Group A', '2026-05-23T00:00:00.000Z')",
      [repoId],
    );

    // createTables を再実行 → H-2 drop migration が repo_name を撤去する。例外なく完了すること。
    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    // 3 テーブルから repo_name が消え、repo_id・複合 PK は残っている。
    for (const t of ['c4_manual_elements', 'c4_manual_relationships', 'c4_manual_groups']) {
      expect(colsOf(t)).not.toContain('repo_name');
      expect(colsOf(t)).toContain('repo_id');
    }
    expect(pkOf('c4_manual_elements')).toEqual(['element_id', 'repo_id']);
    expect(pkOf('c4_manual_relationships')).toEqual(['rel_id', 'repo_id']);
    expect(pkOf('c4_manual_groups')).toEqual(['group_id', 'repo_id']);

    // 複合 FK が repo_id ベースのまま維持されている。
    const relFks = inner.exec('PRAGMA foreign_key_list(c4_manual_relationships)');
    const relFkRows = (relFks[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const relFromCols = relFkRows.map((r) => String(r[3]));
    expect(relFromCols).toContain('repo_id');
    expect(relFromCols).toContain('from_id');
    expect(relFromCols).toContain('to_id');
    const elemFks = inner.exec('PRAGMA foreign_key_list(c4_manual_elements)');
    const elemFkRows = (elemFks[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    expect(elemFkRows.map((r) => String(r[3]))).toContain('parent_id');

    // repo_id データ・親子自己参照が保全されている。
    const elems = inner.exec('SELECT repo_id, element_id, parent_id FROM c4_manual_elements WHERE repo_id = ? ORDER BY element_id', [repoId]);
    const elemVals = (elems[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    expect(elemVals).toHaveLength(2);
    const child = elemVals.find((r) => String(r[1]) === 'pkg_manual_1');
    expect(String(child?.[2])).toBe('sys_manual_1');
    expect(Number(inner.exec('SELECT repo_id FROM c4_manual_relationships WHERE rel_id = ?', ['rel_manual_1'])[0]?.values?.[0]?.[0])).toBe(repoId);
    expect(Number(inner.exec('SELECT repo_id FROM c4_manual_groups WHERE group_id = ?', ['grp_manual_1'])[0]?.values?.[0]?.[0])).toBe(repoId);

    // read メソッドは repoName を入力に取り、repo_id で絞った結果を返す (下流契約不変)。
    expect(db.getManualElements('h2-repo')).toHaveLength(2);
    expect(db.getManualRelationships('h2-repo')).toHaveLength(1);
    expect(db.getManualGroups('h2-repo')).toHaveLength(1);
    // 撤去後も write が機能する (新規 element を追加できる)。
    const newId = db.saveManualElement('h2-repo', { type: 'person', name: 'New User', external: false, parentId: null });
    expect(newId).toBe('person_1');
    expect(db.getManualElements('h2-repo')).toHaveLength(3);

    // 冪等: 再度 createTables を走らせても repo_name は無いまま例外なく完了する。
    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();
    for (const t of ['c4_manual_elements', 'c4_manual_relationships', 'c4_manual_groups']) {
      expect(colsOf(t)).not.toContain('repo_name');
    }
    expect(db.getManualElements('h2-repo')).toHaveLength(3);

    db.close();
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

  it('Phase F flip: 旧 PK (repo_name, period) の legacy dora_metrics を (repo_id, period) PK へ再構築しデータ・backfill を保持する', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS dora_metrics');
    // 旧スキーマ (repo_id 列なし・旧 PK (repo_name, period)) を再現。
    inner.run(`
      CREATE TABLE dora_metrics (
        repo_name TEXT NOT NULL,
        period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
        deployment_frequency REAL NOT NULL DEFAULT 0,
        lead_time_hours REAL,
        computed_at TEXT NOT NULL,
        PRIMARY KEY (repo_name, period)
      ) STRICT
    `);
    inner.run(
      "INSERT INTO dora_metrics (repo_name, period, deployment_frequency, lead_time_hours, computed_at) VALUES ('legacy-dora', '2026-01', 3, 24, '2026-05-23T00:00:00.000Z')",
    );
    inner.run(
      "INSERT INTO dora_metrics (repo_name, period, deployment_frequency, lead_time_hours, computed_at) VALUES ('legacy-dora', '2026-02', 1, NULL, '2026-05-23T00:00:00.000Z')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    const info = inner.exec('PRAGMA table_info(dora_metrics)');
    const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const colNames = rows.map((c) => String(c[1]));
    expect(colNames).toContain('repo_id');
    expect(colNames).not.toContain('repo_name'); // Phase H-1: 物理撤去済
    // PK は (repo_id, period) → ソートで period, repo_id。
    const pkCols = rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1])).sort();
    expect(pkCols).toEqual(['period', 'repo_id']);

    // 旧データが repo_id backfill 済で全件残っている (除外 0 件)。repo_name は repos 経由で復元する。
    const repoIdViaName = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('legacy-dora');
    const data = inner.exec(
      `SELECT d.repo_id, r.repo_name, d.period, d.deployment_frequency, d.lead_time_hours
       FROM dora_metrics d JOIN repos r USING(repo_id) WHERE d.repo_id = ? ORDER BY d.period`,
      [repoIdViaName],
    );
    const vals = (data[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    expect(vals).toHaveLength(2);
    for (const row of vals) {
      expect(Number(row[0])).toBe(repoIdViaName); // repo_id backfill
      expect(String(row[1])).toBe('legacy-dora'); // repo_name は JOIN repos で復元
    }
    expect(String(vals[0]?.[2])).toBe('2026-01');
    expect(Number(vals[0]?.[3])).toBe(3);
    expect(Number(vals[0]?.[4])).toBe(24);
    expect(vals[1]?.[4]).toBeNull(); // lead_time_hours NULL 保持

    // flip 後の高レベル API が新 PK 上で機能する (consumer 追従の検証)。
    expect(() =>
      db.replaceDoraMetrics([
        { repoName: 'legacy-dora', period: '2026-03', deploymentFrequency: 2, leadTimeHours: 5, computedAt: '2026-05-23T00:00:00.000Z' },
      ]),
    ).not.toThrow();
    const after = inner.exec('SELECT repo_id, period FROM dora_metrics');
    const afterVals = (after[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    expect(afterVals).toHaveLength(1); // wash-away
    expect(Number(afterVals[0]?.[0])).toBe(repoIdViaName);
    expect(String(afterVals[0]?.[1])).toBe('2026-03');

    db.close();
  });

  it('Phase F additive: legacy pr_reviews (repo_id 列なし) に repo_id を追加し backfill する。PK は review_id のまま', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS pr_reviews');
    inner.run('DROP INDEX IF EXISTS idx_pr_reviews_repo_pr');
    // 旧スキーマ (repo_id 列なし・PK は review_id 単独・旧 repo フィルタ索引あり)。
    inner.run(`
      CREATE TABLE pr_reviews (
        review_id TEXT PRIMARY KEY,
        repo_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL CHECK (state IN ('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED')),
        submitted_at TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        body_hash TEXT NOT NULL DEFAULT ''
      ) STRICT
    `);
    inner.run('CREATE INDEX idx_pr_reviews_repo_pr ON pr_reviews(repo_name, pr_number)');
    inner.run(
      "INSERT INTO pr_reviews (review_id, repo_name, pr_number, author, state, submitted_at, body, body_hash) VALUES ('rev-legacy', 'legacy-pr', 42, 'bob', 'APPROVED', '2026-05-23T00:00:00.000Z', 'lgtm', 'h1')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    const info = inner.exec('PRAGMA table_info(pr_reviews)');
    const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const colNames = rows.map((c) => String(c[1]));
    expect(colNames).toContain('repo_id');
    expect(colNames).not.toContain('repo_name'); // Phase H-1: 物理撤去済
    // PK は review_id のまま不変 (additive)。
    const pkCols = rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1]));
    expect(pkCols).toEqual(['review_id']);

    // repo_id が backfill されている。repo_name は repos 経由で復元する (read メソッドの契約)。
    const repoIdViaName = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('legacy-pr');
    const data = inner.exec("SELECT repo_id FROM pr_reviews WHERE review_id = 'rev-legacy'");
    expect(Number(data[0]?.values?.[0]?.[0])).toBe(repoIdViaName);
    // read メソッドは依然 repoName を返す (契約不変)。
    expect(db.getPrReviewDetail('rev-legacy')?.repoName).toBe('legacy-pr');
    expect(db.getPrReviews().find((r) => r.reviewId === 'rev-legacy')?.repoName).toBe('legacy-pr');

    // 旧索引が撤去され、新 repo_id 先頭索引が張られている。
    const idx = inner.exec("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='pr_reviews'");
    const idxNames = (idx[0]?.values ?? []).map((r: ReadonlyArray<unknown>) => String(r[0]));
    expect(idxNames).not.toContain('idx_pr_reviews_repo_pr');
    expect(idxNames).toContain('idx_pr_reviews_repo_id_pr');

    // flip 後の高レベル API が repo_id を埋める (consumer 追従の検証)。
    db.upsertPrReview({
      reviewId: 'rev-new', repoName: 'legacy-pr', prNumber: 99, author: 'carol',
      state: 'COMMENTED', submittedAt: '2026-05-23T00:00:00.000Z', body: 'nit', bodyHash: 'h2', comments: [],
    });
    const newRow = inner.exec("SELECT repo_id FROM pr_reviews WHERE review_id = 'rev-new'");
    expect(Number(newRow[0]?.values?.[0]?.[0])).toBe(repoIdViaName);

    db.close();
  });

  it('Phase F additive: legacy cross_source_correlations (repo_id 列なし) に repo_id を追加し backfill する。PK は不変', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;

    inner.run('DROP TABLE IF EXISTS cross_source_correlations');
    inner.run('DROP INDEX IF EXISTS idx_cross_source_correlations_repo');
    // 旧スキーマ (repo_id 列なし・PK は (correlation_type, source_a_id, source_b_id)・旧 repo 索引あり)。
    inner.run(`
      CREATE TABLE cross_source_correlations (
        correlation_type TEXT NOT NULL
          CHECK (correlation_type IN ('pr_review_session', 'pr_review_release', 'pr_finding_commit')),
        repo_name TEXT NOT NULL DEFAULT '',
        source_a_kind TEXT NOT NULL CHECK (source_a_kind IN ('pr_review', 'pr_finding')),
        source_a_id TEXT NOT NULL,
        source_b_kind TEXT NOT NULL CHECK (source_b_kind IN ('session', 'release', 'commit')),
        source_b_id TEXT NOT NULL,
        confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
        computed_at TEXT NOT NULL,
        PRIMARY KEY (correlation_type, source_a_id, source_b_id)
      ) STRICT
    `);
    inner.run('CREATE INDEX idx_cross_source_correlations_repo ON cross_source_correlations(repo_name)');
    inner.run(
      "INSERT INTO cross_source_correlations (correlation_type, repo_name, source_a_kind, source_a_id, source_b_kind, source_b_id, confidence, computed_at) VALUES ('pr_review_release', 'legacy-cs', 'pr_review', 'r1', 'release', 'v1.2.3', 'high', '2026-05-23T00:00:00.000Z')",
    );

    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    const info = inner.exec('PRAGMA table_info(cross_source_correlations)');
    const rows = (info[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
    const colNames = rows.map((c) => String(c[1]));
    expect(colNames).toContain('repo_id');
    expect(colNames).not.toContain('repo_name'); // Phase H-1: 物理撤去済
    // PK は (correlation_type, source_a_id, source_b_id) のまま不変 (additive)。
    const pkCols = rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1])).sort();
    expect(pkCols).toEqual(['correlation_type', 'source_a_id', 'source_b_id']);

    // repo_id が backfill されている (release tag 行でもリポを区別できる)。
    const repoIdViaName = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('legacy-cs');
    const data = inner.exec("SELECT repo_id, source_b_id FROM cross_source_correlations WHERE source_a_id = 'r1'");
    expect(Number(data[0]?.values?.[0]?.[0])).toBe(repoIdViaName);
    expect(String(data[0]?.values?.[0]?.[1])).toBe('v1.2.3');
    // read メソッドは依然 repoName を返す (LEFT JOIN repos で復元・契約不変)。
    const corr = db.getCrossSourceCorrelations().find((c) => c.sourceAId === 'r1');
    expect(corr?.repoName).toBe('legacy-cs');

    // 旧索引が撤去され、新 repo_id 索引が張られている。
    const idx = inner.exec("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='cross_source_correlations'");
    const idxNames = (idx[0]?.values ?? []).map((r: ReadonlyArray<unknown>) => String(r[0]));
    expect(idxNames).not.toContain('idx_cross_source_correlations_repo');
    expect(idxNames).toContain('idx_cross_source_correlations_repo_id');

    // flip 後の高レベル API が repo_id を埋める (consumer 追従の検証)。
    db.replaceCrossSourceCorrelations([
      { correlationType: 'pr_review_session', repoName: 'legacy-cs', sourceAKind: 'pr_review', sourceAId: 'r2', sourceBKind: 'session', sourceBId: 's1', confidence: 'low', computedAt: '2026-05-23T00:00:00.000Z' },
    ]);
    const newRow = inner.exec("SELECT repo_id FROM cross_source_correlations WHERE source_a_id = 'r2'");
    expect(Number(newRow[0]?.values?.[0]?.[0])).toBe(repoIdViaName);

    db.close();
  });

  it('Phase F flip: 新規 DB の derived テーブルは repo_id 列を持ち PK が repo_id 化されている', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;
    const pkOf = (table: string): string[] => {
      const dbinfo = inner.exec(`PRAGMA table_info(${table})`);
      const rows = (dbinfo[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
      return rows.filter((c) => Number(c[5]) > 0).map((c) => String(c[1])).sort();
    };
    const colsOf = (table: string): string[] => {
      const dbinfo = inner.exec(`PRAGMA table_info(${table})`);
      const rows = (dbinfo[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
      return rows.map((c) => String(c[1]));
    };
    // dora_metrics: PK が (repo_id, period)。Phase H-1: repo_name 列は無い。
    expect(colsOf('dora_metrics')).toContain('repo_id');
    expect(colsOf('dora_metrics')).not.toContain('repo_name');
    expect(pkOf('dora_metrics')).toEqual(['period', 'repo_id']);
    // pr_reviews / cross_source_correlations: repo_id 列を持つ (PK は不変)。Phase H-1: repo_name 列は無い。
    expect(colsOf('pr_reviews')).toContain('repo_id');
    expect(colsOf('pr_reviews')).not.toContain('repo_name');
    expect(pkOf('pr_reviews')).toEqual(['review_id']);
    expect(colsOf('cross_source_correlations')).toContain('repo_id');
    expect(colsOf('cross_source_correlations')).not.toContain('repo_name');
    expect(pkOf('cross_source_correlations')).toEqual(['correlation_type', 'source_a_id', 'source_b_id']);
    db.close();
  });

  it('Phase H-1: repo_name 列ありの legacy DB から 3 テーブルの repo_name を物理撤去し repo_id データを保全する', async () => {
    const db = await createTestTrailDatabase();
    const inner = (db as unknown as { db: Database }).db;
    const colsOf = (table: string): string[] => {
      const dbinfo = inner.exec(`PRAGMA table_info(${table})`);
      const rows = (dbinfo[0]?.values ?? []) as ReadonlyArray<ReadonlyArray<unknown>>;
      return rows.map((c) => String(c[1]));
    };

    // 旧 (Phase F) スキーマ = repo_id 列 + repo_name 残置列を再現する (撤去直前の状態)。
    inner.run('DROP TABLE IF EXISTS dora_metrics');
    inner.run('DROP TABLE IF EXISTS pr_reviews');
    inner.run('DROP TABLE IF EXISTS cross_source_correlations');
    inner.run(`
      CREATE TABLE dora_metrics (
        repo_id INTEGER NOT NULL DEFAULT 0 REFERENCES repos(repo_id) ON DELETE CASCADE,
        repo_name TEXT NOT NULL,
        period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
        deployment_frequency REAL NOT NULL DEFAULT 0,
        lead_time_hours REAL,
        computed_at TEXT NOT NULL,
        PRIMARY KEY (repo_id, period)
      ) STRICT
    `);
    inner.run(`
      CREATE TABLE pr_reviews (
        review_id TEXT PRIMARY KEY,
        repo_id INTEGER NOT NULL DEFAULT 0 REFERENCES repos(repo_id) ON DELETE CASCADE,
        repo_name TEXT NOT NULL,
        pr_number INTEGER NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL CHECK (state IN ('APPROVED', 'CHANGES_REQUESTED', 'COMMENTED')),
        submitted_at TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        body_hash TEXT NOT NULL DEFAULT ''
      ) STRICT
    `);
    inner.run(`
      CREATE TABLE cross_source_correlations (
        correlation_type TEXT NOT NULL
          CHECK (correlation_type IN ('pr_review_session', 'pr_review_release', 'pr_finding_commit')),
        repo_id INTEGER REFERENCES repos(repo_id) ON DELETE SET NULL,
        repo_name TEXT NOT NULL DEFAULT '',
        source_a_kind TEXT NOT NULL CHECK (source_a_kind IN ('pr_review', 'pr_finding')),
        source_a_id TEXT NOT NULL,
        source_b_kind TEXT NOT NULL CHECK (source_b_kind IN ('session', 'release', 'commit')),
        source_b_id TEXT NOT NULL,
        confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
        computed_at TEXT NOT NULL,
        PRIMARY KEY (correlation_type, source_a_id, source_b_id)
      ) STRICT
    `);

    // repo_id を repos 経由で確定させてからデータ投入する (repo_id と repo_name を整合)。
    const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName('h1-repo');
    inner.run(
      `INSERT INTO dora_metrics (repo_id, repo_name, period, deployment_frequency, lead_time_hours, computed_at)
       VALUES (?, 'h1-repo', '2026-04', 5, 12, '2026-05-23T00:00:00.000Z')`,
      [repoId],
    );
    inner.run(
      `INSERT INTO pr_reviews (review_id, repo_id, repo_name, pr_number, author, state, submitted_at, body, body_hash)
       VALUES ('h1-rev', ?, 'h1-repo', 7, 'dave', 'APPROVED', '2026-05-23T00:00:00.000Z', 'ok', 'hh')`,
      [repoId],
    );
    inner.run(
      `INSERT INTO cross_source_correlations (correlation_type, repo_id, repo_name, source_a_kind, source_a_id, source_b_kind, source_b_id, confidence, computed_at)
       VALUES ('pr_review_session', ?, 'h1-repo', 'pr_review', 'h1-a', 'session', 'h1-b', 'medium', '2026-05-23T00:00:00.000Z')`,
      [repoId],
    );

    // createTables を再実行 → H-1 drop migration が repo_name を撤去する。例外なく完了すること。
    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();

    // 3 テーブルから repo_name が消え、repo_id は残っている。
    for (const t of ['dora_metrics', 'pr_reviews', 'cross_source_correlations']) {
      expect(colsOf(t)).not.toContain('repo_name');
      expect(colsOf(t)).toContain('repo_id');
    }

    // repo_id データが保全されている。
    expect(Number(inner.exec("SELECT repo_id FROM dora_metrics WHERE period = '2026-04'")[0]?.values?.[0]?.[0])).toBe(repoId);
    expect(Number(inner.exec("SELECT repo_id FROM pr_reviews WHERE review_id = 'h1-rev'")[0]?.values?.[0]?.[0])).toBe(repoId);
    expect(Number(inner.exec("SELECT repo_id FROM cross_source_correlations WHERE source_a_id = 'h1-a'")[0]?.values?.[0]?.[0])).toBe(repoId);

    // read メソッドは依然 repoName を返す (JOIN repos で復元・下流契約不変)。
    expect(db.getPrReviewDetail('h1-rev')?.repoName).toBe('h1-repo');
    expect(db.getPrReviews().find((r) => r.reviewId === 'h1-rev')?.repoName).toBe('h1-repo');
    expect(db.getCrossSourceCorrelations().find((c) => c.sourceAId === 'h1-a')?.repoName).toBe('h1-repo');

    // 冪等: 再度 createTables を走らせても repo_name は無いまま例外なく完了する。
    expect(() => {
      (db as unknown as { createTables(): void }).createTables();
    }).not.toThrow();
    for (const t of ['dora_metrics', 'pr_reviews', 'cross_source_correlations']) {
      expect(colsOf(t)).not.toContain('repo_name');
    }

    db.close();
  });
});
