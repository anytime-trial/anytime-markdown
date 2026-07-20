/**
 * getCombinedData のワークスペース切替（workspace フィルタ・workspaces 一覧・
 * 絞り込み済み dailyActivity 同梱・repoStats 廃止）の回帰テスト。
 * spec: trail-viewer-screen-analytics.ja.md §5.2.1
 */
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = { run: (sql: string, params?: ReadonlyArray<unknown>) => void };

function inner(db: TrailDatabase): SqlJsDb {
  return (db as unknown as { db: SqlJsDb }).db;
}
function repoIdForName(db: TrailDatabase, name: string): number {
  return (db as unknown as { repoIdForName(n: string): number }).repoIdForName(name);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function insertSession(db: TrailDatabase, id: string, repoName: string, startTime: string): void {
  const repoId = repoIdForName(db, repoName);
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_id, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at, source
     ) VALUES (?, ?, ?, '', '', 'claude-opus-4', ?, ?, 0, '', 0, ?, 'claude_code')`,
    [id, id, repoId, startTime, startTime, startTime],
  );
}

function insertCommit(
  db: TrailDatabase,
  sessionId: string,
  repoName: string,
  commitHash: string,
  committedAt: string,
): void {
  const repoId = repoIdForName(db, repoName);
  inner(db).run(
    `INSERT OR IGNORE INTO session_commits (
       session_id, commit_hash, commit_message, author, committed_at, repo_id
     ) VALUES (?, ?, '', '', ?, ?)`,
    [sessionId, commitHash, committedAt, repoId],
  );
}

function insertAssistantMessage(
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  timestamp: string,
  inputTokens: number,
  outputTokens: number,
): void {
  inner(db).run(
    `INSERT OR IGNORE INTO messages (
       uuid, session_id, type, timestamp, input_tokens, output_tokens, model
     ) VALUES (?, ?, 'assistant', ?, ?, ?, 'claude-opus-4')`,
    [uuid, sessionId, timestamp, inputTokens, outputTokens],
  );
}

function insertSkillCall(
  db: TrailDatabase,
  sessionId: string,
  messageUuid: string,
  skillName: string,
  timestamp: string,
): void {
  inner(db).run(
    `INSERT OR IGNORE INTO message_tool_calls (
       session_id, message_uuid, turn_index, call_index, tool_name, file_path,
       command, skill_name, model, is_sidechain, turn_exec_ms, has_thinking, is_error, error_type, timestamp
     ) VALUES (?, ?, 0, 0, 'Skill', NULL, NULL, ?, NULL, 0, NULL, 0, 0, NULL, ?)`,
    [sessionId, messageUuid, skillName, timestamp],
  );
}

describe('getCombinedData — workspace filter', () => {
  let db: TrailDatabase;
  const t = isoDaysAgo(1);

  beforeEach(async () => {
    db = await createTestTrailDatabase();
    // 親 repo / その worktree / 別 repo の 3 セッション
    insertSession(db, 's-main', 'anytime-markdown', t);
    insertSession(db, 's-wt', 'anytime-markdown--claude-worktrees-foo', t);
    insertSession(db, 's-other', 'other-repo', t);
    insertAssistantMessage(db, 'm-main', 's-main', t, 100, 50);
    insertAssistantMessage(db, 'm-wt', 's-wt', t, 10, 5);
    insertAssistantMessage(db, 'm-other', 's-other', t, 1000, 500);
  });

  it('lists normalized distinct workspaces regardless of filter selection', () => {
    const all = db.getCombinedData('day', 30);
    expect(all.workspaces).toEqual(['anytime-markdown', 'other-repo']);
    const filtered = db.getCombinedData('day', 30, 'other-repo');
    expect(filtered.workspaces).toEqual(['anytime-markdown', 'other-repo']);
  });

  it('omits dailyActivity when no workspace filter is given', () => {
    const all = db.getCombinedData('day', 30);
    expect(all.dailyActivity).toBeUndefined();
  });

  it('filters modelStats to the workspace, merging worktree repos into the parent', () => {
    const filtered = db.getCombinedData('day', 30, 'anytime-markdown');
    const totalCount = filtered.modelStats.reduce((s, m) => s + m.count, 0);
    const totalTokens = filtered.modelStats.reduce((s, m) => s + m.tokens, 0);
    expect(totalCount).toBe(2); // m-main + m-wt（worktree は親へ合算）
    expect(totalTokens).toBe(165); // (100+50) + (10+5)

    const all = db.getCombinedData('day', 30);
    expect(all.modelStats.reduce((s, m) => s + m.count, 0)).toBe(3);
  });

  it('includes workspace-filtered dailyActivity when a workspace is selected', () => {
    const filtered = db.getCombinedData('day', 30, 'anytime-markdown');
    expect(filtered.dailyActivity).toBeDefined();
    const totalInput = (filtered.dailyActivity ?? []).reduce((s, d) => s + d.inputTokens, 0);
    expect(totalInput).toBe(110); // 100 + 10（other-repo の 1000 を含まない）
  });

  it('returns empty aggregates for an unknown workspace while keeping the full list', () => {
    const filtered = db.getCombinedData('day', 30, 'no-such-workspace');
    expect(filtered.modelStats).toHaveLength(0);
    expect(filtered.workspaces).toEqual(['anytime-markdown', 'other-repo']);
    const totalInput = (filtered.dailyActivity ?? []).reduce((s, d) => s + d.inputTokens, 0);
    expect(totalInput).toBe(0);
  });

  it('filters skillStats via message_tool_calls when a workspace is selected', () => {
    insertSkillCall(db, 's-main', 'm-main', 'skill-a', t);
    insertSkillCall(db, 's-other', 'm-other', 'skill-b', t);
    const filtered = db.getCombinedData('day', 30, 'anytime-markdown');
    expect(filtered.skillStats.map((s) => s.skill)).toEqual(['skill-a']);
    expect(filtered.skillStats[0]!.count).toBe(1);
  });

  it('excludes repos whose only session is outside the selected range', () => {
    insertSession(db, 's-stale', 'stale-repo', isoDaysAgo(200));
    expect(db.getCombinedData('day', 30).workspaces).toEqual(['anytime-markdown', 'other-repo']);
  });

  it('excludes repos registered without any session or commit', () => {
    // コード解析・コミット取り込みの副産物として repos だけに行が残るケース。
    repoIdForName(db, 'analyzed-only-repo');
    expect(db.getCombinedData('day', 30).workspaces).not.toContain('analyzed-only-repo');
  });

  it('does not list a repo that only appears as a commit target', () => {
    // docs リポジトリや ~/.claude へのコミットは、作業していたワークスペースの活動であって
    // コミット先がワークスペースになるわけではない。
    insertCommit(db, 's-other', 'docs-repo', 'hash-1', t);
    expect(db.getCombinedData('day', 30).workspaces).toEqual(['anytime-markdown', 'other-repo']);
  });

  it('lists the committing session repo, not the commit target, when only the commit is in range', () => {
    // 期間より前に開始したセッションが、期間内に別リポジトリ（docs）へコミットしたケース。
    // 載るのは作業していた long-running-repo であって、コミット先の docs-repo ではない。
    insertSession(db, 's-long', 'long-running-repo', isoDaysAgo(200));
    insertCommit(db, 's-long', 'docs-repo', 'hash-2', t);
    expect(db.getCombinedData('day', 30).workspaces).toEqual([
      'anytime-markdown',
      'long-running-repo',
      'other-repo',
    ]);
  });

  it('excludes repos whose session and commits are all outside the selected range', () => {
    insertSession(db, 's-old', 'old-repo', isoDaysAgo(200));
    insertCommit(db, 's-old', 'old-repo', 'hash-3', isoDaysAgo(200));
    expect(db.getCombinedData('day', 30).workspaces).toEqual(['anytime-markdown', 'other-repo']);
  });

  it('keeps the selected workspace listed even when its activity is out of range', () => {
    insertSession(db, 's-stale', 'stale-repo', isoDaysAgo(200));
    const filtered = db.getCombinedData('day', 30, 'stale-repo');
    expect(filtered.workspaces).toContain('stale-repo');
  });

  it('does not invent a list entry for an unknown selected workspace', () => {
    expect(db.getCombinedData('day', 30, 'no-such-workspace').workspaces).toEqual([
      'anytime-markdown',
      'other-repo',
    ]);
  });

  it('filters toolCounts by the workspace session set', () => {
    insertSkillCall(db, 's-main', 'm-main', 'skill-a', t);
    insertSkillCall(db, 's-other', 'm-other', 'skill-b', t);
    const filtered = db.getCombinedData('day', 30, 'other-repo');
    const total = filtered.toolCounts.reduce((s, tc) => s + tc.count, 0);
    expect(total).toBe(1); // s-other の 1 call のみ
  });
});
