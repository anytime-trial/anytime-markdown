import {
  CREATE_SESSION_COMMITS,
  CREATE_COMMIT_FILES,
  CREATE_SESSION_COMMIT_RESOLUTIONS,
  CREATE_INDEXES,
} from '../domain/schema';

describe('schema repoName columns', () => {
  it('CREATE_SESSION_COMMITS DDL includes repo_name column', () => {
    expect(CREATE_SESSION_COMMITS).toMatch(/repo_name\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+''/);
  });

  it('CREATE_COMMIT_FILES DDL includes repo_name column', () => {
    expect(CREATE_COMMIT_FILES).toMatch(/repo_name\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+''/);
  });

  // Phase D flip: PK を (session_id, repo_name) → (session_id, repo_id) へ再設計した。
  // repo_name は移行互換で残置し、PK は repo_id を含む。
  it('CREATE_SESSION_COMMIT_RESOLUTIONS DDL is exported with repo_id composite PK', () => {
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).toMatch(/CREATE TABLE IF NOT EXISTS session_commit_resolutions/);
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).toMatch(/session_id\s+TEXT\s+NOT\s+NULL/);
    expect(CREATE_SESSION_COMMIT_RESOLUTIONS).toMatch(/repo_name\s+TEXT\s+NOT\s+NULL/);
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
