import { GraphQueryEngine } from '../GraphQueryEngine';
import type { CodeGraph } from '../CodeGraph.types';

function makeCodeGraph(): CodeGraph {
  return {
    generatedAt: new Date().toISOString(),
    repositories: [],
    nodes: [
      {
        id: 'src/App',
        label: 'App',
        repo: 'product',
        package: 'web-app',
        fileType: 'code',
        community: 0,
        communityLabel: 'UI',
        x: 0,
        y: 0,
        size: 0,
      },
      {
        id: 'src/hooks/useData',
        label: 'useData',
        repo: 'product',
        package: 'web-app',
        fileType: 'code',
        community: 1,
        communityLabel: 'Hooks',
        x: 1,
        y: 0,
        size: 1,
      },
      {
        id: 'src/utils/fetch',
        label: 'fetch',
        repo: 'product',
        package: 'web-app',
        fileType: 'code',
        community: 1,
        communityLabel: 'Hooks',
        x: 2,
        y: 0,
        size: 1,
      },
    ],
    edges: [
      {
        source: 'src/App',
        target: 'src/hooks/useData',
        confidence: 'EXTRACTED',
        confidence_score: 1.0,
        crossRepo: false,
      },
      {
        source: 'src/hooks/useData',
        target: 'src/utils/fetch',
        confidence: 'EXTRACTED',
        confidence_score: 1.0,
        crossRepo: false,
      },
    ],
    communities: { 0: 'UI', 1: 'Hooks' },
    godNodes: [],
  };
}

describe('GraphQueryEngine', () => {
  let engine: GraphQueryEngine;

  beforeEach(() => {
    engine = new GraphQueryEngine(makeCodeGraph());
  });

  it('query: BFS でキーワードに一致するノードを探索', () => {
    const result = engine.query('useData');
    expect(result.nodes).toContain('src/hooks/useData');
  });

  it('explain: ノードの隣接情報を返す', () => {
    const result = engine.explain('src/hooks/useData');
    expect(result).not.toBeNull();
    expect(result!.node.label).toBe('useData');
    expect(result!.incoming.length).toBe(1);
    expect(result!.outgoing.length).toBe(1);
  });

  it('path: 2ノード間の最短パスを返す', () => {
    const result = engine.path('src/App', 'src/utils/fetch');
    expect(result.found).toBe(true);
    expect(result.hops).toBe(2);
  });

  it('path: 接続のないノード間は found=false', () => {
    const result = engine.path('src/utils/fetch', 'src/App');
    expect(result.found).toBe(false);
  });
});
