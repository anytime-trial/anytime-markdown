import {
  aggregateEdges,
  shapeSearchResponse,
  COMPACT_EDGES_MAX,
  COMPACT_SUMMARY_MAX_CHARS,
  COMPACT_EPISODE_EXCERPT_MAX_CHARS,
} from '../../src/retrieve/shapeSearchResponse';
import type { SearchEdge } from '../../src/retrieve/searchCaravanBook';
import type { HybridSearchResult } from '../../src/rag/hybridSearchCaravanBook';

function makeEdge(overrides: Partial<SearchEdge>): SearchEdge {
  return {
    id: 'e1',
    subject_id: 's1',
    subject_name: 'Claude Code',
    predicate: 'works_on',
    object_id: 'o1',
    object_name: '事実抽出',
    object_literal: null,
    source_type: 'conversation',
    valid_from: '2026-08-01T00:00:00.000Z',
    source_ref: 'x',
    confidence_label: 'EXTRACTED',
    ...overrides,
  };
}

function makeResult(overrides: Partial<HybridSearchResult>): HybridSearchResult {
  return {
    entities: [],
    edges: [],
    episodes: [],
    matched: true,
    ...overrides,
  };
}

describe('aggregateEdges', () => {
  test('duplicate (s,p,o) edges collapse into one row with count and latest valid_from', () => {
    const edges = [
      makeEdge({ id: 'e1', valid_from: '2026-08-01T00:00:00.000Z' }),
      makeEdge({ id: 'e2', valid_from: '2026-08-03T00:00:00.000Z' }),
      makeEdge({ id: 'e3', valid_from: '2026-08-02T00:00:00.000Z' }),
      makeEdge({ id: 'e4', predicate: 'uses', valid_from: '2026-08-04T00:00:00.000Z' }),
    ];
    const aggregated = aggregateEdges(edges);
    expect(aggregated).toHaveLength(2);
    expect(aggregated[0]).toEqual({
      subject_name: 'Claude Code',
      predicate: 'works_on',
      object_name: '事実抽出',
      count: 3,
      last_valid_from: '2026-08-03T00:00:00.000Z',
    });
    expect(aggregated[1].predicate).toBe('uses');
  });

  test('null names fall back to ids / literals', () => {
    const aggregated = aggregateEdges([
      makeEdge({ subject_name: null, object_name: null, object_id: null, object_literal: 'literal-val' }),
    ]);
    expect(aggregated[0].subject_name).toBe('s1');
    expect(aggregated[0].object_name).toBe('literal-val');
  });
});

describe('shapeSearchResponse', () => {
  test('compact truncates summaries/excerpts, aggregates edges and caps them', () => {
    const manyEdges = Array.from({ length: 80 }, (_, i) =>
      makeEdge({ id: `e${i}`, predicate: `p${i}`, valid_from: '2026-08-01T00:00:00.000Z' }),
    );
    const result = makeResult({
      entities: [
        {
          id: 'a', type: 'File', display_name: 'x.ts',
          summary: 'あ'.repeat(200), score: 0.016,
          sources: ['bm25'], raw_scores: { bm25_rank: 0 },
        },
      ],
      edges: manyEdges,
      episodes: [
        { id: 'ep1', session_id: 's', valid_from: 't', raw_excerpt: 'い'.repeat(500) },
        { id: 'ep2', session_id: 's', valid_from: 't', raw_excerpt: 'short excerpt text' },
        { id: 'ep3', session_id: 's', valid_from: 't', raw_excerpt: 'u' },
        { id: 'ep4', session_id: 's', valid_from: 't', raw_excerpt: 'dropped by cap' },
      ],
    });

    const shaped = shapeSearchResponse(result, 'compact');
    expect(shaped.detail).toBe('compact');
    expect(shaped.entities[0].summary.length).toBe(COMPACT_SUMMARY_MAX_CHARS + 1); // 80 + '…'
    expect(shaped.entities[0].raw_scores).toEqual({ bm25_rank: 0 });
    expect(shaped.edges.length).toBeLessThanOrEqual(COMPACT_EDGES_MAX);
    expect(shaped.episodes).toHaveLength(3);
    expect(shaped.episodes[0].raw_excerpt.length).toBe(COMPACT_EPISODE_EXCERPT_MAX_CHARS + 1);
  });

  test('normal passes entities and edges through unaggregated', () => {
    const result = makeResult({
      entities: [
        { id: 'a', type: 'File', display_name: 'x.ts', summary: 'あ'.repeat(200), score: 0.5, sources: [] },
      ],
      edges: [makeEdge({}), makeEdge({ id: 'e2' })],
    });
    const shaped = shapeSearchResponse(result, 'normal');
    expect(shaped.entities[0].summary.length).toBe(200);
    expect(shaped.edges).toHaveLength(2);
    expect((shaped.edges[0] as SearchEdge).id).toBe('e1');
  });

  test('full attaches aliases when provided', () => {
    const result = makeResult({
      entities: [{ id: 'a', type: 'File', display_name: 'x.ts', summary: '', score: 0.5, sources: [] }],
    });
    const shaped = shapeSearchResponse(result, 'full', new Map([['a', ['alias1', 'alias2']]]));
    expect(shaped.entities[0].aliases).toEqual(['alias1', 'alias2']);
  });

  test('abstain result keeps no_confident_match flag', () => {
    const shaped = shapeSearchResponse(
      makeResult({ matched: false, no_confident_match: true }),
      'compact',
    );
    expect(shaped.matched).toBe(false);
    expect(shaped.no_confident_match).toBe(true);
    expect(shaped.entities).toHaveLength(0);
  });
});
