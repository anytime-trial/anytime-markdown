import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStatusStore } from '../AgentStatusStore';

describe('git_activity', () => {
  let dir: string;
  let store: AgentStatusStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'git-activity-'));
    store = new AgentStatusStore(join(dir, 'agent-status.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('records an operation and reads it back newest-first', () => {
    store.insertGitActivity({
      workspacePath: '/ws',
      opType: 'reset',
      destructive: true,
      refName: 'refs/heads/feature/x',
      beforeSha: 'aaa',
      afterSha: 'bbb',
      attribution: 'human',
      agentKind: null,
      sessionId: null,
      occurredAt: '2026-07-13T00:00:00.000Z',
    });
    store.insertGitActivity({
      workspacePath: '/ws',
      opType: 'commit',
      destructive: false,
      refName: 'refs/heads/develop',
      beforeSha: 'ccc',
      afterSha: 'ddd',
      attribution: 'claude',
      agentKind: 'claude-code',
      sessionId: 's1',
      occurredAt: '2026-07-13T01:00:00.000Z',
    });

    const rows = store.queryGitActivity(10);
    expect(rows.map((r) => r.opType)).toEqual(['commit', 'reset']);
    expect(rows[0].sessionId).toBe('s1');
    expect(rows[1].attribution).toBe('human');
    expect(rows[1].destructive).toBe(true);
  });

  it('セッションが prune されても記録の session_id を失わない（帰属はフォレンジクスの核心データ）', () => {
    store.upsertEditing({ sessionId: 's1', editing: true, updatedAt: '2026-07-13T01:00:00.000Z' });
    store.insertGitActivity({
      workspacePath: '/ws',
      opType: 'commit',
      destructive: false,
      refName: 'refs/heads/develop',
      beforeSha: 'ccc',
      afterSha: 'ddd',
      attribution: 'claude',
      agentKind: 'claude-code',
      sessionId: 's1',
      occurredAt: '2026-07-13T01:00:00.000Z',
    });

    store.deleteSession('s1');

    const rows = store.queryGitActivity(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe('s1');
    expect(rows[0].attribution).toBe('claude');
  });

  it('セッション行が存在しなくても記録できる（ワーカー停止中の spool 取り込み）', () => {
    // ワーカーが停止している間、フックは spool に書くが agent_sessions は更新されない。
    // 取り込み時に親行が無いことは正常系であり、記録を捨てたり幽霊セッションを作ったりしない。
    store.insertGitActivity({
      workspacePath: '/ws',
      opType: 'reset',
      destructive: true,
      refName: 'refs/heads/develop',
      beforeSha: 'ccc',
      afterSha: 'ddd',
      attribution: 'claude',
      agentKind: 'claude-code',
      sessionId: 'never-registered',
      occurredAt: '2026-07-13T01:00:00.000Z',
    });

    expect(store.queryGitActivity(10)[0].sessionId).toBe('never-registered');
    // agent_sessions を汚さないこと（Agent マッピングに幽霊エージェントを出さない）
    expect(store.queryAll()).toHaveLength(0);
  });

  it('prunes rows older than the cutoff', () => {
    store.insertGitActivity({
      workspacePath: '/ws',
      opType: 'commit',
      destructive: false,
      refName: 'refs/heads/develop',
      beforeSha: null,
      afterSha: 'ddd',
      attribution: 'human',
      agentKind: null,
      sessionId: null,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });

    const removed = store.pruneGitActivityOlderThan('2026-07-01T00:00:00.000Z');

    expect(removed).toBe(1);
    expect(store.queryGitActivity(10)).toHaveLength(0);
  });

  it('rejects an unknown op_type at the DB layer', () => {
    expect(() =>
      store.insertGitActivity({
        workspacePath: '/ws',
        // @ts-expect-error 不正値を DB の CHECK が弾くことを確認する
        opType: 'teleport',
        destructive: false,
        refName: 'refs/heads/develop',
        beforeSha: null,
        afterSha: 'ddd',
        attribution: 'human',
        agentKind: null,
        sessionId: null,
        occurredAt: '2026-07-13T01:00:00.000Z',
      }),
    ).toThrow();
  });
});
