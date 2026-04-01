import { batchCreateGraph } from '../../engine/batchImport';

describe('batchCreateGraph', () => {
  it('should create nodes and edges from structured data', () => {
    const result = batchCreateGraph({
      nodes: [
        { id: 'n1', text: 'Paper A', metadata: { year: 2020, citationCount: 100 } },
        { id: 'n2', text: 'Paper B', metadata: { year: 2021, citationCount: 50 } },
        { id: 'n3', text: 'Paper C', metadata: { year: 2022, citationCount: 30 } },
      ],
      edges: [
        { fromId: 'n1', toId: 'n2', weight: 0.8 },
        { fromId: 'n2', toId: 'n3', weight: 0.5 },
      ],
    });
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.nodes[0].text).toBe('Paper A');
    expect(result.nodes[0].metadata).toEqual({ year: 2020, citationCount: 100 });
    expect(result.edges[0].weight).toBe(0.8);
    expect(result.edges[0].from.nodeId).toBe(result.nodes[0].id);
    expect(result.edges[0].to.nodeId).toBe(result.nodes[1].id);
  });

  it('should assign default ellipse type', () => {
    const result = batchCreateGraph({
      nodes: [{ id: 'n1', text: 'A' }, { id: 'n2', text: 'B' }],
      edges: [],
    });
    expect(result.nodes[0].type).toBe('ellipse');
    expect(typeof result.nodes[0].x).toBe('number');
  });

  it('should map user IDs to generated node IDs in edges', () => {
    const result = batchCreateGraph({
      nodes: [{ id: 'user-1', text: 'A' }, { id: 'user-2', text: 'B' }],
      edges: [{ fromId: 'user-1', toId: 'user-2', weight: 0.5 }],
    });
    const idSet = new Set(result.nodes.map(n => n.id));
    expect(idSet.has(result.edges[0].from.nodeId!)).toBe(true);
    expect(idSet.has(result.edges[0].to.nodeId!)).toBe(true);
  });

  it('should skip edges referencing unknown node IDs', () => {
    const result = batchCreateGraph({
      nodes: [{ id: 'n1', text: 'A' }],
      edges: [{ fromId: 'n1', toId: 'unknown', weight: 0.5 }],
    });
    expect(result.edges).toHaveLength(0);
  });

  it('should create a complete GraphDocument', () => {
    const result = batchCreateGraph({
      nodes: [{ id: 'n1', text: 'A' }],
      edges: [],
      name: 'Test Graph',
    });
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Test Graph');
    expect(result.viewport.scale).toBe(1);
  });
});
