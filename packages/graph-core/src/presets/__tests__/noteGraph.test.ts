import { buildNoteGraph, type NoteGraphDocInput } from '../noteGraph';
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

  it('produces a stable, valid GraphDocument shape', () => {
    const docs: NoteGraphDocInput[] = [{ path: A, title: 'Doc A' }];
    const doc = buildNoteGraph(docs);

    expect(doc.nodes[0].width).toBeGreaterThan(0);
    expect(doc.nodes[0].height).toBeGreaterThan(0);
    expect(doc.viewport).toEqual({ offsetX: 0, offsetY: 0, scale: 1 });
  });
});
