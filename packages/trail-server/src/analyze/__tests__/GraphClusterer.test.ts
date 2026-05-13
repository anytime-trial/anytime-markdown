import Graph from 'graphology';
import { GraphClusterer, buildCommunityLabels } from '../GraphClusterer';
import type { C4Element } from '@anytime-markdown/trail-core/c4';

interface NodeDef {
  readonly id: string;
  readonly package?: string;
}

function makeGraph(nodes: readonly (NodeDef | string)[], edges: readonly [string, string][]): Graph {
  const g = new Graph();
  nodes.forEach((n) => {
    const def: NodeDef = typeof n === 'string' ? { id: n } : n;
    g.addNode(def.id, {
      package: def.package ?? 'app',
      repo: 'product',
      fileType: 'code',
      size: 0,
    });
  });
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

  it('falls back to package majority when c4 elements are not supplied', () => {
    const g = makeGraph(
      [
        { id: '0:packages/web-app/src/foo/A', package: 'web-app' },
        { id: '0:packages/web-app/src/foo/B', package: 'web-app' },
      ],
      [['0:packages/web-app/src/foo/A', '0:packages/web-app/src/foo/B']],
    );
    const result = new GraphClusterer().cluster(g);
    expect(Object.values(result.labels)).toContain('web-app');
  });
});

describe('buildCommunityLabels', () => {
  function nodeAttrs(pkg: string) {
    return { package: pkg, repo: 'product', fileType: 'code', size: 0 } as const;
  }

  it('uses C4 component name when component element matches', () => {
    const g = new Graph();
    g.addNode('0:packages/web-app/src/components/A', nodeAttrs('web-app'));
    g.addNode('0:packages/web-app/src/components/B', nodeAttrs('web-app'));
    const communities = {
      '0:packages/web-app/src/components/A': 0,
      '0:packages/web-app/src/components/B': 0,
    };
    const elements: readonly C4Element[] = [
      { id: 'pkg_web-app', type: 'container', name: 'web-app' },
      {
        id: 'pkg_web-app/components',
        type: 'component',
        name: 'components',
        boundaryId: 'pkg_web-app',
      },
    ];
    const labels = buildCommunityLabels(g, communities, elements);
    expect(labels[0]).toBe('components');
  });

  it('falls back to container name when no component element matches', () => {
    const g = new Graph();
    g.addNode('0:packages/web-app/A', nodeAttrs('web-app'));
    g.addNode('0:packages/web-app/B', nodeAttrs('web-app'));
    const communities = {
      '0:packages/web-app/A': 0,
      '0:packages/web-app/B': 0,
    };
    const elements: readonly C4Element[] = [
      { id: 'pkg_web-app', type: 'container', name: 'Web App Container' },
    ];
    const labels = buildCommunityLabels(g, communities, elements);
    expect(labels[0]).toBe('Web App Container');
  });

  it('falls back to raw package when c4 has no matching element', () => {
    const g = new Graph();
    g.addNode('0:packages/web-app/src/foo/A', nodeAttrs('web-app'));
    g.addNode('0:packages/web-app/src/foo/B', nodeAttrs('web-app'));
    const communities = {
      '0:packages/web-app/src/foo/A': 0,
      '0:packages/web-app/src/foo/B': 0,
    };
    const elements: readonly C4Element[] = [
      { id: 'pkg_other', type: 'container', name: 'other' },
    ];
    const labels = buildCommunityLabels(g, communities, elements);
    expect(labels[0]).toBe('web-app');
  });

  it('breaks ties by alphabetical order of resolved name', () => {
    const g = new Graph();
    g.addNode('0:packages/p/src/beta/X', nodeAttrs('p'));
    g.addNode('0:packages/p/src/alpha/Y', nodeAttrs('p'));
    const communities = {
      '0:packages/p/src/beta/X': 0,
      '0:packages/p/src/alpha/Y': 0,
    };
    const elements: readonly C4Element[] = [
      { id: 'pkg_p', type: 'container', name: 'p' },
      { id: 'pkg_p/alpha', type: 'component', name: 'alpha', boundaryId: 'pkg_p' },
      { id: 'pkg_p/beta', type: 'component', name: 'beta', boundaryId: 'pkg_p' },
    ];
    const labels = buildCommunityLabels(g, communities, elements);
    expect(labels[0]).toBe('alpha');
  });
});
