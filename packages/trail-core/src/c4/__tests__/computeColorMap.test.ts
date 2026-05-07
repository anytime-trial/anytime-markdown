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

describe('computeColorMap — edit-complexity-most', () => {
  it('high-complexityは赤', () => {
    const m = computeColorMap('edit-complexity-most', null, null, complexity);
    expect(m.get('a')).toBe('#c62828');
  });
  it('low-complexityは緑', () => {
    const m = computeColorMap('edit-complexity-most', null, null, complexity);
    expect(m.get('b')).toBe('#2e7d32');
  });
});

describe('computeColorMap — importance', () => {
  const importanceMatrix = { 'pkg_a': 80, 'pkg_b': 50, 'pkg_c': 20 };

  it('score >= 70 は赤', () => {
    const m = computeColorMap('importance', null, null, null, importanceMatrix);
    expect(m.get('pkg_a')).toBe('#c62828');
  });

  it('score 40-69 は黄', () => {
    const m = computeColorMap('importance', null, null, null, importanceMatrix);
    expect(m.get('pkg_b')).toBe('#f9a825');
  });

  it('score < 40 は緑', () => {
    const m = computeColorMap('importance', null, null, null, importanceMatrix);
    expect(m.get('pkg_c')).toBe('#2e7d32');
  });

  it('importanceMatrix が null なら空 Map', () => {
    const m = computeColorMap('importance', null, null, null, null);
    expect(m.size).toBe(0);
  });

  it('score = 70 は赤（境界値）', () => {
    const m = computeColorMap('importance', null, null, null, { 'pkg_x': 70 });
    expect(m.get('pkg_x')).toBe('#c62828');
  });

  it('score = 69 は黄（境界値）', () => {
    const m = computeColorMap('importance', null, null, null, { 'pkg_x': 69 });
    expect(m.get('pkg_x')).toBe('#f9a825');
  });

  it('score = 40 は黄（境界値）', () => {
    const m = computeColorMap('importance', null, null, null, { 'pkg_x': 40 });
    expect(m.get('pkg_x')).toBe('#f9a825');
  });

  it('score = 39 は緑（境界値）', () => {
    const m = computeColorMap('importance', null, null, null, { 'pkg_x': 39 });
    expect(m.get('pkg_x')).toBe('#2e7d32');
  });
});

describe('computeColorMap — edit-complexity-highest', () => {
  it('highest=multi-file-editは黄', () => {
    const m = computeColorMap('edit-complexity-highest', null, null, complexity);
    expect(m.get('b')).toBe('#f9a825');
  });
});

describe('computeColorMap — none', () => {
  it('空Mapを返す', () => {
    const m = computeColorMap('none', coverage, dsm, complexity);
    expect(m.size).toBe(0);
  });
});

describe('computeColorMap — hotspot', () => {
  const hotspotMap = new Map([
    ['pkg_x', { elementId: 'pkg_x', churn: 8, churnNorm: 1, complexity: 3, complexityNorm: 1, risk: 1 }],
    ['pkg_y', { elementId: 'pkg_y', churn: 0, churnNorm: 0, complexity: 0, complexityNorm: 0, risk: 0 }],
  ]);

  it('hotspot-frequency は amber 系色を返す', () => {
    const m = computeColorMap('hotspot-frequency', null, null, null, null, null, hotspotMap);
    expect(m.get('pkg_x')).toMatch(/^rgba\(232, 160, 18, /);
    expect(m.get('pkg_y')).toMatch(/^rgba\(232, 160, 18, /);
    expect(m.get('pkg_x')).not.toEqual(m.get('pkg_y'));
  });

  it('hotspot-risk は赤橙系色を返す', () => {
    const m = computeColorMap('hotspot-risk', null, null, null, null, null, hotspotMap);
    expect(m.get('pkg_x')).toMatch(/^rgba\(232, 80, 28, /);
  });

  it('hotspotMap 未指定時は空 Map', () => {
    const m = computeColorMap('hotspot-frequency', null, null, null);
    expect(m.size).toBe(0);
  });
});

describe('computeColorMap — dsm-in', () => {
  it('入力数に応じた色を返す', () => {
    const m = computeColorMap('dsm-in', null, dsm, null);
    // a: inbound from b (b→a), so 1 incoming
    // b: inbound from a (a→b), so 1 incoming
    // c: inbound from a (a→c), so 1 incoming
    expect(m.size).toBe(3);
    expect(m.get('a')).toBeDefined();
  });

  it('dsmMatrix 未指定時は空 Map', () => {
    const m = computeColorMap('dsm-in', null, null, null);
    expect(m.size).toBe(0);
  });
});

describe('computeColorMap — defect-risk', () => {
  const defectRiskMap = new Map<string, number>([
    ['pkg_high', 0.8],    // >= 0.7 → red #c62828
    ['pkg_medium', 0.5],  // >= 0.35 → amber #f9a825
    ['pkg_low', 0.1],     // < 0.35 → green #2e7d32
  ]);

  it('スコア0.7以上は赤', () => {
    const m = computeColorMap('defect-risk', null, null, null, null, defectRiskMap);
    expect(m.get('pkg_high')).toBe('#c62828');
  });

  it('スコア0.35以上は amber', () => {
    const m = computeColorMap('defect-risk', null, null, null, null, defectRiskMap);
    expect(m.get('pkg_medium')).toBe('#f9a825');
  });

  it('スコア0.35未満は緑', () => {
    const m = computeColorMap('defect-risk', null, null, null, null, defectRiskMap);
    expect(m.get('pkg_low')).toBe('#2e7d32');
  });

  it('defectRiskMap 未指定時は空 Map', () => {
    const m = computeColorMap('defect-risk', null, null, null);
    expect(m.size).toBe(0);
  });
});

describe('computeColorMap — unknown overlay fallback', () => {
  it('未知のオーバーレイタイプは空 Map を返す', () => {
    const m = computeColorMap('unknown-overlay' as never, null, null, null);
    expect(m.size).toBe(0);
  });
});

describe('computeColorMap — dead-code-score', () => {
  const matrix = { 'pkg_a': 80, 'pkg_b': 50, 'pkg_c': 20, 'pkg_d': 0 };

  it('70+ なら赤系、40-69 なら黄系、未満は緑系', () => {
    const m = computeColorMap('dead-code-score', null, null, null, null, null, null, matrix);
    expect(m.get('pkg_a')).toMatch(/^#f44336/i);
    expect(m.get('pkg_b')).toMatch(/^#ffc107/i);
    expect(m.get('pkg_c')).toMatch(/^#4caf50/i);
    expect(m.get('pkg_d')).toMatch(/^#4caf50/i);
  });

  it('matrix が null なら空 Map', () => {
    const m = computeColorMap('dead-code-score', null, null, null, null, null, null, null);
    expect(m.size).toBe(0);
  });
});

describe('computeColorMap — size-loc', () => {
  // 色判定は locMax (単一ファイル最大行数) を見るため、loc (合計) とは別の値で検証する
  const sizeMatrix = {
    big:    { loc: 99999, locMax: 1500, files: 0, functions: 0 },
    mid:    { loc: 99999, locMax:  600, files: 0, functions: 0 },
    small:  { loc: 99999, locMax:  100, files: 0, functions: 0 },
  };
  it('locMax 1000+ 赤、500-999 黄、未満は緑 (loc は色判定に使われない)', () => {
    const m = computeColorMap('size-loc', null, null, null, null, null, null, null, sizeMatrix);
    expect(m.get('big')).toBe('#c62828');
    expect(m.get('mid')).toBe('#f9a825');
    expect(m.get('small')).toBe('#2e7d32');
  });
  it('matrix が null なら空 Map', () => {
    const m = computeColorMap('size-loc', null, null, null, null, null, null, null, null);
    expect(m.size).toBe(0);
  });
});

describe('computeColorMap — size-files', () => {
  const sizeMatrix = {
    big:   { loc: 0, locMax: 0, files: 60, functions: 0 },
    mid:   { loc: 0, locMax: 0, files: 30, functions: 0 },
    small: { loc: 0, locMax: 0, files:  5, functions: 0 },
  };
  it('50+ 赤、20-49 黄、未満は緑', () => {
    const m = computeColorMap('size-files', null, null, null, null, null, null, null, sizeMatrix);
    expect(m.get('big')).toBe('#c62828');
    expect(m.get('mid')).toBe('#f9a825');
    expect(m.get('small')).toBe('#2e7d32');
  });
});

describe('computeColorMap — size-functions', () => {
  const sizeMatrix = {
    big:   { loc: 0, locMax: 0, files: 0, functions: 60 },
    mid:   { loc: 0, locMax: 0, files: 0, functions: 25 },
    small: { loc: 0, locMax: 0, files: 0, functions:  5 },
  };
  it('50+ 赤、10-49 黄、未満は緑', () => {
    const m = computeColorMap('size-functions', null, null, null, null, null, null, null, sizeMatrix);
    expect(m.get('big')).toBe('#c62828');
    expect(m.get('mid')).toBe('#f9a825');
    expect(m.get('small')).toBe('#2e7d32');
  });
});
