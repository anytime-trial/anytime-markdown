import {
  allWorkspacesScope,
  ownWorkspaceScope,
  resolveWorkspaceScope,
  workspaceScopeSql,
} from '../../src/ingest/workspaceScope';

describe('resolveWorkspaceScope', () => {
  it("mode='own' は repoName を持つ own_workspace を返す", () => {
    expect(resolveWorkspaceScope('own', 'anytime-markdown')).toEqual({
      kind: 'own_workspace',
      repoName: 'anytime-markdown',
    });
  });

  it("mode='all' は repoName を無視して all_workspaces を返す", () => {
    expect(resolveWorkspaceScope('all', 'anytime-markdown')).toEqual({ kind: 'all_workspaces' });
  });

  it('repoName が空文字なら例外を投げる（暗黙に全件へ縮退させない）', () => {
    expect(() => resolveWorkspaceScope('own', '   ')).toThrow(/repoName/);
  });
});

describe('workspaceScopeSql', () => {
  it('own_workspace は activity_repos 経由の session_id 絞り込みと repoName バインドを返す', () => {
    const predicate = workspaceScopeSql(ownWorkspaceScope('anytime-markdown'), 'm');
    expect(predicate.sql).toContain('m.session_id IN');
    expect(predicate.sql).toContain('trail.activity_sessions');
    expect(predicate.sql).toContain('trail.activity_repos');
    expect(predicate.sql).toContain('r.repo_name = ?');
    expect(predicate.params).toEqual(['anytime-markdown']);
  });

  it('alias 省略時は別名なしの session_id を参照する', () => {
    const predicate = workspaceScopeSql(ownWorkspaceScope('anytime-markdown'));
    expect(predicate.sql).toContain('session_id IN');
    expect(predicate.sql).not.toContain('m.session_id');
  });

  it('all_workspaces は常に真の述語をバインド無しで返す', () => {
    const predicate = workspaceScopeSql(allWorkspacesScope(), 'm');
    expect(predicate.sql).toBe('1 = 1');
    expect(predicate.params).toEqual([]);
  });

  it('repoName は SQL へ literal 埋め込みせずバインドする（インジェクション経路を作らない）', () => {
    const predicate = workspaceScopeSql(ownWorkspaceScope("x' OR '1'='1"), 'm');
    expect(predicate.sql).not.toContain("x'");
    expect(predicate.params).toEqual(["x' OR '1'='1"]);
  });
});
