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
      sessionEdits: [{ file: '/ws/a.ts', timestamp: '2026-05-31T00:00:00.000Z' }],
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
    expect(row!.summary).toBe('');
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
});
