import fs from 'node:fs';
import path from 'node:path';

const schemaPath = path.resolve(__dirname, '../../../../supabase/migrations/001_schema.sql');

describe('Supabase schema repo_id/release_id parity', () => {
  const schema = fs.readFileSync(schemaPath, 'utf8');

  it('defines trail_repos and seeds the repo_id=0 sentinel', () => {
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS trail_repos \(/);
    expect(schema).toMatch(/INSERT INTO trail_repos \(repo_id, repo_name, created_at\)[\s\S]*VALUES \(0, ''/);
  });

  it('uses repo_id-aware primary keys on commit tables', () => {
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS trail_session_commits \([\s\S]*repo_id INTEGER NOT NULL DEFAULT 0 REFERENCES trail_repos\(repo_id\)[\s\S]*PRIMARY KEY \(session_id, repo_id, commit_hash\)/);
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS trail_commit_files \([\s\S]*repo_id INTEGER NOT NULL DEFAULT 0 REFERENCES trail_repos\(repo_id\)[\s\S]*PRIMARY KEY \(repo_id, commit_hash, file_path\)/);
  });

  it('indexes commit queries by committed_at and repo_id/hash', () => {
    expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_trail_session_commits_committed_at ON trail_session_commits(committed_at)');
    expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_trail_session_commits_repo_committed_at ON trail_session_commits(repo_id, committed_at)');
    expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_trail_session_commits_repo_hash ON trail_session_commits(repo_id, commit_hash)');
    expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_trail_commit_files_repo_hash ON trail_commit_files(repo_id, commit_hash)');
  });

  it('keys the release subtree by release_id and drops release_tag', () => {
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS trail_releases \([\s\S]*release_id INTEGER PRIMARY KEY[\s\S]*UNIQUE \(repo_id, tag\)/);
    expect(schema).not.toMatch(/\brelease_tag\b/);
  });

  it('removes the denormalized repo_name column outside trail_repos', () => {
    // trail_repos の定義ブロックを除いた本文に repo_name 列が残っていないこと
    const withoutRepos = schema.replace(/CREATE TABLE IF NOT EXISTS trail_repos \([\s\S]*?\);/, '');
    const withoutInsert = withoutRepos.replace(/INSERT INTO trail_repos[\s\S]*?;/, '');
    expect(withoutInsert).not.toMatch(/\brepo_name\b/);
  });
});
