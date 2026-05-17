import {
  cosineSimilarity,
  extractHeadings,
  extractIdentifiers,
  jaccardSimilarity,
  scoreHeuristic,
  tokenize,
} from '../src/heuristic';

describe('tokenize', () => {
  it('removes English stopwords and 1-char tokens', () => {
    expect(tokenize('the a quick brown fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('lowercases English tokens', () => {
    expect(tokenize('TypeScript JavaScript')).toEqual(['typescript', 'javascript']);
  });

  it('emits Japanese character bigrams (stopword bigrams removed)', () => {
    // 'これは本です' → bigram: これ(SW), れは, は本, 本で, です(SW)
    // 'これ' と 'です' は stopword なので除去される
    const tokens = tokenize('これは本です');
    expect(tokens).toEqual(['れは', 'は本', '本で']);
  });

  it('removes Japanese particle stopwords when standalone', () => {
    const tokens = tokenize('の は が を に で と も から まで');
    expect(tokens).toEqual([]);
  });

  it('handles mixed Japanese and English', () => {
    // 'TypeScript の関数を実装する' → English: typescript / Japanese bigrams: の関, 関数, 数を, ...
    const tokens = tokenize('TypeScript の関数を実装する');
    expect(tokens).toContain('typescript');
    expect(tokens).toContain('関数');
  });
});

describe('extractIdentifiers', () => {
  it('extracts CamelCase', () => {
    const ids = extractIdentifiers('class MemoryPanel extends ReviewPanel');
    expect(ids.has('memorypanel')).toBe(true);
    expect(ids.has('reviewpanel')).toBe(true);
  });

  it('extracts snake_case', () => {
    const ids = extractIdentifiers('my_function calls other_thing');
    expect(ids.has('my_function')).toBe(true);
    expect(ids.has('other_thing')).toBe(true);
  });

  it('extracts kebab-case', () => {
    const ids = extractIdentifiers('use the foo-bar component');
    expect(ids.has('foo-bar')).toBe(true);
  });

  it('extracts path-like identifiers', () => {
    const ids = extractIdentifiers('see packages/trail-viewer/src/foo.ts for details');
    expect(ids.has('packages/trail-viewer/src/foo.ts')).toBe(true);
  });
});

describe('extractHeadings', () => {
  it('extracts all heading levels', () => {
    const text = '# Title\n## Section\n### Subsection';
    const headings = extractHeadings(text);
    expect(headings.has('title')).toBe(true);
    expect(headings.has('section')).toBe(true);
    expect(headings.has('subsection')).toBe(true);
  });

  it('normalizes trailing half-width and full-width colons', () => {
    const text = '## 概要:\n## 詳細：';
    const headings = extractHeadings(text);
    expect(headings.has('概要')).toBe(true);
    expect(headings.has('詳細')).toBe(true);
  });

  it('ignores inline # within text', () => {
    const text = 'inline # is not heading\n## Real Heading';
    const headings = extractHeadings(text);
    expect(headings.size).toBe(1);
    expect(headings.has('real heading')).toBe(true);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical frequency maps', () => {
    const a = new Map([
      ['x', 1],
      ['y', 2],
    ]);
    const b = new Map([
      ['x', 1],
      ['y', 2],
    ]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it('returns 0.0 for disjoint maps', () => {
    const a = new Map([['x', 1]]);
    const b = new Map([['y', 1]]);
    expect(cosineSimilarity(a, b)).toBe(0.0);
  });

  it('returns 0.0 when either map is empty', () => {
    expect(cosineSimilarity(new Map(), new Map([['x', 1]]))).toBe(0.0);
    expect(cosineSimilarity(new Map([['x', 1]]), new Map())).toBe(0.0);
    expect(cosineSimilarity(new Map(), new Map())).toBe(0.0);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1.0);
  });

  it('returns 0.0 for disjoint sets', () => {
    expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0.0);
  });

  it('returns 1.0 when both sets are empty', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1.0);
  });

  it('returns 0.0 when one side is empty and other is not', () => {
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0.0);
  });

  it('computes partial overlap correctly', () => {
    // intersection={a}, union={a,b,c} -> 1/3
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'c']))).toBeCloseTo(0.3333, 3);
  });
});

describe('scoreHeuristic', () => {
  it('returns ~1.0 across all axes for identical content', () => {
    const md = '# Title\n\nfoo bar baz with MemoryPanel and packages/foo.ts';
    const s = scoreHeuristic(md, md);
    expect(s.intent).toBeCloseTo(1.0);
    expect(s.design).toBeCloseTo(1.0);
    expect(s.completeness).toBeCloseTo(1.0);
  });

  it('returns low scores for fully disjoint content', () => {
    // 共通語ゼロ・共通識別子ゼロ・共通見出しゼロ
    // 識別子を入れるのは「両側が識別子ゼロだと Jaccard(空,空)=1.0 で
    // design スコアが上がる」仕様を踏むのを避けるため
    const a = '# Login\n\nUserAuth handles credentials via JwtToken';
    const b = '# Dashboard\n\nMetricsPanel displays charts from BigQuery';
    const s = scoreHeuristic(a, b);
    expect(s.intent).toBe(0.0);
    expect(s.design).toBe(0.0);
    expect(s.completeness).toBe(0.0);
  });

  it('returns completeness 1.0 if all reference headings present in candidate', () => {
    const ref = '## A\n## B';
    const cand = '## A\n## B\n## C'; // candidate has extra, still 1.0
    const s = scoreHeuristic(ref, cand);
    expect(s.completeness).toBe(1.0);
  });

  it('returns completeness 0.5 when half of reference headings missing', () => {
    const ref = '## A\n## B';
    const cand = '## A\n## Z';
    const s = scoreHeuristic(ref, cand);
    expect(s.completeness).toBe(0.5);
  });
});
