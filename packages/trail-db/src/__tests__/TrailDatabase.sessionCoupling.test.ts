
import { TrailDatabase } from '../TrailDatabase';
import { createTestTrailDatabase } from './support/createTestDb';

type SqlJsDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const insertSession = (
  db: TrailDatabase,
  sessionId: string,
  startTime: string,
): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_name, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at
     ) VALUES (?, ?, 'r', '0', '', '', ?, '', 0, '', 0, '')`,
    [sessionId, sessionId, startTime],
  );
};

const insertMessage = (db: TrailDatabase, uuid: string, sessionId: string): void => {
  const inner = (db as unknown as { db: SqlJsDb }).db;
  inner.run(
    `INSERT OR IGNORE INTO messages (
       uuid, session_id, parent_uuid, type, timestamp
     ) VALUES (?, ?, NULL, 'user', ?)`,
    [uuid, sessionId, '2026-04-29T00:00:00.000Z'],
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

describe('TrailDatabase.fetchTemporalCoupling (granularity=session)', () => {
  let db: TrailDatabase;

  beforeEach(async () => {
    db = await createTestTrailDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it('returns session-grain pairs from message_tool_calls', () => {
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/auth.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/login.ts');

    insertSession(db, 's2', isoDaysAgo(2));
    insertMessage(db, 'm2', 's2');
    insertToolCall(db, 's2', 'm2', 0, 'Write', 'src/auth.ts');
    insertToolCall(db, 's2', 'm2', 1, 'Edit', 'src/login.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'src/auth.ts',
      target: 'src/login.ts',
      coChangeCount: 2,
      jaccard: 1.0,
    });
  });

  it('excludes non-edit tool calls (Read, Glob, Grep, Bash)', () => {
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Read', 'src/auth.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Glob', 'src/*.ts');
    insertToolCall(db, 's1', 'm1', 2, 'Grep', 'src/login.ts');
    insertToolCall(db, 's1', 'm1', 3, 'Bash', null);
    insertToolCall(db, 's1', 'm1', 4, 'Edit', 'src/auth.ts');
    insertToolCall(db, 's1', 'm1', 5, 'Edit', 'src/login.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0].coChangeCount).toBe(1);
  });

  it('excludes rows whose file_path is null', () => {
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', null);
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/a.ts');
    insertToolCall(db, 's1', 'm1', 2, 'Edit', 'src/b.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'src/a.ts', target: 'src/b.ts' });
  });

  it('respects window via sessions.start_time', () => {
    // s1 in window, s2 outside (old)
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/a.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/b.ts');

    insertSession(db, 's2', isoDaysAgo(120));
    insertMessage(db, 'm2', 's2');
    insertToolCall(db, 's2', 'm2', 0, 'Edit', 'src/c.ts');
    insertToolCall(db, 's2', 'm2', 1, 'Edit', 'src/d.ts');

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'src/a.ts', target: 'src/b.ts' });
  });

  it('excludes static dependency pairs from current_graphs in session granularity', () => {
    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', 'src/a.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', 'src/b.ts');
    insertSession(db, 's2', isoDaysAgo(2));
    insertMessage(db, 'm2', 's2');
    insertToolCall(db, 's2', 'm2', 0, 'Edit', 'src/a.ts');
    insertToolCall(db, 's2', 'm2', 1, 'Edit', 'src/b.ts');

    db.saveCurrentGraph(
      {
        nodes: [
          { id: 'n1', label: 'a', type: 'file', filePath: 'src/a.ts', line: 0 },
          { id: 'n2', label: 'b', type: 'file', filePath: 'src/b.ts', line: 0 },
        ],
        edges: [{ source: 'n1', target: 'n2', type: 'import' }],
        metadata: { projectRoot: '/x', analyzedAt: '2026-04-29T00:00:00.000Z', fileCount: 2 },
      },
      '/x/tsconfig.json',
      'commitX',
      'r',
    );

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });

    expect(edges).toHaveLength(0);
  });

  it('preserves Phase 1 behavior when granularity is omitted (default commit)', () => {
    const inner = (db as unknown as { db: SqlJsDb }).db;
    insertSession(db, 's1', isoDaysAgo(1));
    inner.run(
      `INSERT OR IGNORE INTO session_commits (session_id, commit_hash, committed_at)
       VALUES (?, ?, ?)`,
      ['s1', 'h1', isoDaysAgo(1)],
    );
    inner.run(`INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`, [
      'h1',
      'src/a.ts',
    ]);
    inner.run(`INSERT OR IGNORE INTO commit_files (commit_hash, file_path) VALUES (?, ?)`, [
      'h1',
      'src/b.ts',
    ]);

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'src/a.ts',
      target: 'src/b.ts',
      jaccard: 1.0,
    });
  });

  it('normalizes absolute file_path to repo-relative using current_graphs.metadata.projectRoot', () => {
    // Claude Code の Edit/Write ツールは file_path を「絶対パス」で記録する。
    // CodeGraph のノード ID はリポ相対パス前提のため、TrailDatabase 側で正規化する必要がある。
    const projectRoot = '/repo-root';

    // 静的依存除外でリポ相対パスを参照させるため、saveCurrentGraph で projectRoot を登録
    db.saveCurrentGraph(
      {
        nodes: [
          { id: 'n1', label: 'a', type: 'file', filePath: 'src/a.ts', line: 0 },
        ],
        edges: [],
        metadata: {
          projectRoot,
          analyzedAt: '2026-04-29T00:00:00.000Z',
          fileCount: 1,
        },
      },
      `${projectRoot}/tsconfig.json`,
      'commitX',
      'r',
    );

    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', `${projectRoot}/src/a.ts`);
    insertToolCall(db, 's1', 'm1', 1, 'Edit', `${projectRoot}/src/b.ts`);

    insertSession(db, 's2', isoDaysAgo(2));
    insertMessage(db, 'm2', 's2');
    insertToolCall(db, 's2', 'm2', 0, 'Write', `${projectRoot}/src/a.ts`);
    insertToolCall(db, 's2', 'm2', 1, 'Edit', `${projectRoot}/src/b.ts`);

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });

    expect(edges).toHaveLength(1);
    // ノード ID と整合する形（リポ相対）であることを確認
    expect(edges[0]).toMatchObject({
      source: 'src/a.ts',
      target: 'src/b.ts',
      coChangeCount: 2,
      jaccard: 1.0,
    });
  });

  it('normalizes absolute paths even when repoName mismatches current_graphs.repo_name', () => {
    // 実運用では CodeGraph 側 repoId と current_graphs.repo_name が揺れることがある。
    // listCurrentGraphs() から projectRoot を集めて prefix match する経路をカバー。
    const projectRoot = '/anytime-markdown';
    db.saveCurrentGraph(
      {
        nodes: [
          { id: 'n1', label: 'a', type: 'file', filePath: 'packages/x/src/a.ts', line: 0 },
        ],
        edges: [],
        metadata: {
          projectRoot,
          analyzedAt: '2026-04-29T00:00:00.000Z',
          fileCount: 1,
        },
      },
      `${projectRoot}/tsconfig.json`,
      'commitX',
      'anytime-markdown', // ← この repo_name で保存
    );

    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', `${projectRoot}/packages/x/src/a.ts`);
    insertToolCall(db, 's1', 'm1', 1, 'Edit', `${projectRoot}/packages/y/src/b.ts`);

    insertSession(db, 's2', isoDaysAgo(2));
    insertMessage(db, 'm2', 's2');
    insertToolCall(db, 's2', 'm2', 0, 'Write', `${projectRoot}/packages/x/src/a.ts`);
    insertToolCall(db, 's2', 'm2', 1, 'Edit', `${projectRoot}/packages/y/src/b.ts`);

    // 別の repoName を渡しても正規化が機能する
    const edges = db.fetchTemporalCoupling({
      repoName: 'Workspace',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: 'packages/x/src/a.ts',
      target: 'packages/y/src/b.ts',
    });
  });

  it('drops file_path that lives outside the repo root', () => {
    const projectRoot = '/repo-root';
    db.saveCurrentGraph(
      {
        nodes: [
          { id: 'n1', label: 'a', type: 'file', filePath: 'src/a.ts', line: 0 },
        ],
        edges: [],
        metadata: {
          projectRoot,
          analyzedAt: '2026-04-29T00:00:00.000Z',
          fileCount: 1,
        },
      },
      `${projectRoot}/tsconfig.json`,
      'commitX',
      'r',
    );

    insertSession(db, 's1', isoDaysAgo(1));
    insertMessage(db, 'm1', 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Edit', '/somewhere-else/x.ts');
    insertToolCall(db, 's1', 'm1', 1, 'Edit', `${projectRoot}/src/a.ts`);
    insertToolCall(db, 's1', 'm1', 2, 'Edit', `${projectRoot}/src/b.ts`);

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      minChangeCount: 1,
      jaccardThreshold: 0,
      topK: 50,
      granularity: 'session',
    });

    // a/b のペアのみ。リポ外の x.ts は除外
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 'src/a.ts', target: 'src/b.ts' });
  });

  it('applies session-grain default thresholds (minChangeCount=3, jaccardThreshold=0.4, maxFilesPerGroup=20)', () => {
    // 同じ a/b ペアを 2 セッションでのみ → minChangeCount=3 のデフォルトでスキップされる
    for (let i = 1; i <= 2; i++) {
      insertSession(db, `s${i}`, isoDaysAgo(i));
      insertMessage(db, `m${i}`, `s${i}`);
      insertToolCall(db, `s${i}`, `m${i}`, 0, 'Edit', 'src/a.ts');
      insertToolCall(db, `s${i}`, `m${i}`, 1, 'Edit', 'src/b.ts');
    }

    const edges = db.fetchTemporalCoupling({
      repoName: 'r',
      windowDays: 30,
      // 明示指定なし → セッション粒度のデフォルト適用
      topK: 50,
      granularity: 'session',
    });

    expect(edges).toHaveLength(0);
  });
});
