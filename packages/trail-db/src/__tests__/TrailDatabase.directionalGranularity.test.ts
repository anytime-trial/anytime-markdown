
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';
import type { ConfidenceCouplingEdge } from '@anytime-markdown/trail-core';
import { noopDbLogger } from '../DbLogger';

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

const insertSessionCommit = (
  db: TrailDatabase,
  sessionId: string,
  hash: string,
  committedAt: string,
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'r', '0', '', '', '', '', 0, '', 0, '')`,
    [sessionId, sessionId],
  );
  inner.run(
    `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, committed_at)
     VALUES (?, ?, ?)`,
    [sessionId, hash, committedAt],
  );
};

const insertCommitFile = (db: TrailDatabase, hash: string, filePath: string): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`,
    [hash, filePath],
  );
};

describe('TrailDatabase.fetchTemporalCoupling (directional × granularity)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('session × directional: produces direction info via computeSessionConfidenceCoupling', () => {
    // auth.ts: 5 セッションで触る、login.ts: s1 でのみ触る → co=1
    // C(auth→login)=1/5=0.2, C(login→auth)=1/1=1.0, diff=0.8 ≥ 0.3 → directed
    for (let i = 1; i <= 5; i++) {
      insertSession(db, `s${i}`, isoDaysAgo(i));
      insertMessage(db, `m${i}`, `s${i}`, null);
      insertToolCall(db, `s${i}`, `m${i}`, 0, 'Edit', 'src/auth.ts');
    }
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/login.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      topK: 50,
      granularity: 'session',
      directional: true,
      confidenceThreshold: 0.5,
      directionalDiffThreshold: 0.3,
    }) as ConfidenceCouplingEdge[];

    expect(edges).toHaveLength(1);
    expect(edges[0].direction).toBe('A→B');
    expect(edges[0].source).toBe('src/login.ts');
    expect(edges[0].target).toBe('src/auth.ts');
    expect(edges[0].confidenceForward).toBeCloseTo(1.0, 5);
    expect(edges[0].confidenceBackward).toBeCloseTo(0.2, 5);
  });

  it('subagentType × directional: produces direction info via computeSubagentTypeConfidenceCoupling', () => {
    // auth.ts: 5 役割が触る、login.ts: general-purpose でのみ触る → co=1
    // C(auth→login)=1/5=0.2, C(login→auth)=1/1=1.0, diff=0.8 ≥ 0.3 → directed
    const types = ['general-purpose', 'code-reviewer', 'Explore', 'Plan', 'Explore-2'];
    types.forEach((t, idx) => {
      const sid = `s${idx + 1}`;
      const mid = `m${idx + 1}`;
      insertSession(db, sid, isoDaysAgo(idx + 1));
      insertMessage(db, mid, sid, t);
      insertToolCall(db, sid, mid, 0, 'Edit', 'src/auth.ts');
    });
    // general-purpose のみ login.ts も触る
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/login.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      topK: 50,
      granularity: 'subagentType',
      directional: true,
      confidenceThreshold: 0.5,
      directionalDiffThreshold: 0.3,
    }) as ConfidenceCouplingEdge[];

    expect(edges).toHaveLength(1);
    expect(edges[0].direction).toBe('A→B');
    expect(edges[0].source).toBe('src/login.ts');
    expect(edges[0].target).toBe('src/auth.ts');
    expect(edges[0].confidenceForward).toBeCloseTo(1.0, 5);
    expect(edges[0].confidenceBackward).toBeCloseTo(0.2, 5);
  });

  it('commit × directional: existing Phase 2 behavior is preserved', () => {
    // 既存の confidence-coupling テストと同じデータ構成で commit 粒度 directional 動作を再確認
    for (let i = 1; i <= 5; i++) {
      insertSessionCommit(db, 's1', `h${i}`, isoDaysAgo(i));
      insertCommitFile(db, `h${i}`, 'src/auth.ts');
    }
    insertCommitFile(db, 'h1', 'src/login.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      topK: 50,
      // granularity 省略 = commit
      directional: true,
      confidenceThreshold: 0.5,
      directionalDiffThreshold: 0.3,
    }) as ConfidenceCouplingEdge[];

    expect(edges).toHaveLength(1);
    expect(edges[0].direction).toBe('A→B');
    expect(edges[0].source).toBe('src/login.ts');
    expect(edges[0].target).toBe('src/auth.ts');
  });

  it('granularity × Jaccard (directional=false): existing behavior is preserved across all granularities', () => {
    // session 粒度 / Jaccard
    insertSession(db, 'session-s1', isoDaysAgo(1));
    insertMessage(db, 'session-m1', 'session-s1', null);
    insertToolCall(db, 'session-s1', 'session-m1', 0, 'Edit', 'src/x.ts');
    insertToolCall(db, 'session-s1', 'session-m1', 1, 'Edit', 'src/y.ts');

    const sessionEdges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });
    expect(sessionEdges).toHaveLength(1);
    expect((sessionEdges[0] as { direction?: unknown }).direction).toBeUndefined();
    expect(sessionEdges[0]).toMatchObject({
      source: 'src/x.ts',
      target: 'src/y.ts',
      jaccard: 1.0,
    });

    // subagentType 粒度 / Jaccard（同データを使用）
    insertMessage(db, 'sub-m1', 'session-s1', 'Explore');
    insertToolCall(db, 'session-s1', 'sub-m1', 2, 'Edit', 'src/x.ts');
    insertToolCall(db, 'session-s1', 'sub-m1', 3, 'Edit', 'src/y.ts');

    const subagentEdges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'subagentType',
    });
    expect(subagentEdges).toHaveLength(1);
    expect((subagentEdges[0] as { direction?: unknown }).direction).toBeUndefined();
    expect(subagentEdges[0]).toMatchObject({
      source: 'src/x.ts',
      target: 'src/y.ts',
      jaccard: 1.0,
    });
  });

  it('subagentType × directional: warns when only 1 subagent_type touches files (all edges undirected)', async () => {
    // general-purpose のみが a/b を触る → groups=1
    // 任意のペアで co=count(A)=count(B)=1 → C=1.0/1.0 → diff=0 → 必ず undirected
    // 矢印が出ない原因が「単一グループ」であることを WARN ログで示す。
    const warnMsgs: string[] = [];
    const mockLogger = { ...noopDbLogger, warn: (m: string) => { warnMsgs.push(m); } };
    const warnDb = await createTestTrailDatabase(mockLogger);
    try {
      insertSession(warnDb, 's1', isoDaysAgo(1));
      insertMessage(warnDb, 'm1', 's1', 'general-purpose');
      insertToolCall(warnDb, 's1', 'm1', 0, 'Edit', 'src/a.ts');
      insertToolCall(warnDb, 's1', 'm1', 1, 'Edit', 'src/b.ts');

      const edges = warnDb.fetchTemporalCoupling({
        repoName: 'r',
        windowDays: 30,
        minChangeCount: 1,
        topK: 50,
        granularity: 'subagentType',
        directional: true,
        confidenceThreshold: 0,
        directionalDiffThreshold: 0.2,
      }) as ConfidenceCouplingEdge[];

      // エッジは出るが必ず undirected
      expect(edges).toHaveLength(1);
      expect(edges[0].direction).toBe('undirected');

      // WARN が「1 種類しか存在しない」ヒントを含む
      expect(warnMsgs.some(
        (m) => m.includes('subagent_type が 1 種類') && m.includes('undirected'),
      )).toBe(true);
    } finally {
      warnDb.close();
    }
  });

  it('subagentType × directional: does NOT warn when ≥ 2 subagent_types are present', async () => {
    // 2 種類ある場合は警告しない
    const warnMsgs: string[] = [];
    const mockLogger = { ...noopDbLogger, warn: (m: string) => { warnMsgs.push(m); } };
    const warnDb = await createTestTrailDatabase(mockLogger);
    try {
      insertSession(warnDb, 's1', isoDaysAgo(1));
      insertMessage(warnDb, 'm1', 's1', 'general-purpose');
      insertToolCall(warnDb, 's1', 'm1', 0, 'Edit', 'src/a.ts');
      insertToolCall(warnDb, 's1', 'm1', 1, 'Edit', 'src/b.ts');

      insertMessage(warnDb, 'm2', 's1', 'code-reviewer');
      insertToolCall(warnDb, 's1', 'm2', 2, 'Edit', 'src/a.ts');

      warnDb.fetchTemporalCoupling({
        repoName: 'r',
        windowDays: 30,
        minChangeCount: 1,
        topK: 50,
        granularity: 'subagentType',
        directional: true,
        confidenceThreshold: 0,
        directionalDiffThreshold: 0.2,
      });

      expect(
        warnMsgs.some((m) => m.includes('subagent_type が 1 種類')),
      ).toBe(false);
    } finally {
      warnDb.close();
    }
  });
});
