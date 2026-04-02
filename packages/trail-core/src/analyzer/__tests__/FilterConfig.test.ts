import { FilterConfig, applyFilter } from '../FilterConfig';
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
