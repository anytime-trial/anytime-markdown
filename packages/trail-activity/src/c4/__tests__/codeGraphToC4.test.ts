import { codeGraphToC4 } from '../codeGraphToC4';
import type { StoredCodeGraph } from '../../codeGraph';

const makeNode = (id: string, pkg: string, community: number, communityLabel = `lbl-${community}`, repo = 'r1') => ({
  id,
  label: id.split(':').pop() ?? id,
  repo,
  package: pkg,
  fileType: 'code' as const,
  community,
  communityLabel,
  x: 0,
  y: 0,
  size: 1,
});

const makeEdge = (source: string, target: string) => ({
  source,
  target,
  confidence: 'EXTRACTED' as const,
  confidence_score: 1,
  crossRepo: false,
});

describe('codeGraphToC4', () => {
  it('生成した C4 model に repository ベースの system / package ベースの container / community ベースの component / file ベースの code 要素が含まれる', () => {
    const graph: StoredCodeGraph = {
      generatedAt: '2026-05-05T00:00:00Z',
      repositories: [{ id: 'r1', label: 'Repo One', path: '/tmp/r1' }],
      nodes: [
        makeNode('r1:packages/a/index.ts', 'a', 1),
        makeNode('r1:packages/a/util.ts', 'a', 1),
        makeNode('r1:packages/b/index.ts', 'b', 2),
        makeNode('r1:packages/b/util.ts', 'b', 2),
        makeNode('r1:packages/c/index.ts', 'c', 2),
      ],
      edges: [],
      godNodes: [],
    };

    const model = codeGraphToC4(graph);

    expect(model.elements.find((e) => e.id === 'sys_r1')).toMatchObject({ type: 'system', name: 'Repo One' });
    expect(model.elements.find((e) => e.id === 'pkg_a')).toMatchObject({ type: 'container', boundaryId: 'sys_r1' });
    expect(model.elements.find((e) => e.id === 'pkg_b')).toMatchObject({ type: 'container', boundaryId: 'sys_r1' });
    expect(model.elements.find((e) => e.id === 'pkg_c')).toMatchObject({ type: 'container', boundaryId: 'sys_r1' });
    expect(model.elements.find((e) => e.id === 'community_1')).toMatchObject({ type: 'component', boundaryId: 'pkg_a' });
    expect(model.elements.find((e) => e.id === 'community_2')).toMatchObject({ type: 'component' });
    // 5 file nodes -> 5 code elements
    expect(model.elements.filter((e) => e.type === 'code')).toHaveLength(5);
  });

  it('community が複数 package にまたがる場合は最頻 package を boundaryId にする', () => {
    const graph: StoredCodeGraph = {
      generatedAt: '2026-05-05T00:00:00Z',
      repositories: [{ id: 'r1', label: 'Repo One', path: '/tmp/r1' }],
      nodes: [
        makeNode('r1:b1.ts', 'b', 7),
        makeNode('r1:b2.ts', 'b', 7),
        makeNode('r1:a1.ts', 'a', 7), // community 7 で b が最頻 (2 票)
      ],
      edges: [],
      godNodes: [],
    };

    const model = codeGraphToC4(graph);
    const comp = model.elements.find((e) => e.id === 'community_7');
    expect(comp?.boundaryId).toBe('pkg_b');
  });

  it('edge を file / component / container の 3 階層に重複排除して集約する', () => {
    const graph: StoredCodeGraph = {
      generatedAt: '2026-05-05T00:00:00Z',
      repositories: [{ id: 'r1', label: 'Repo One', path: '/tmp/r1' }],
      nodes: [
        makeNode('r1:a/x.ts', 'a', 1),
        makeNode('r1:a/y.ts', 'a', 1),
        makeNode('r1:b/p.ts', 'b', 2),
        makeNode('r1:b/q.ts', 'b', 2),
      ],
      edges: [
        // 同一 file pair が重複しても 1 つに集約
        makeEdge('r1:a/x.ts', 'r1:b/p.ts'),
        makeEdge('r1:a/x.ts', 'r1:b/p.ts'),
        // a/y.ts -> b/q.ts も community/container は同じ集約に乗る
        makeEdge('r1:a/y.ts', 'r1:b/q.ts'),
        // 同 package / 同 community の edge は container/component 集約に出ない
        makeEdge('r1:a/x.ts', 'r1:a/y.ts'),
      ],
      godNodes: [],
    };

    const model = codeGraphToC4(graph);

    // file 層 (3 件: 重複 1 件削除)
    const fileEdges = model.relationships.filter(
      (r) => r.from.includes(':') && r.to.includes(':'),
    );
    expect(fileEdges).toHaveLength(3);

    // container 層 (a -> b 1 件のみ)
    const containerEdges = model.relationships.filter(
      (r) => r.from.startsWith('pkg_') && r.to.startsWith('pkg_'),
    );
    expect(containerEdges).toHaveLength(1);
    expect(containerEdges[0]).toMatchObject({ from: 'pkg_a', to: 'pkg_b' });

    // component 層 (community_1 -> community_2 1 件のみ)
    const componentEdges = model.relationships.filter(
      (r) => r.from.startsWith('community_') && r.to.startsWith('community_'),
    );
    expect(componentEdges).toHaveLength(1);
    expect(componentEdges[0]).toMatchObject({ from: 'community_1', to: 'community_2' });
  });

  it('同 community / 同 package 内の edge は集約レイヤに出ない', () => {
    const graph: StoredCodeGraph = {
      generatedAt: '2026-05-05T00:00:00Z',
      repositories: [{ id: 'r1', label: 'Repo One', path: '/tmp/r1' }],
      nodes: [
        makeNode('r1:a/x.ts', 'a', 1),
        makeNode('r1:a/y.ts', 'a', 1),
      ],
      edges: [makeEdge('r1:a/x.ts', 'r1:a/y.ts')],
      godNodes: [],
    };

    const model = codeGraphToC4(graph);
    expect(model.relationships.filter((r) => r.from.startsWith('pkg_'))).toHaveLength(0);
    expect(model.relationships.filter((r) => r.from.startsWith('community_'))).toHaveLength(0);
    // file 層は 1 件出る
    expect(model.relationships.filter((r) => r.from === 'r1:a/x.ts')).toHaveLength(1);
  });

  it('repositories 0 件の異常入力で例外を投げず空 C4 を返す', () => {
    const graph: StoredCodeGraph = {
      generatedAt: '2026-05-05T00:00:00Z',
      repositories: [],
      nodes: [],
      edges: [],
      godNodes: [],
    };

    const model = codeGraphToC4(graph);
    expect(model.elements).toEqual([]);
    expect(model.relationships).toEqual([]);
    expect(model.level).toBe('code');
  });
});
