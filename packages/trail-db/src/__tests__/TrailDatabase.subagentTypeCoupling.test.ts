
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const insertSession = (db: TrailDatabase, sessionId: string, startTime: string): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'r', '0', '', '', ?, '', 0, '', 0, '')`,
    [sessionId, sessionId, startTime],
  );
};

const insertMessage = (
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  subagentType: string | null,
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO messages (
       uuid, session_id, parent_uuid, type, timestamp, subagent_type
     ) VALUES (?, ?, NULL, 'assistant', '2026-04-29T00:00:00.000Z', ?)`,
    [uuid, sessionId, subagentType],
  );
};

const insertToolCall = (
  db: TrailDatabase,
  sessionId: string,
  uuid: string,
  callIndex: number,
  toolName: string,
  filePath: string | null,
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO message_tool_calls (
       session_id, message_uuid, turn_index, call_index, tool_name, file_path,
       command, skill_name, model, is_sidechain, turn_exec_ms, has_thinking, is_error, error_type, timestamp
     ) VALUES (?, ?, 0, ?, ?, ?, NULL, NULL, NULL, 0, NULL, 0, 0, NULL, ?)`,
    [sessionId, uuid, callIndex, toolName, filePath, '2026-04-29T00:00:00.000Z'],
  );
};

describe('TrailDatabase.fetchTemporalCoupling (granularity=subagentType)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('returns subagentType-grain pairs from message_tool_calls', () => {
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1', 'Explore');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/auth.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/login.ts');

    insertSession(db, 's2', isoDaysAgo(2));
    insertMessage(db, 'm2', 's2', 'code-reviewer');
    insertToolCall(db, 's2', 'm2', 0, 'Write', 'src/auth.ts');
    insertToolCall(db, 's2', 'm2', 1, 'Edit', 'src/login.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'subagentType',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'src/auth.ts',
      target: 'src/login.ts',
      coChangeCount: 2,
      jaccard: 1.0,
    });
  });

  it('skips rows whose message has NULL subagent_type', () => {
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm-null', 's1', null);
    insertToolCall(db, 's1', 'm-null', 0, 'Edit', 'src/x.ts');
    insertToolCall(db, 's1', 'm-null', 1, 'Edit', 'src/y.ts');

    insertMessage(db, 'm-explore', 's1', 'Explore');
    insertToolCall(db, 's1', 'm-explore', 2, 'Edit', 'src/a.ts');
    insertToolCall(db, 's1', 'm-explore', 3, 'Edit', 'src/b.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'subagentType',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'src/a.ts', target: 'src/b.ts' });
  });

  it('aggregates files across multiple sessions sharing the same subagent_type', () => {
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1', 'Explore');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/a.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/b.ts');

    insertSession(db, 's2', isoDaysAgo(2));
    insertMessage(db, 'm2', 's2', 'Explore');
    insertToolCall(db, 's2', 'm2', 0, 'Edit', 'src/a.ts');
    insertToolCall(db, 's2', 'm2', 1, 'Edit', 'src/b.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'subagentType',
    });

    expect(edges).toHaveLength(1);
    // Both sessions belong to the same subagent_type → 1 group → coChangeCount=1
    expect(edges[0].coChangeCount).toBe(1);
  });

  it('respects window via sessions.start_time', () => {
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1', 'Explore');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/a.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/b.ts');

    insertSession(db, 's2', isoDaysAgo(120));
    insertMessage(db, 'm2', 's2', 'Plan');
    insertToolCall(db, 's2', 'm2', 0, 'Edit', 'src/c.ts');
    insertToolCall(db, 's2', 'm2', 1, 'Edit', 'src/d.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'subagentType',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'src/a.ts', target: 'src/b.ts' });
  });

  it('uses default minChangeCount=1 / jaccardThreshold=0.5 when omitted (single-type pair survives)', () => {
    // subagentType 粒度では「1 つの型に閉じた共編集ペア」も意味を持たせるため minChangeCount=1。
    // 1 つの型のみで a/b → coChange=1, count=1+1, Jaccard=1.0 → 0.5 閾値も通過
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1', 'Explore');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/a.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/b.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      topK: 50,
      granularity: 'subagentType',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'src/a.ts', target: 'src/b.ts', jaccard: 1.0 });
  });

  it('includes codex-linked sessions as subagentType="codex" in coupling', () => {
    // CC parent session with a delegation marker pointing to a codex session
    const ccStart = isoDaysAgo(1);
    insertSession(db, 'cc1', ccStart);
    insertMessage(db, 'p-uuid', 'cc1', null);

    const inner = (db as unknown as { db: SqlJsDb }).db;
    // delegation marker (child message in CC session pointing back to parent assistant)
    inner.run(
      `INSERT INTO messages (uuid, session_id, parent_uuid, type, timestamp, source_tool_assistant_uuid)
       VALUES ('cc1-child', 'cc1', NULL, 'assistant', ?, 'p-uuid')`,
      [ccStart],
    );
    // codex session in same repo, time-overlapping the delegation
    const codexStart = new Date(Date.parse(ccStart) + 60_000).toISOString();
    const codexEnd = new Date(Date.parse(ccStart) + 5 * 60_000).toISOString();
    inner.run(
      `INSERT INTO sessions (
         id, slug, repo_name, version, entrypoint, model, start_time, end_time,
         message_count, file_path, file_size, imported_at, source
       ) VALUES ('codex1', 'codex1', 'r', '0', '', '', ?, ?, 0, '', 0, '', 'codex')`,
      [codexStart, codexEnd],
    );
    // codex session message edits 2 files (both within same group → co-change pair within 'codex')
    inner.run(
      `INSERT INTO messages (uuid, session_id, parent_uuid, type, timestamp)
       VALUES ('cm1', 'codex1', NULL, 'assistant', ?)`,
      [codexStart],
    );
    insertToolCall(db, 'codex1', 'cm1', 0, 'Edit', 'src/a.ts');
    insertToolCall(db, 'codex1', 'cm1', 1, 'Edit', 'src/b.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'subagentType',
    });

    // 'codex' group が a, b を共編集 → (a, b) ペアが produced
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'src/a.ts', target: 'src/b.ts', jaccard: 1.0 });
  });
});
