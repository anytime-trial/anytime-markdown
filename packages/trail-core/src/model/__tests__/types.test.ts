import type {
  TrailNodeType,
  TrailEdgeType,
  TrailNode,
  TrailEdge,
  TrailGraph,
} from '../types';
import { TRAIL_NODE_TYPES, TRAIL_EDGE_TYPES } from '../constants';

describe('TrailGraph model', () => {
  it('should define all node types', () => {
    expect(TRAIL_NODE_TYPES).toEqual([
      'file', 'class', 'interface', 'function',
      'variable', 'type', 'enum', 'namespace',
    ]);
  });

  it('should define all edge types', () => {
    expect(TRAIL_EDGE_TYPES).toEqual([
      'import', 'call', 'type_use',
      'inheritance', 'implementation', 'override',
    ]);
  });

  it('should create a valid TrailGraph', () => {
    const graph: TrailGraph = {
      nodes: [{
        id: 'file::src/index.ts',
        label: 'index.ts',
        type: 'file',
        filePath: 'src/index.ts',
        line: 1,
      }],
      edges: [],
      metadata: {
        projectRoot: '/project',
        analyzedAt: '2026-04-02T00:00:00Z',
        fileCount: 1,
      },
    };
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });
});
