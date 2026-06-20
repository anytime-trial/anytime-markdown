import { buildNoteGraph, buildNoteNeighborhood, type NoteGraphDocInput } from '../../presets/noteGraph';
import type { GraphEdge } from '../../types';

/** related エッジ（from→to の nodeId ペア）を抽出するヘルパー。 */
function endpointPair(edge: GraphEdge): [string | undefined, string | undefined] {
  return [edge.from.nodeId, edge.to.nodeId];
}

function hasEdge(edges: GraphEdge[], from: string, to: string): boolean {
  return edges.some((e) => {
    const [f, t] = endpointPair(e);
    return f === from && t === to;
  });
}

function findEdge(edges: GraphEdge[], from: string, to: string): GraphEdge | undefined {
  return edges.find((e) => e.from.nodeId === from && e.to.nodeId === to);
}

function hasUndirectedEdge(edges: GraphEdge[], a: string, b: string): boolean {
  return edges.some((e) => {
    const [f, t] = endpointPair(e);
    return (f === a && t === b) || (f === b && t === a);
  });
}

const A = 'spec/a/a.ja.md';
const B = 'spec/b/b.ja.md';
const C = 'tech/c/c.ja.md';

describe('buildNoteGraph', () => {
  it('creates one node per document with path as id and title as text', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A' },
      { path: B, title: 'Doc B' },
    ];
    const doc = buildNoteGraph(docs);

    expect(doc.nodes).toHaveLength(2);
    const a = doc.nodes.find((n) => n.id === A);
    expect(a).toBeDefined();
    expect(a?.text).toBe('Doc A');
    // クリックでファイルを開けるよう path を保持する
    expect(a?.url).toBe(A);
  });

  it('creates a directed related edge for resolved references', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', related: [B] },
      { path: B, title: 'Doc B' },
    ];
    const doc = buildNoteGraph(docs);

    expect(hasEdge(doc.edges, A, B)).toBe(true);
  });

  it('materializes a placeholder node for unresolved related references', () => {
    const missing = 'spec/missing/missing.ja.md';
    const docs: NoteGraphDocInput[] = [{ path: A, title: 'Doc A', related: [missing] }];
    const doc = buildNoteGraph(docs);

    const placeholder = doc.nodes.find((n) => n.id === missing);
    expect(placeholder).toBeDefined();
    expect(placeholder?.metadata?.placeholder).toBe(1);
    expect(hasEdge(doc.edges, A, missing)).toBe(true);
  });

  it('does not duplicate a placeholder when multiple docs reference the same missing target', () => {
    const missing = 'spec/missing/missing.ja.md';
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', related: [missing] },
      { path: B, title: 'Doc B', related: [missing] },
    ];
    const doc = buildNoteGraph(docs);

    expect(doc.nodes.filter((n) => n.id === missing)).toHaveLength(1);
  });

  it('omits tag cluster edges by default', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', tags: ['graph'] },
      { path: B, title: 'Doc B', tags: ['graph'] },
    ];
    const doc = buildNoteGraph(docs);

    expect(hasUndirectedEdge(doc.edges, A, B)).toBe(false);
  });

  it('adds tag cluster edges when the tags layer is enabled', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', tags: ['graph'] },
      { path: B, title: 'Doc B', tags: ['graph'] },
      { path: C, title: 'Doc C', tags: ['other'] },
    ];
    const doc = buildNoteGraph(docs, { edges: { tags: true } });

    expect(hasUndirectedEdge(doc.edges, A, B)).toBe(true);
    expect(hasUndirectedEdge(doc.edges, A, C)).toBe(false);
  });

  it('adds c4Scope anchor edges when the c4Scope layer is enabled', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', c4Scope: ['pkg_graph-core'] },
      { path: B, title: 'Doc B', c4Scope: ['pkg_graph-core'] },
    ];
    const doc = buildNoteGraph(docs, { edges: { c4Scope: true } });

    expect(hasUndirectedEdge(doc.edges, A, B)).toBe(true);
  });

  it('groups documents by category', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', category: 'design' },
      { path: B, title: 'Doc B', category: 'design' },
      { path: C, title: 'Doc C', category: 'infra' },
    ];
    const doc = buildNoteGraph(docs);

    const design = doc.groups?.find((g) => g.label === 'design');
    expect(design).toBeDefined();
    expect(design?.memberIds.sort()).toEqual([A, B].sort());
  });

  it('deduplicates repeated related references (no duplicate edge ids)', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', related: [B, B] },
      { path: B, title: 'Doc B' },
    ];
    const doc = buildNoteGraph(docs);

    const ab = doc.edges.filter((e) => e.from.nodeId === A && e.to.nodeId === B);
    expect(ab).toHaveLength(1);
    const ids = doc.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ignores self-references', () => {
    const docs: NoteGraphDocInput[] = [{ path: A, title: 'Doc A', related: [A] }];
    const doc = buildNoteGraph(docs);
    expect(doc.edges.some((e) => e.from.nodeId === A && e.to.nodeId === A)).toBe(false);
  });

  it('produces a stable, valid GraphDocument shape', () => {
    const docs: NoteGraphDocInput[] = [{ path: A, title: 'Doc A' }];
    const doc = buildNoteGraph(docs);

    expect(doc.nodes[0].width).toBeGreaterThan(0);
    expect(doc.nodes[0].height).toBeGreaterThan(0);
    expect(doc.viewport).toEqual({ offsetX: 0, offsetY: 0, scale: 1 });
  });
});

describe('buildNoteNeighborhood', () => {
  const nodeIds = (doc: ReturnType<typeof buildNoteNeighborhood>): string[] => doc.nodes.map((n) => n.id).sort();
  const center = (doc: ReturnType<typeof buildNoteNeighborhood>) =>
    doc.nodes.find((n) => n.metadata?.center === 1);

  it('marks the center node and places it at the origin', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', related: [B] },
      { path: B, title: 'Doc B' },
    ];
    const doc = buildNoteNeighborhood(docs, A);
    const c = center(doc);
    expect(c).toBeDefined();
    expect(c!.x + c!.width / 2).toBe(0);
    expect(c!.y + c!.height / 2).toBe(0);
    expect(c!.id).toBe(A);
  });

  it('includes outgoing links (related + body) of the center', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A', related: [B], bodyLinks: [C] },
      { path: B, title: 'Doc B' },
      { path: C, title: 'Doc C' },
    ];
    const doc = buildNoteNeighborhood(docs, A);
    expect(nodeIds(doc)).toEqual([A, B, C].sort());
    expect(hasEdge(doc.edges, A, B)).toBe(true);
    expect(hasEdge(doc.edges, A, C)).toBe(true);
  });

  it('includes backlinks (incoming) to the center', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'Doc A' },
      { path: B, title: 'Doc B', related: [A] },
      { path: C, title: 'Doc C', bodyLinks: [A] },
    ];
    const doc = buildNoteNeighborhood(docs, A);
    expect(nodeIds(doc)).toEqual([A, B, C].sort());
    expect(hasEdge(doc.edges, B, A)).toBe(true);
    expect(hasEdge(doc.edges, C, A)).toBe(true);
  });

  it('limits to the requested hop count', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'A', related: [B] },
      { path: B, title: 'B', related: [C] },
      { path: C, title: 'C' },
    ];
    const oneHop = buildNoteNeighborhood(docs, A, { hops: 1 });
    expect(nodeIds(oneHop)).toEqual([A, B].sort());
    const twoHop = buildNoteNeighborhood(docs, A, { hops: 2 });
    expect(nodeIds(twoHop)).toEqual([A, B, C].sort());
  });

  it('excludes body links when includeBodyLinks is false', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'A', related: [B], bodyLinks: [C] },
      { path: B, title: 'B' },
      { path: C, title: 'C' },
    ];
    const doc = buildNoteNeighborhood(docs, A, { includeBodyLinks: false });
    expect(nodeIds(doc)).toEqual([A, B].sort());
  });

  it('renders an unresolved link target as a placeholder node', () => {
    const docs: NoteGraphDocInput[] = [{ path: A, title: 'A', related: ['spec/missing.md'] }];
    const doc = buildNoteNeighborhood(docs, A);
    const ph = doc.nodes.find((n) => n.id === 'spec/missing.md');
    expect(ph?.metadata?.placeholder).toBe(1);
  });

  it('synthesizes a center node even if the current doc is not a scanned node', () => {
    const docs: NoteGraphDocInput[] = [{ path: B, title: 'B', related: [A] }];
    const doc = buildNoteNeighborhood(docs, A);
    // A はノード化されていないが、中心として合成し B からのバックリンクを示す
    expect(center(doc)?.id).toBe(A);
    expect(hasEdge(doc.edges, B, A)).toBe(true);
  });

  it('styles a typed related edge by its relation type', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'A', related: [{ to: B, type: 'depends-on' }] },
      { path: B, title: 'B' },
    ];
    const doc = buildNoteNeighborhood(docs, A);
    const edge = findEdge(doc.edges, A, B);
    expect(edge?.style.dashed).toBe(false);
    expect(edge?.label).toBe('depends-on');
  });
});

describe('buildNoteGraph typed related', () => {
  it('accepts object related entries and renders a typed edge with label', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'A', related: [{ to: B, type: 'depends-on' }] },
      { path: B, title: 'B' },
    ];
    const doc = buildNoteGraph(docs);
    const edge = findEdge(doc.edges, A, B);
    expect(edge).toBeDefined();
    expect(edge?.label).toBe('depends-on');
    expect(edge?.style.dashed).toBe(false);
  });

  it('treats a bare string entry as references (backward compatible)', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'A', related: [B] },
      { path: B, title: 'B' },
    ];
    const doc = buildNoteGraph(docs);
    const edge = findEdge(doc.edges, A, B);
    // references = 弱い参照（細・破線・ラベルなし）
    expect(edge?.style.dashed).toBe(true);
    expect(edge?.label).toBeUndefined();
  });

  it('falls back to references for an unknown type (no silent ignore)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const docs: NoteGraphDocInput[] = [
        // 未知型は実行時に references へフォールバックする（NoteRelatedEntry.type は string）
        { path: A, title: 'A', related: [{ to: B, type: 'mentions' }] },
        { path: B, title: 'B' },
      ];
      const doc = buildNoteGraph(docs);
      const edge = findEdge(doc.edges, A, B);
      expect(edge?.style.dashed).toBe(true);
      expect(edge?.label).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('renders distinct typed edges between the same pair', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'A', related: [{ to: B, type: 'depends-on' }, { to: B, type: 'implements' }] },
      { path: B, title: 'B' },
    ];
    const doc = buildNoteGraph(docs);
    const ab = doc.edges.filter((e) => e.from.nodeId === A && e.to.nodeId === B);
    expect(ab).toHaveLength(2);
    const ids = doc.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('deduplicates identical typed entries', () => {
    const docs: NoteGraphDocInput[] = [
      { path: A, title: 'A', related: [{ to: B, type: 'depends-on' }, { to: B, type: 'depends-on' }] },
      { path: B, title: 'B' },
    ];
    const doc = buildNoteGraph(docs);
    const ab = doc.edges.filter((e) => e.from.nodeId === A && e.to.nodeId === B);
    expect(ab).toHaveLength(1);
  });
});
