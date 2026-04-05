import { FilterConfig, applyFilter, matchGlob } from '../FilterConfig';
import type { TrailNode, TrailEdge } from '../../model/types';

describe('FilterConfig', () => {
  const nodes: TrailNode[] = [
    { id: 'file::src/app.ts', label: 'app.ts', type: 'file', filePath: 'src/app.ts', line: 1 },
    { id: 'file::src/app.test.ts', label: 'app.test.ts', type: 'file', filePath: 'src/app.test.ts', line: 1 },
    { id: 'file::src/app.ts::App', label: 'App', type: 'class', filePath: 'src/app.ts', line: 3, parent: 'file::src/app.ts' },
  ];

  const edges: TrailEdge[] = [
    { source: 'file::src/app.test.ts', target: 'file::src/app.ts', type: 'import' },
  ];

  it('should exclude test files by default', () => {
    const config: FilterConfig = { exclude: [], includeTests: false };
    const result = applyFilter(nodes, edges, config);
    const fileLabels = result.nodes.filter(n => n.type === 'file').map(n => n.label);
    expect(fileLabels).toContain('app.ts');
    expect(fileLabels).not.toContain('app.test.ts');
  });

  it('should include test files when configured', () => {
    const config: FilterConfig = { exclude: [], includeTests: true };
    const result = applyFilter(nodes, edges, config);
    const fileLabels = result.nodes.filter(n => n.type === 'file').map(n => n.label);
    expect(fileLabels).toContain('app.test.ts');
  });

  it('should remove orphaned edges when nodes are filtered', () => {
    const config: FilterConfig = { exclude: [], includeTests: false };
    const result = applyFilter(nodes, edges, config);
    expect(result.edges).toHaveLength(0);
  });
});

describe('matchGlob', () => {
  it('should return false for patterns exceeding max length', () => {
    const longPattern = 'a'.repeat(1001);
    expect(matchGlob('src/app.ts', longPattern)).toBe(false);
  });

  it('should safely handle regex special characters in patterns', () => {
    expect(matchGlob('src/foo.bar/baz.ts', 'src/foo.bar/baz.ts')).toBe(true);
    expect(matchGlob('src/foo+bar.ts', 'src/foo+bar.ts')).toBe(true);
    expect(matchGlob('src/(utils)/index.ts', 'src/(utils)/index.ts')).toBe(true);
  });

  it('should still support glob wildcards after escaping', () => {
    expect(matchGlob('src/utils/index.ts', 'src/**')).toBe(true);
    expect(matchGlob('src/app.ts', 'src/*.ts')).toBe(true);
    expect(matchGlob('src/deep/nested/file.ts', 'src/**')).toBe(true);
  });

  it('should not match across directories with single *', () => {
    expect(matchGlob('src/deep/file.ts', 'src/*.ts')).toBe(false);
  });

  it('should return false for invalid regex patterns', () => {
    // matchGlob escapes special chars, so this tests the catch block indirectly
    expect(matchGlob('test', '')).toBe(false);
  });
});
