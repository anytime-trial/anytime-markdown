import {
  CREATE_SESSION_COMMITS,
  CREATE_COMMIT_FILES,
  CREATE_SESSION_COMMIT_RESOLUTIONS,
  CREATE_INDEXES,
} from '../domain/schema';

describe('schema repoName columns', () => {
  // Phase H-4: session_commits / commit_files / session_commit_resolutions から repo_name 列を撤去した。
  // repo 帰属は repo_id のみで表現し、repo_name が必要な read は repos を (LEFT) JOIN して復元する。
  it('CREATE_SESSION_COMMITS DDL no longer has repo_name column (Phase H-4)', () => {
    expect(CREATE_SESSION_COMMITS).not.toMatch(/\brepo_name\b/);
  });

  it('CREATE_COMMIT_FILES DDL no longer has repo_name column (Phase H-4)', () => {
    expect(CREATE_COMMIT_FILES).not.toMatch(/\brepo_name\b/);
  });

  // Phase D flip: PK を (session_id, repo_name) → (session_id, repo_id) へ再設計した。
  // Phase H-4: repo_name 列を撤去し、PK は repo_id のみで構成する。
  it('CREATE_SESSION_COMMIT_RESOLUTIONS DDL is exported with repo_id composite PK (no repo_name)', () => {
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).toMatch(/CREATE TABLE IF NOT EXISTS session_commit_resolutions/);
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).toMatch(/session_id\s+TEXT\s+NOT\s+NULL/);
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).not.toMatch(/\brepo_name\b/);
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).toMatch(/repo_id\s+INTEGER\s+NOT\s+NULL/);
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).toMatch(/resolved_at\s+TEXT\s+NOT\s+NULL/);
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).toMatch(/PRIMARY KEY\s*\(\s*session_id\s*,\s*repo_id\s*\)/);
  });

  // Phase D flip: session_commits / commit_files の PK が repo_id を含むよう再設計された。
  it('CREATE_SESSION_COMMITS DDL has repo_id column and (session_id, repo_id, commit_hash) PK', () => {
    expect(CREATE_SESSION_COMMITS).toMatch(/repo_id\s+INTEGER\s+NOT\s+NULL/);
    expect(CREATE_SESSION_COMMITS).toMatch(/PRIMARY KEY\s*\(\s*session_id\s*,\s*repo_id\s*,\s*commit_hash\s*\)/);
  });

  it('CREATE_COMMIT_FILES DDL has repo_id column and (repo_id, commit_hash, file_path) PK', () => {
    expect(CREATE_COMMIT_FILES).toMatch(/repo_id\s+INTEGER\s+NOT\s+NULL/);
    expect(CREATE_COMMIT_FILES).toMatch(/PRIMARY KEY\s*\(\s*repo_id\s*,\s*commit_hash\s*,\s*file_path\s*\)/);
  });

  // Phase D flip: repo フィルタ系インデックスの先頭列を repo_id へ移行した。
  it('CREATE_INDEXES contains repo_id based indexes for commit tables', () => {
    const joined = CREATE_INDEXES.join('\n');
    expect(joined).toMatch(/CREATE INDEX IF NOT EXISTS idx_session_commits_repo_id_committed_at ON session_commits\(repo_id, committed_at\)/);
    expect(joined).toMatch(/CREATE INDEX IF NOT EXISTS idx_session_commits_repo_id_hash ON session_commits\(repo_id, commit_hash\)/);
    expect(joined).toMatch(/CREATE INDEX IF NOT EXISTS idx_commit_files_repo_id_file_path ON commit_files\(repo_id, file_path\)/);
    expect(joined).toMatch(/CREATE INDEX IF NOT EXISTS idx_commit_files_repo_id_hash ON commit_files\(repo_id, commit_hash\)/);
  });
});
