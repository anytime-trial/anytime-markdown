import type { CoverageMatrix, ComplexityMatrix } from '../types';
import type { DsmMatrix } from '../dsm/types';
import { computeColorMap } from '../metrics/computeColorMap';

// ─── Coverage ────────────────────────────────────────────────────────────────

const coverage: CoverageMatrix = {
  generatedAt: 0,
  entries: [
    { elementId: 'a', lines: { covered: 9, total: 10, pct: 90 }, branches: { covered: 5, total: 10, pct: 50 }, functions: { covered: 2, total: 10, pct: 20 } },
    { elementId: 'b', lines: { covered: 5, total: 10, pct: 50 }, branches: { covered: 0, total: 0, pct: 0 }, functions: { covered: 6, total: 10, pct: 60 } },
  ],
};

describe('computeColorMap — coverage-lines', () => {
  it('pct>=80は緑', () => {
    const m = computeColorMap('coverage-lines', coverage, null, null);
    expect(m.get('a')).toBe('#2e7d32');
  });
  it('50<=pct<80は黄', () => {
    const m = computeColorMap('coverage-lines', coverage, null, null);
    expect(m.get('b')).toBe('#f9a825');
  });
  it('branches: total=0はデータなしグレー', () => {
    const m = computeColorMap('coverage-branches', coverage, null, null);
    expect(m.get('b')).toBe('#616161');
  });
  it('functions: pct<50は赤', () => {
    const m = computeColorMap('coverage-functions', coverage, null, null);
    expect(m.get('a')).toBe('#c62828');
  });
});

// ─── DSM ─────────────────────────────────────────────────────────────────────

const dsm: DsmMatrix = {
  nodes: [
    { id: 'a', name: 'A', path: 'a', level: 'component' },
    { id: 'b', name: 'B', path: 'b', level: 'component' },
    { id: 'c', name: 'C', path: 'c', level: 'component' },
  ],
  edges: [
    { source: 'a', target: 'b', imports: [] },
    { source: 'a', target: 'c', imports: [] },
    { source: 'b', target: 'a', imports: [] }, // a↔b で循環
  ],
  adjacency: [
    [0, 1, 1], // a → b, c  (出力2)
    [1, 0, 0], // b → a     (出力1)
    [0, 0, 0], // c → なし  (出力0)
  ],
};

describe('computeColorMap — dsm-out', () => {
  it('出力数最大(2)は最高色', () => {
    const m = computeColorMap('dsm-out', null, dsm, null);
    const colorA = m.get('a')!;
    const colorC = m.get('c')!;
    expect(colorA).not.toBe(colorC); // aの方が色が強い
  });
  it('出力0は最低色(青)', () => {
    const m = computeColorMap('dsm-out', null, dsm, null);
    expect(m.get('c')).toBe('#1565c0');
  });
});

describe('computeColorMap — dsm-cyclic', () => {
  it('循環依存あり要素は赤', () => {
    const m = computeColorMap('dsm-cyclic', null, dsm, null);
    expect(m.get('a')).toBe('#c62828');
    expect(m.get('b')).toBe('#c62828');
  });
  it('循環依存なし要素は緑', () => {
    const m = computeColorMap('dsm-cyclic', null, dsm, null);
    expect(m.get('c')).toBe('#2e7d32');
  });
});

// ─── Complexity ───────────────────────────────────────────────────────────────

const complexity: ComplexityMatrix = {
  generatedAt: 0,
  entries: [
    { elementId: 'a', mostFrequent: 'high-complexity', highest: 'high-complexity', totalCount: 3 },
    { elementId: 'b', mostFrequent: 'low-complexity', highest: 'multi-file-edit', totalCount: 5 },
  ],
};

describe('computeColorMap — complexity-most', () => {
  it('high-complexityは赤', () => {
    const m = computeColorMap('complexity-most', null, null, complexity);
    expect(m.get('a')).toBe('#c62828');
  });
  it('low-complexityは緑', () => {
    const m = computeColorMap('complexity-most', null, null, complexity);
    expect(m.get('b')).toBe('#2e7d32');
  });
});

describe('computeColorMap — complexity-highest', () => {
  it('highest=multi-file-editは黄', () => {
    const m = computeColorMap('complexity-highest', null, null, complexity);
    expect(m.get('b')).toBe('#f9a825');
  });
});

describe('computeColorMap — none', () => {
  it('空Mapを返す', () => {
    const m = computeColorMap('none', coverage, dsm, complexity);
    expect(m.size).toBe(0);
  });
});
