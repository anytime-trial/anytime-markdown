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
