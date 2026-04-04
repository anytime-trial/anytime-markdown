import { trailToC4 } from '../mapper/trailToC4';
import type { TrailGraph } from '@anytime-markdown/trail-core';

function makeTrailGraph(overrides?: Partial<TrailGraph>): TrailGraph {
  return {
    nodes: [],
    edges: [],
    metadata: { projectRoot: '/app', analyzedAt: '2026-01-01', fileCount: 0 },
    ...overrides,
  };
}

describe('trailToC4', () => {
  it('should map file nodes to code elements', () => {
    const graph = makeTrailGraph({
      nodes: [
        { id: 'f1', label: 'index.ts', type: 'file', filePath: 'src/index.ts', line: 0 },
      ],
    });
    const model = trailToC4(graph);
    expect(model.elements.some(e => e.type === 'code' && e.name === 'index.ts')).toBe(true);
  });

  it('should create containers from packages directory pattern', () => {
    const graph = makeTrailGraph({
      nodes: [
        { id: 'f1', label: 'index.ts', type: 'file', filePath: 'packages/web-app/src/index.ts', line: 0 },
        { id: 'f2', label: 'types.ts', type: 'file', filePath: 'packages/graph-core/src/types.ts', line: 0 },
      ],
    });
    const model = trailToC4(graph);
    const containers = model.elements.filter(e => e.type === 'container');
    expect(containers.some(c => c.name === 'web-app')).toBe(true);
    expect(containers.some(c => c.name === 'graph-core')).toBe(true);
  });

  it('should create relationships from import edges between packages', () => {
    const graph = makeTrailGraph({
      nodes: [
        { id: 'f1', label: 'App.tsx', type: 'file', filePath: 'packages/web-app/src/App.tsx', line: 0 },
        { id: 'f2', label: 'types.ts', type: 'file', filePath: 'packages/graph-core/src/types.ts', line: 0 },
      ],
      edges: [
        { source: 'f1', target: 'f2', type: 'import' },
      ],
    });
    const model = trailToC4(graph);
    expect(model.relationships.length).toBeGreaterThanOrEqual(1);
  });

  it('should set level to component for system overview', () => {
    const graph = makeTrailGraph();
    const model = trailToC4(graph);
    expect(model.level).toBe('component');
  });
});
