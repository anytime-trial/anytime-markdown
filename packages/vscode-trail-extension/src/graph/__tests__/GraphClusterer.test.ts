import Graph from 'graphology';
import { GraphClusterer } from '../GraphClusterer';

function makeGraph(nodes: string[], edges: [string, string][]): Graph {
  const g = new Graph();
  nodes.forEach((n) =>
    g.addNode(n, { package: 'app', repo: 'product', fileType: 'code', size: 0 }),
  );
  edges.forEach(([s, t]) => {
    if (!g.hasEdge(s, t)) g.addEdge(s, t);
  });
  return g;
}

describe('GraphClusterer', () => {
  it('assigns community to every node', () => {
    const g = makeGraph(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);
    const clusterer = new GraphClusterer();
    const result = clusterer.cluster(g);
    expect(Object.keys(result.communities)).toHaveLength(g.order);
  });

  it('generates a label for each community id', () => {
    const g = makeGraph(['A', 'B'], [['A', 'B']]);
    const clusterer = new GraphClusterer();
    const result = clusterer.cluster(g);
    const communityIds = new Set(Object.values(result.communities));
    communityIds.forEach((id) => {
      expect(result.labels[id]).toBeDefined();
    });
  });
});
