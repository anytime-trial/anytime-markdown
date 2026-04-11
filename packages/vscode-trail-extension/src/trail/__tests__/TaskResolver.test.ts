import {
  parseTaskFromMergeCommit,
  mapFilesToC4Elements,
} from '@anytime-markdown/trail-core';

describe('parseTaskFromMergeCommit', () => {
  it('Merge branch パターンからブランチ名とマージ先を抽出する', () => {
    const result = parseTaskFromMergeCommit(
      "Merge branch 'feature/trail-viewer' into develop",
    );
    expect(result.branchName).toBe('feature/trail-viewer');
    expect(result.baseBranch).toBe('develop');
    expect(result.prNumber).toBeNull();
  });

  it('merge: パターンからブランチ名とマージ先を抽出する', () => {
    const result = parseTaskFromMergeCommit(
      'merge: feature/c4-mermaid-serializer into develop',
    );
    expect(result.branchName).toBe('feature/c4-mermaid-serializer');
    expect(result.baseBranch).toBe('develop');
  });

  it('(#NN) パターンから PR 番号を抽出する', () => {
    const result = parseTaskFromMergeCommit('release: v0.10.1 (#84)');
    expect(result.prNumber).toBe(84);
    expect(result.branchName).toBeNull();
  });

  it('Merge branch + (#NN) の両方を抽出する', () => {
    const result = parseTaskFromMergeCommit(
      "Merge branch 'fix/login-bug' into develop (#42)",
    );
    expect(result.branchName).toBe('fix/login-bug');
    expect(result.baseBranch).toBe('develop');
    expect(result.prNumber).toBe(42);
  });

  it('マッチしない場合はすべて null/空文字を返す', () => {
    const result = parseTaskFromMergeCommit('feat: add new feature');
    expect(result.branchName).toBeNull();
    expect(result.prNumber).toBeNull();
    expect(result.baseBranch).toBe('');
  });
});

describe('mapFilesToC4Elements', () => {
  const elements = [
    { id: 'sys_anytime-markdown', type: 'system', name: 'anytime-markdown' },
    { id: 'pkg_graph-core', type: 'container', name: 'graph-core', boundaryId: 'sys_anytime-markdown' },
    { id: 'pkg_graph-core/engine', type: 'component', name: 'engine', boundaryId: 'pkg_graph-core' },
    { id: 'file::packages/graph-core/src/engine/constants.ts', type: 'code', name: 'constants.ts', boundaryId: 'pkg_graph-core/engine' },
    { id: 'pkg_web-app', type: 'container', name: 'web-app', boundaryId: 'sys_anytime-markdown' },
    { id: 'file::packages/web-app/src/App.tsx', type: 'code', name: 'App.tsx', boundaryId: 'pkg_web-app' },
  ];

  it('exact マッチでファイルと祖先要素を返す', () => {
    const result = mapFilesToC4Elements(
      ['packages/graph-core/src/engine/constants.ts'],
      elements,
    );
    const ids = result.map((r) => r.elementId);
    expect(ids).toContain('file::packages/graph-core/src/engine/constants.ts');
    expect(ids).toContain('pkg_graph-core/engine');
    expect(ids).toContain('pkg_graph-core');
    expect(ids).toContain('sys_anytime-markdown');
    expect(result.find((r) => r.elementId.startsWith('file::'))?.matchType).toBe('exact');
  });

  it('elementName を返す', () => {
    const result = mapFilesToC4Elements(
      ['packages/graph-core/src/engine/constants.ts'],
      elements,
    );
    const fileResult = result.find((r) => r.elementId.startsWith('file::'));
    expect(fileResult?.elementName).toBe('constants.ts');
    const pkgResult = result.find((r) => r.elementId === 'pkg_graph-core');
    expect(pkgResult?.elementName).toBe('graph-core');
  });

  it('ファイルが C4 モデルにない場合はパッケージにフォールバックする', () => {
    const result = mapFilesToC4Elements(
      ['packages/graph-core/src/unknown-file.ts'],
      elements,
    );
    expect(result).toHaveLength(1);
    expect(result[0].elementId).toBe('pkg_graph-core');
    expect(result[0].matchType).toBe('package_fallback');
    expect(result[0].elementName).toBe('graph-core');
  });

  it('重複する要素は除外する', () => {
    const result = mapFilesToC4Elements(
      [
        'packages/graph-core/src/engine/constants.ts',
        'packages/graph-core/src/unknown.ts',
      ],
      elements,
    );
    const pkgEntries = result.filter((r) => r.elementId === 'pkg_graph-core');
    expect(pkgEntries).toHaveLength(1);
  });

  it('packages/ 配下でないファイルはスキップする', () => {
    const result = mapFilesToC4Elements(
      ['README.md', '.github/workflows/ci.yml'],
      elements,
    );
    expect(result).toHaveLength(0);
  });

  it('複数パッケージにまたがるファイルを処理する', () => {
    const result = mapFilesToC4Elements(
      [
        'packages/graph-core/src/engine/constants.ts',
        'packages/web-app/src/App.tsx',
      ],
      elements,
    );
    const ids = result.map((r) => r.elementId);
    expect(ids).toContain('file::packages/graph-core/src/engine/constants.ts');
    expect(ids).toContain('file::packages/web-app/src/App.tsx');
    expect(ids).toContain('pkg_graph-core');
    expect(ids).toContain('pkg_web-app');
  });
});
