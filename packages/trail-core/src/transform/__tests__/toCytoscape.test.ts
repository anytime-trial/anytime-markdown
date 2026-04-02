import { toCytoscape } from '../toCytoscape';
import type { TrailGraph } from '../../model/types';

const graph: TrailGraph = {
  nodes: [
    { id: 'file::src/index.ts', label: 'index.ts', type: 'file', filePath: 'src/index.ts', line: 1 },
    { id: 'file::src/index.ts::App', label: 'App', type: 'class', filePath: 'src/index.ts', line: 3, parent: 'file::src/index.ts' },
    { id: 'file::src/index.ts::App::run', label: 'run', type: 'function', filePath: 'src/index.ts', line: 4, parent: 'file::src/index.ts::App' },
    { id: 'file::src/utils.ts', label: 'utils.ts', type: 'file', filePath: 'src/utils.ts', line: 1 },
    { id: 'file::src/utils.ts::greet', label: 'greet', type: 'function', filePath: 'src/utils.ts', line: 1, parent: 'file::src/utils.ts' },
  ],
  edges: [
    { source: 'file::src/index.ts', target: 'file::src/utils.ts', type: 'import' },
    { source: 'file::src/index.ts::App::run', target: 'file::src/utils.ts::greet', type: 'call' },
  ],
  metadata: { projectRoot: '/project', analyzedAt: '2026-04-02T00:00:00Z', fileCount: 2 },
};

describe('toCytoscape', () => {
  it('should convert nodes to ElementDefinition format', () => {
    const elements = toCytoscape(graph);
    const nodeElements = elements.filter(e => !('source' in e.data));

    const appNode = nodeElements.find(e => e.data.id === 'file::src/index.ts::App');
    expect(appNode).toBeDefined();
    expect(appNode!.data).toMatchObject({
      label: 'App',
      type: 'class',
      filePath: 'src/index.ts',
      line: 3,
      parent: 'file::src/index.ts',
    });
  });

  it('should convert edges to ElementDefinition format', () => {
    const elements = toCytoscape(graph);
    const edgeElements = elements.filter(e => 'source' in e.data);

    expect(edgeElements).toHaveLength(2);
    expect(edgeElements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'file::src/index.ts',
            target: 'file::src/utils.ts',
            type: 'import',
          }),
        }),
      ]),
    );
  });

  it('should produce valid ElementDefinition array', () => {
    const elements = toCytoscape(graph);
    expect(Array.isArray(elements)).toBe(true);
    expect(elements.length).toBe(graph.nodes.length + graph.edges.length);
  });
});

describe('toCytoscape bundleEdges', () => {
  const graph: TrailGraph = {
    nodes: [
      { id: 'a', label: 'A', type: 'file', filePath: 'a.ts', line: 1 },
      { id: 'b', label: 'B', type: 'file', filePath: 'b.ts', line: 1 },
      { id: 'c', label: 'C', type: 'file', filePath: 'c.ts', line: 1 },
    ],
    edges: [
      { source: 'a', target: 'b', type: 'import' },
      { source: 'a', target: 'b', type: 'call' },
      { source: 'a', target: 'b', type: 'type_use' },
      { source: 'a', target: 'c', type: 'import' },
    ],
    metadata: { projectRoot: '/p', analyzedAt: '', fileCount: 3 },
  };

  it('should not bundle edges by default', () => {
    const elements = toCytoscape(graph);
    const edgeElements = elements.filter(e => 'source' in e.data);
    expect(edgeElements).toHaveLength(4);
  });

  it('should bundle edges with same source-target pair', () => {
    const elements = toCytoscape(graph, { bundleEdges: true });
    const edgeElements = elements.filter(e => 'source' in e.data);
    // a→b: 3 edges → 1 bundled, a→c: 1 edge → 1 as-is
    expect(edgeElements).toHaveLength(2);
  });

  it('should set weight and bundledTypes on bundled edge', () => {
    const elements = toCytoscape(graph, { bundleEdges: true });
    const bundled = elements.find(e => e.data.type === 'bundled');
    expect(bundled).toBeDefined();
    expect(bundled!.data.weight).toBe(3);
    expect(bundled!.data.bundledTypes).toEqual(
      expect.arrayContaining(['import', 'call', 'type_use']),
    );
  });

  it('should not bundle single edges', () => {
    const elements = toCytoscape(graph, { bundleEdges: true });
    const importToC = elements.find(
      e => e.data.source === 'a' && e.data.target === 'c',
    );
    expect(importToC).toBeDefined();
    expect(importToC!.data.type).toBe('import');
  });
});
