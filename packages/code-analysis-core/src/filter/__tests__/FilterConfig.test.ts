import ignore from 'ignore';
import { applyFilter, type FilterConfig } from '../FilterConfig';
import type { TrailNode, TrailEdge } from '../../model/types';

function makeIgnore(patterns: readonly string[]) {
  return ignore().add([...patterns]);
}

describe('FilterConfig', () => {
  const nodes: TrailNode[] = [
    { id: 'file::src/app.ts', label: 'app.ts', type: 'file', filePath: 'src/app.ts', line: 1 },
    { id: 'file::src/app.test.ts', label: 'app.test.ts', type: 'file', filePath: 'src/app.test.ts', line: 1 },
    { id: 'file::src/app.ts::App', label: 'App', type: 'class', filePath: 'src/app.ts', line: 3, parent: 'file::src/app.ts' },
  ];

  const edges: TrailEdge[] = [
    { source: 'file::src/app.test.ts', target: 'file::src/app.ts', type: 'import' },
  ];

  it('should exclude test files by default (TEST_PATTERN)', () => {
    const config: FilterConfig = { exclude: makeIgnore([]), includeTests: false };
    const result = applyFilter(nodes, edges, config);
    const fileLabels = result.nodes.filter(n => n.type === 'file').map(n => n.label);
    expect(fileLabels).toContain('app.ts');
    expect(fileLabels).not.toContain('app.test.ts');
  });

  it('should include test files when configured', () => {
    const config: FilterConfig = { exclude: makeIgnore([]), includeTests: true };
    const result = applyFilter(nodes, edges, config);
    const fileLabels = result.nodes.filter(n => n.type === 'file').map(n => n.label);
    expect(fileLabels).toContain('app.test.ts');
  });

  it('should remove orphaned edges when nodes are filtered', () => {
    const config: FilterConfig = { exclude: makeIgnore([]), includeTests: false };
    const result = applyFilter(nodes, edges, config);
    expect(result.edges).toHaveLength(0);
  });

  describe('.gitignore syntax', () => {
    it('directory-name (any depth)', () => {
      const dirNodes: TrailNode[] = [
        { id: 'a', label: 'a', type: 'file', filePath: 'packages/foo/__tests__/bar.ts', line: 1 },
        { id: 'b', label: 'b', type: 'file', filePath: 'packages/foo/src/bar.ts', line: 1 },
      ];
      const config: FilterConfig = { exclude: makeIgnore(['__tests__/']), includeTests: true };
      const result = applyFilter(dirNodes, [], config);
      expect(result.nodes.map(n => n.filePath)).toEqual(['packages/foo/src/bar.ts']);
    });

    it('file-glob with extension (*.spec.ts)', () => {
      const dirNodes: TrailNode[] = [
        { id: 'a', label: 'a', type: 'file', filePath: 'src/a.spec.ts', line: 1 },
        { id: 'b', label: 'b', type: 'file', filePath: 'src/a.ts', line: 1 },
      ];
      const config: FilterConfig = { exclude: makeIgnore(['*.spec.ts']), includeTests: true };
      const result = applyFilter(dirNodes, [], config);
      expect(result.nodes.map(n => n.filePath)).toEqual(['src/a.ts']);
    });

    it('root-anchored pattern (/dist)', () => {
      const dirNodes: TrailNode[] = [
        { id: 'a', label: 'a', type: 'file', filePath: 'dist/main.ts', line: 1 },
        { id: 'b', label: 'b', type: 'file', filePath: 'src/dist/main.ts', line: 1 },
      ];
      const config: FilterConfig = { exclude: makeIgnore(['/dist']), includeTests: true };
      const result = applyFilter(dirNodes, [], config);
      expect(result.nodes.map(n => n.filePath)).toEqual(['src/dist/main.ts']);
    });

    it('negation (! re-includes a file when its parent dir is not excluded)', () => {
      // gitignore の制約: 親ディレクトリが excluded だと子の `!` は効かない。
      // 親をディレクトリ単位で除外せず、ファイル glob で除外して特定ファイルだけ再包含する。
      const dirNodes: TrailNode[] = [
        { id: 'a', label: 'a', type: 'file', filePath: 'packages/foo/keep.spec.ts', line: 1 },
        { id: 'b', label: 'b', type: 'file', filePath: 'packages/foo/drop.spec.ts', line: 1 },
      ];
      const config: FilterConfig = {
        exclude: makeIgnore(['*.spec.ts', '!packages/foo/keep.spec.ts']),
        includeTests: true,
      };
      const result = applyFilter(dirNodes, [], config);
      expect(result.nodes.map(n => n.filePath)).toEqual(['packages/foo/keep.spec.ts']);
    });

    it('comments and empty lines are ignored', () => {
      const dirNodes: TrailNode[] = [
        { id: 'a', label: 'a', type: 'file', filePath: 'src/a.ts', line: 1 },
      ];
      const config: FilterConfig = {
        exclude: makeIgnore(['# comment', '', '   ']),
        includeTests: true,
      };
      const result = applyFilter(dirNodes, [], config);
      expect(result.nodes.map(n => n.filePath)).toEqual(['src/a.ts']);
    });
  });
});
