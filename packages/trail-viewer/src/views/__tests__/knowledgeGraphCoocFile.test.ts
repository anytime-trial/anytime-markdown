import { computeSpecHash } from '@anytime-markdown/graph-core';
import { buildKnowledgeGraphCoocFile, type KnowledgeGraphResponse } from '../knowledgeGraphCoocFile';

const GENERATED_AT = '2026-08-08T05:00:00.000Z';

function makeResponse(partial: Partial<KnowledgeGraphResponse>): KnowledgeGraphResponse {
  return {
    nodes: [],
    links: [],
    clusters: [],
    totalEntityCount: 0,
    truncated: false,
    availableTypes: [],
    ...partial,
  };
}

describe('buildKnowledgeGraphCoocFile', () => {
  it('maps nodes / links / clusters into a schemaVersion 1 cooccurrence file', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [
          { label: 'TrailDataServer', type: 'Concept', frequency: 42 },
          { label: 'trail-caravan-book', type: 'Package', frequency: 17 },
          { label: 'FTS5', type: 'Concept', frequency: 5 },
        ],
        links: [
          { a: 0, b: 1, strength: 3 },
          { a: 1, b: 2, strength: 1 },
        ],
        clusters: [
          { label: 'Concept', members: [0, 2] },
          { label: 'Package', members: [1] },
        ],
        totalEntityCount: 29695,
        truncated: true,
      }),
      GENERATED_AT,
    );

    expect(file.meta).toEqual({ schemaVersion: 1, generatedAt: GENERATED_AT, origin: 'mcp' });
    expect(file.spec.nodes).toEqual([
      { label: 'TrailDataServer', frequency: 42 },
      { label: 'trail-caravan-book', frequency: 17 },
      { label: 'FTS5', frequency: 5 },
    ]);
    // 無向のため 3 要素タプル（第 4 要素の向きを持たせると schemaVersion 2 になる）
    expect(file.spec.links).toEqual([
      [0, 1, 3],
      [1, 2, 1],
    ]);
    expect(file.spec.clusters).toEqual([
      { label: 'Concept', members: [0, 2] },
      { label: 'Package', members: [1] },
    ]);
    expect(file.spec.subject).toBeUndefined();
  });

  it('disambiguates duplicate labels with the entity type, then with an ordinal', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [
          { label: 'index.ts', type: 'File', frequency: 9 },
          { label: 'index.ts', type: 'Concept', frequency: 4 },
          { label: 'index.ts', type: 'File', frequency: 2 },
        ],
      }),
      GENERATED_AT,
    );

    expect(file.spec.nodes.map((n) => n.label)).toEqual([
      'index.ts (File)',
      'index.ts (Concept)',
      'index.ts (File) #2',
    ]);
  });

  it('drops self-loops and out-of-range links instead of producing a broken figure', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [
          { label: 'a', type: 'Concept', frequency: 1 },
          { label: 'b', type: 'Concept', frequency: 1 },
        ],
        links: [
          { a: 0, b: 0, strength: 2 },
          { a: 0, b: 5, strength: 1 },
          { a: 0, b: 1, strength: 1 },
        ],
      }),
      GENERATED_AT,
    );

    expect(file.spec.links).toEqual([[0, 1, 1]]);
  });

  it('omits empty clusters so the viewer does not render vacant legend entries', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [{ label: 'a', type: 'Concept', frequency: 1 }],
        clusters: [
          { label: 'Concept', members: [0] },
          { label: 'Bug', members: [] },
        ],
      }),
      GENERATED_AT,
    );

    expect(file.spec.clusters).toEqual([{ label: 'Concept', members: [0] }]);
  });

  it('returns an empty spec for an empty response', () => {
    const file = buildKnowledgeGraphCoocFile(makeResponse({}), GENERATED_AT);

    expect(file.spec.nodes).toEqual([]);
    expect(file.spec.links).toEqual([]);
    expect(file.spec.clusters).toEqual([]);
  });

  it('attaches a server layout when every node carries coordinates', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [
          { label: 'a', type: 'Concept', frequency: 2, x: 10, y: -20 },
          { label: 'b', type: 'Concept', frequency: 1, x: 30.5, y: 40.25 },
        ],
        links: [{ a: 0, b: 1, strength: 1 }],
      }),
      GENERATED_AT,
    );

    expect(file.layout?.positions).toEqual([[10, -20], [30.5, 40.25]]);
    expect(file.layout?.source).toBe('server');
    // specHash が spec と一致していないとビューアは座標を捨てて計算し直す
    expect(file.layout?.specHash).toBe(computeSpecHash(file.spec));
  });

  it('omits the layout when any node lacks coordinates', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [
          { label: 'a', type: 'Concept', frequency: 2, x: 10, y: -20 },
          { label: 'b', type: 'Concept', frequency: 1 },
        ],
        links: [{ a: 0, b: 1, strength: 1 }],
      }),
      GENERATED_AT,
    );

    // 座標のある点と無い点が混ざると、無い点だけが原点へ固まる
    expect(file.layout).toBeUndefined();
  });

  it('subjectId で subject を実体 id から解決する（同名ラベルを取り違えない。screen spec §2.5）', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [
          { id: 'e1', label: 'index.ts', type: 'File', frequency: 9 },
          { id: 'e2', label: 'index.ts', type: 'Concept', frequency: 4 },
        ],
      }),
      GENERATED_AT,
      { subjectId: 'e2', subjectLabel: 'index.ts' },
    );
    expect(file.spec.subject).toBe(1);
  });

  it('subjectId が見つからない・id の無い旧サーバ応答では subjectLabel へ後方互換で倒す', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [
          { label: 'a', type: 'Concept', frequency: 2 },
          { label: 'b', type: 'Concept', frequency: 1 },
        ],
      }),
      GENERATED_AT,
      { subjectId: 'missing', subjectLabel: 'b' },
    );
    expect(file.spec.subject).toBe(1);
  });

  it('omits the layout when a coordinate is not finite', () => {
    const file = buildKnowledgeGraphCoocFile(
      makeResponse({
        nodes: [{ label: 'a', type: 'Concept', frequency: 2, x: Number.NaN, y: 0 }],
      }),
      GENERATED_AT,
    );

    expect(file.layout).toBeUndefined();
  });
});
