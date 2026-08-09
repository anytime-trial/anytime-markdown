import { parseTaskFromMergeCommit } from '../taskParser';

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
