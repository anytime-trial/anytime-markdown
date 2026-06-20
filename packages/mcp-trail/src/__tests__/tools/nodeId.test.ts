import { toCodeGraphNodeId } from '../../tools/nodeId';

describe('toCodeGraphNodeId', () => {
  test('filePath を <repo>:<拡張子なし> に正規化', () => {
    expect(toCodeGraphNodeId('anytime-markdown', 'packages/trail-db/src/internal/SqlJsCompatDatabase.ts'))
      .toBe('anytime-markdown:packages/trail-db/src/internal/SqlJsCompatDatabase');
  });
  test('.tsx も拡張子のみ除去', () => {
    expect(toCodeGraphNodeId('repo', 'a/B.tsx')).toBe('repo:a/B');
  });
  test('既にノード ID (":" を含む) ならそのまま', () => {
    expect(toCodeGraphNodeId('repo', 'repo:a/B')).toBe('repo:a/B');
  });
  test('拡張子なしパスはそのまま prefix', () => {
    expect(toCodeGraphNodeId('repo', 'a/B')).toBe('repo:a/B');
  });
});
