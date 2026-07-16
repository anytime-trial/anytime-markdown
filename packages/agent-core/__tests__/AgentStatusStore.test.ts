import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatusStore } from '../src/status/AgentStatusStore';

// 一時ディレクトリの DB に対してのみ実行する（本番 .anytime/agent/ へフォールバックしない）。
describe('AgentStatusStore', () => {
  let dir: string;
  let store: AgentStatusStore;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-status-store-'));
    dbPath = join(dir, 'sub', 'agent-status.db');
    store = new AgentStatusStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('親ディレクトリが無くても DB ファイルを作成する', () => {
    expect(existsSync(dbPath)).toBe(true);
  });

  it('未登録セッションは null を返す', () => {
    expect(store.queryOne('nope')).toBeNull();
  });

  it('upsertEditing で新規行を作成し queryOne で読める', () => {
    store.upsertEditing({
      sessionId: 's1',
      editing: true,
      file: '/ws/a.ts',
      branch: 'feature/x',
      workspacePath: '/ws',
      appendEdit: { file: '/ws/a.ts', timestamp: '2026-05-31T00:00:00.000Z' },
      plannedEdits: ['/ws/b.ts'],
      updatedAt: '2026-05-31T00:00:00.000Z',
    });
    const row = store.queryOne('s1');
    expect(row).not.toBeNull();
    expect(row!.editing).toBe(true);
    expect(row!.file).toBe('/ws/a.ts');
    expect(row!.branch).toBe('feature/x');
    expect(row!.workspacePath).toBe('/ws');
    expect(row!.sessionEdits).toEqual([
      { file: '/ws/a.ts', timestamp: '2026-05-31T00:00:00.000Z' },
    ]);
    expect(row!.plannedEdits).toEqual(['/ws/b.ts']);
    expect(row!.committedCount).toBe(0);
    expect(row!.lastCommit).toBeNull();
    expect(row!.summary).toBe('{}'); // handoff スキーマ移行で既定 '' → '{}'（json_valid CHECK）
    expect(row!.handoffAt).toBeNull();
  });

  it('upsertEditing は同一セッションを更新する（編集系のみ）', () => {
    store.upsertEditing({
      sessionId: 's1',
      editing: true,
      file: '/ws/a.ts',
      updatedAt: '2026-05-31T00:00:00.000Z',
    });
    store.upsertEditing({
      sessionId: 's1',
      editing: false,
      file: '/ws/c.ts',
      updatedAt: '2026-05-31T00:00:01.000Z',
    });
    const row = store.queryOne('s1');
    expect(row!.editing).toBe(false);
    expect(row!.file).toBe('/ws/c.ts');
  });

  it('部分更新: undefined のフィールドは既存値を保持する', () => {
    store.upsertEditing({
      sessionId: 's1',
      editing: true,
      file: '/ws/a.ts',
      branch: 'main',
      workspacePath: '/ws',
    });
    // Bash hook 相当: workspacePath と editing のみ更新、file/branch は保持
    store.upsertEditing({ sessionId: 's1', editing: false, workspacePath: '/ws2' });
    const row = store.queryOne('s1');
    expect(row!.editing).toBe(false);
    expect(row!.file).toBe('/ws/a.ts');
    expect(row!.branch).toBe('main');
    expect(row!.workspacePath).toBe('/ws2');
  });

  it('appendEdit は同一 file の timestamp を更新し、別 file は追記する', () => {
    store.upsertEditing({
      sessionId: 's1',
      appendEdit: { file: '/ws/a.ts', timestamp: '2026-05-31T00:00:00.000Z' },
    });
    store.upsertEditing({
      sessionId: 's1',
      appendEdit: { file: '/ws/b.ts', timestamp: '2026-05-31T00:00:01.000Z' },
    });
    store.upsertEditing({
      sessionId: 's1',
      appendEdit: { file: '/ws/a.ts', timestamp: '2026-05-31T00:00:02.000Z' },
    });
    const row = store.queryOne('s1');
    expect(row!.sessionEdits).toEqual([
      { file: '/ws/a.ts', timestamp: '2026-05-31T00:00:02.000Z' },
      { file: '/ws/b.ts', timestamp: '2026-05-31T00:00:01.000Z' },
    ]);
  });

  it('plannedEdits の置換は appendEdit と独立して動く', () => {
    store.upsertEditing({
      sessionId: 's1',
      appendEdit: { file: '/ws/a.ts', timestamp: '2026-05-31T00:00:00.000Z' },
    });
    store.upsertEditing({ sessionId: 's1', plannedEdits: ['/ws/p1.ts', '/ws/p2.ts'] });
    const row = store.queryOne('s1');
    expect(row!.sessionEdits.length).toBe(1);
    expect(row!.plannedEdits).toEqual(['/ws/p1.ts', '/ws/p2.ts']);
  });

  it('clearEdits は sessionEdits と plannedEdits を空にする', () => {
    store.upsertEditing({
      sessionId: 's1',
      appendEdit: { file: '/ws/a.ts', timestamp: '2026-05-31T00:00:00.000Z' },
      plannedEdits: ['/ws/p1.ts'],
    });
    store.upsertEditing({ sessionId: 's1', clearEdits: true });
    const row = store.queryOne('s1');
    expect(row!.sessionEdits).toEqual([]);
    expect(row!.plannedEdits).toEqual([]);
  });

  it('deleteSession は行を削除する', () => {
    store.upsertEditing({ sessionId: 's1', editing: true });
    expect(store.queryOne('s1')).not.toBeNull();
    store.deleteSession('s1');
    expect(store.queryOne('s1')).toBeNull();
    // 存在しないセッションの削除はエラーにならない
    expect(() => store.deleteSession('nope')).not.toThrow();
  });

  it('upsertCommit は行が無ければ作成し committed_count を設定する', () => {
    store.upsertCommit({
      sessionId: 's2',
      lastHead: 'abc123',
      commitHash: 'abc123',
      committedAt: '2026-05-31T01:00:00.000Z',
      count: 2,
      updatedAt: '2026-05-31T01:00:00.000Z',
    });
    const row = store.queryOne('s2');
    expect(row!.lastHead).toBe('abc123');
    expect(row!.committedCount).toBe(2);
    expect(row!.lastCommit).toEqual({
      hash: 'abc123',
      timestamp: '2026-05-31T01:00:00.000Z',
    });
    expect(row!.editing).toBe(false);
  });

  it('upsertCommit は committed_count を加算する', () => {
    store.upsertCommit({
      sessionId: 's2',
      lastHead: 'h1',
      commitHash: 'h1',
      committedAt: '2026-05-31T01:00:00.000Z',
      count: 1,
    });
    store.upsertCommit({
      sessionId: 's2',
      lastHead: 'h2',
      commitHash: 'h2',
      committedAt: '2026-05-31T02:00:00.000Z',
      count: 3,
    });
    const row = store.queryOne('s2');
    expect(row!.committedCount).toBe(4);
    expect(row!.lastHead).toBe('h2');
    expect(row!.lastCommit!.hash).toBe('h2');
  });

  it('upsertCommit は編集系の列を破壊しない', () => {
    store.upsertEditing({
      sessionId: 's3',
      editing: true,
      file: '/ws/a.ts',
      branch: 'main',
    });
    store.upsertCommit({
      sessionId: 's3',
      lastHead: 'h1',
      commitHash: 'h1',
      committedAt: '2026-05-31T01:00:00.000Z',
      count: 1,
    });
    const row = store.queryOne('s3');
    expect(row!.editing).toBe(true);
    expect(row!.file).toBe('/ws/a.ts');
    expect(row!.branch).toBe('main');
    expect(row!.committedCount).toBe(1);
  });

  it('upsertEditing は commit 系の列を破壊しない', () => {
    store.upsertCommit({
      sessionId: 's4',
      lastHead: 'h1',
      commitHash: 'h1',
      committedAt: '2026-05-31T01:00:00.000Z',
      count: 5,
    });
    store.upsertEditing({ sessionId: 's4', editing: true, file: '/ws/z.ts' });
    const row = store.queryOne('s4');
    expect(row!.committedCount).toBe(5);
    expect(row!.lastHead).toBe('h1');
    expect(row!.editing).toBe(true);
  });

  it('count=0 のシードは last_head のみ更新し last_commit は保持する', () => {
    // 初回: HEAD のシードのみ（コミット 0 件）
    store.upsertCommit({ sessionId: 's6', lastHead: 'seed', count: 0 });
    let row = store.queryOne('s6');
    expect(row!.lastHead).toBe('seed');
    expect(row!.committedCount).toBe(0);
    expect(row!.lastCommit).toBeNull();

    // 実コミット検出
    store.upsertCommit({
      sessionId: 's6',
      lastHead: 'real',
      commitHash: 'real',
      committedAt: '2026-05-31T03:00:00.000Z',
      count: 1,
    });
    row = store.queryOne('s6');
    expect(row!.committedCount).toBe(1);
    expect(row!.lastCommit!.hash).toBe('real');

    // 次回シード（新規コミット無し）: last_commit を保持
    store.upsertCommit({ sessionId: 's6', lastHead: 'real', count: 0 });
    row = store.queryOne('s6');
    expect(row!.lastCommit!.hash).toBe('real');
    expect(row!.committedCount).toBe(1);
  });

  it('queryAll は updated_at 降順で全件返す', () => {
    store.upsertEditing({ sessionId: 'old', editing: false, updatedAt: '2026-05-31T00:00:00.000Z' });
    store.upsertEditing({ sessionId: 'new', editing: false, updatedAt: '2026-05-31T05:00:00.000Z' });
    const rows = store.queryAll();
    expect(rows.map((r) => r.sessionId)).toEqual(['new', 'old']);
  });

  it('ms なし ISO 8601 timestamp も受け入れる', () => {
    expect(() =>
      store.upsertEditing({ sessionId: 's5', editing: false, updatedAt: '2026-05-31T00:00:00Z' }),
    ).not.toThrow();
  });

  it('upsertEditing は pid / terminalPid を保存し、省略時は既存値を保持する', () => {
    store.upsertEditing({ sessionId: 'sp', editing: true, pid: 1234, terminalPid: 1200 });
    expect(store.queryOne('sp')?.pid).toBe(1234);
    expect(store.queryOne('sp')?.terminalPid).toBe(1200);

    // pid を省略した更新でも既存値が消えない（部分更新セマンティクス）。
    store.upsertEditing({ sessionId: 'sp', editing: false });
    const row = store.queryOne('sp');
    expect(row?.pid).toBe(1234);
    expect(row?.terminalPid).toBe(1200);
  });

  it('pid 未指定の新規行は pid / terminalPid が null', () => {
    store.upsertEditing({ sessionId: 'sn', editing: false });
    const row = store.queryOne('sn');
    expect(row?.pid).toBeNull();
    expect(row?.terminalPid).toBeNull();
  });

  describe('pruneSessionsOlderThan', () => {
    it('cutoff より古い updated_at の行のみ削除し、削除件数を返す', () => {
      store.upsertEditing({ sessionId: 'ancient', editing: false, updatedAt: '2026-05-01T00:00:00.000Z' });
      store.upsertEditing({ sessionId: 'old', editing: false, updatedAt: '2026-05-10T00:00:00.000Z' });
      store.upsertEditing({ sessionId: 'fresh', editing: false, updatedAt: '2026-05-31T00:00:00.000Z' });

      const deleted = store.pruneSessionsOlderThan('2026-05-15T00:00:00.000Z');

      expect(deleted).toBe(2);
      expect(store.queryOne('ancient')).toBeNull();
      expect(store.queryOne('old')).toBeNull();
      expect(store.queryOne('fresh')).not.toBeNull();
      expect(store.queryAll().map((r) => r.sessionId)).toEqual(['fresh']);
    });

    it('updated_at == cutoff の行は残す（厳密 < のみ削除）', () => {
      store.upsertEditing({ sessionId: 'boundary', editing: false, updatedAt: '2026-05-15T00:00:00.000Z' });
      const deleted = store.pruneSessionsOlderThan('2026-05-15T00:00:00.000Z');
      expect(deleted).toBe(0);
      expect(store.queryOne('boundary')).not.toBeNull();
    });

    it('削除対象が無ければ 0 を返し全行を保持する', () => {
      store.upsertEditing({ sessionId: 'a', editing: false, updatedAt: '2026-05-31T00:00:00.000Z' });
      store.upsertEditing({ sessionId: 'b', editing: false, updatedAt: '2026-05-31T01:00:00.000Z' });
      const deleted = store.pruneSessionsOlderThan('2026-05-01T00:00:00.000Z');
      expect(deleted).toBe(0);
      expect(store.queryAll()).toHaveLength(2);
    });
  });
});
