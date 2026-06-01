import { ClaudeStatusWatcher } from '../claude/ClaudeStatusWatcher';
import type { AgentStatusRow, AgentStatusSource } from '../claude/types';

// JSONL エンリッチ（title/tokens）が本番ホームを読まないよう os.homedir を一時ディレクトリへ。
jest.mock('node:os', () => {
  const actual: typeof import('node:os') = jest.requireActual('node:os');
  return { ...actual, homedir: () => process.env.HOME ?? actual.tmpdir() };
});

function row(partial: Partial<AgentStatusRow> & { sessionId: string }): AgentStatusRow {
  return {
    sessionId: partial.sessionId,
    editing: partial.editing ?? false,
    file: partial.file ?? '',
    branch: partial.branch ?? '',
    workspacePath: partial.workspacePath ?? '',
    sessionEdits: partial.sessionEdits ?? [],
    plannedEdits: partial.plannedEdits ?? [],
    committedCount: partial.committedCount ?? 0,
    lastCommit: partial.lastCommit ?? null,
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
  };
}

class FakeSource implements AgentStatusSource {
  rows: AgentStatusRow[] = [];
  deleted: string[] = [];
  queryAll(): Promise<readonly AgentStatusRow[]> {
    return Promise.resolve(this.rows);
  }
  deleteSession(sessionId: string): Promise<boolean> {
    this.deleted.push(sessionId);
    return Promise.resolve(true);
  }
}

/** ポーリング 1 サイクルの完了を待つ */
async function tick(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('ClaudeStatusWatcher', () => {
  let source: FakeSource;
  let watcher: ClaudeStatusWatcher;

  beforeEach(() => {
    source = new FakeSource();
  });

  afterEach(() => {
    watcher?.dispose();
  });

  it('起動直後にワーカーをポーリングし getAllAgents に反映する', async () => {
    const now = new Date().toISOString();
    source.rows = [row({ sessionId: 's1', editing: true, file: '/ws/a.ts', updatedAt: now })];
    watcher = new ClaudeStatusWatcher(source);
    await tick();

    const agents = watcher.getAllAgents();
    expect(agents.size).toBe(1);
    const a = agents.get('s1');
    expect(a?.editing).toBe(true);
    expect(a?.file).toBe('/ws/a.ts');
  });

  it('committedCount / lastCommit を AgentInfo に載せる', async () => {
    source.rows = [
      row({
        sessionId: 's1',
        committedCount: 3,
        lastCommit: { hash: 'abc1234', timestamp: '2026-05-31T01:00:00.000Z' },
      }),
    ];
    watcher = new ClaudeStatusWatcher(source);
    await tick();

    const a = watcher.getAllAgents().get('s1');
    expect(a?.committedCount).toBe(3);
    expect(a?.lastCommit).toEqual({ hash: 'abc1234', timestamp: '2026-05-31T01:00:00.000Z' });
  });

  it('getAgents は stale を除外し getAllAgents は含む', async () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    const fresh = new Date().toISOString();
    source.rows = [
      row({ sessionId: 'old', updatedAt: old }),
      row({ sessionId: 'fresh', updatedAt: fresh }),
    ];
    watcher = new ClaudeStatusWatcher(source);
    await tick();

    expect([...watcher.getAllAgents().keys()].sort()).toEqual(['fresh', 'old']);
    expect([...watcher.getAgents().keys()]).toEqual(['fresh']);
  });

  it('onMultiStatusChange は変化時に呼ばれる', async () => {
    const cb = jest.fn();
    source.rows = [row({ sessionId: 's1', updatedAt: new Date().toISOString() })];
    watcher = new ClaudeStatusWatcher(source);
    watcher.onMultiStatusChange(cb);
    await tick();
    expect(cb).toHaveBeenCalled();
  });

  it('deleteSession はソースへ委譲する', async () => {
    watcher = new ClaudeStatusWatcher(source);
    await watcher.deleteSession('gone');
    expect(source.deleted).toContain('gone');
  });

  it('queryAll が reject してもクラッシュせず空マップになる', async () => {
    const throwing: AgentStatusSource = {
      queryAll: () => Promise.reject(new Error('worker down')),
      deleteSession: () => Promise.resolve(false),
    };
    watcher = new ClaudeStatusWatcher(throwing);
    await tick();
    expect(watcher.getAllAgents().size).toBe(0);
  });
});
