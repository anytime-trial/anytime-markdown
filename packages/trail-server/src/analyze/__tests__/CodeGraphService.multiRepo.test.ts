import { CodeGraphService } from '../CodeGraphService';
import type { CodeGraph } from '../CodeGraph.types';

function makeGraph(repoLabel: string): CodeGraph {
  return {
    generatedAt: '2026-05-16T00:00:00.000Z',
    repositories: [{ id: repoLabel, label: repoLabel, path: `/tmp/${repoLabel}` }],
    nodes: [],
    edges: [],
    communities: {},
    godNodes: [],
  };
}

function makeTrailDbStub(map: Record<string, CodeGraph>) {
  return {
    getCurrentCodeGraph: (name: string) => map[name] ?? null,
  } as unknown as ConstructorParameters<typeof CodeGraphService>[0]['trailDb'];
}

describe('CodeGraphService multi-repo cache', () => {
  it('loadFromDb(repoName) は指定 repo を取得して cache する', async () => {
    const dexterGraph = makeGraph('dexter-jp');
    const tiptapGraph = makeGraph('tiptap');
    const svc = new CodeGraphService({
      repositories: [{ id: 'dexter-jp', label: 'dexter-jp', path: '/tmp/dexter-jp' }],
      trailDb: makeTrailDbStub({ 'dexter-jp': dexterGraph, tiptap: tiptapGraph }),
    });

    const loaded = await svc.loadFromDb('tiptap');
    expect(loaded).toBe(tiptapGraph);
    expect(svc.getGraph('tiptap')).toBe(tiptapGraph);
    expect(svc.getGraph('dexter-jp')).toBeNull();
  });

  it('getGraph() 引数省略時はデフォルト repo (repositories[0]) を返す', async () => {
    const g = makeGraph('dexter-jp');
    const svc = new CodeGraphService({
      repositories: [{ id: 'dexter-jp', label: 'dexter-jp', path: '/tmp/dexter-jp' }],
      trailDb: makeTrailDbStub({ 'dexter-jp': g }),
    });
    await svc.loadFromDb();
    expect(svc.getGraph()).toBe(g);
  });

  it('invalidate(repoName) は指定 repo のみクリアする', async () => {
    const a = makeGraph('a');
    const b = makeGraph('b');
    const svc = new CodeGraphService({
      repositories: [{ id: 'a', label: 'a', path: '/tmp/a' }],
      trailDb: makeTrailDbStub({ a, b }),
    });
    await svc.loadFromDb('a');
    await svc.loadFromDb('b');
    svc.invalidate('a');
    expect(svc.getGraph('a')).toBeNull();
    expect(svc.getGraph('b')).toBe(b);
  });

  it('invalidate() 引数省略時は全クリア', async () => {
    const a = makeGraph('a');
    const b = makeGraph('b');
    const svc = new CodeGraphService({
      repositories: [{ id: 'a', label: 'a', path: '/tmp/a' }],
      trailDb: makeTrailDbStub({ a, b }),
    });
    await svc.loadFromDb('a');
    await svc.loadFromDb('b');
    svc.invalidate();
    expect(svc.getGraph('a')).toBeNull();
    expect(svc.getGraph('b')).toBeNull();
  });
});
