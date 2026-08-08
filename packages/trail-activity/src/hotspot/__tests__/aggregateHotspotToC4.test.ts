import type { C4Model, ComplexityMatrix } from '../../c4/types';
import { aggregateHotspotToC4 } from '../aggregateHotspotToC4';

function makeModel(): C4Model {
  return {
    level: 'code',
    elements: [
      { id: 'sys_app', type: 'system', name: 'App' },
      { id: 'pkg_core', type: 'container', name: 'Core', boundaryId: 'sys_app' },
      { id: 'pkg_core/comp', type: 'component', name: 'Comp', boundaryId: 'pkg_core' },
      { id: 'file::a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_core/comp' },
      { id: 'file::b.ts', type: 'code', name: 'b.ts', boundaryId: 'pkg_core/comp' },
      { id: 'file::c.ts', type: 'code', name: 'c.ts', boundaryId: 'pkg_core/comp' },
    ],
    relationships: [],
  };
}

function makeComplexity(): ComplexityMatrix {
  return {
    entries: [
      { elementId: 'file::a.ts', mostFrequent: 'low-complexity', highest: 'high-complexity', totalCount: 10 },
      { elementId: 'file::b.ts', mostFrequent: 'low-complexity', highest: 'low-complexity', totalCount: 1 },
    ],
    generatedAt: 0,
  };
}

describe('aggregateHotspotToC4', () => {
  test('1:1 mapping for code element', () => {
    const result = aggregateHotspotToC4(
      [{ filePath: 'a.ts', churn: 4 }],
      makeModel(),
      null,
    );
    const entry = result.get('file::a.ts');
    expect(entry?.churn).toBe(4);
    expect(entry?.churnNorm).toBeCloseTo(1, 5);
  });

  test('parent component rolls up to max child churn', () => {
    const result = aggregateHotspotToC4(
      [
        { filePath: 'a.ts', churn: 3 },
        { filePath: 'b.ts', churn: 5 },
        { filePath: 'c.ts', churn: 1 },
      ],
      makeModel(),
      null,
    );
    expect(result.get('pkg_core/comp')?.churn).toBe(5);
  });

  test('rolls up through 4 levels (system → container → component → code)', () => {
    const result = aggregateHotspotToC4(
      [{ filePath: 'a.ts', churn: 7 }],
      makeModel(),
      null,
    );
    expect(result.get('file::a.ts')?.churn).toBe(7);
    expect(result.get('pkg_core/comp')?.churn).toBe(7);
    expect(result.get('pkg_core')?.churn).toBe(7);
    expect(result.get('sys_app')?.churn).toBe(7);
  });

  test('orphan file_path (not in c4 model) is ignored', () => {
    const result = aggregateHotspotToC4(
      [{ filePath: 'unknown.ts', churn: 99 }],
      makeModel(),
      null,
    );
    expect(result.size).toBe(0);
  });

  test('missing complexity entry → complexity 0 / risk 0', () => {
    const result = aggregateHotspotToC4(
      [{ filePath: 'a.ts', churn: 4 }],
      makeModel(),
      null,
    );
    const entry = result.get('file::a.ts');
    expect(entry?.complexity).toBe(0);
    expect(entry?.complexityNorm).toBe(0);
    expect(entry?.risk).toBe(0);
  });

  test('risk computed from churn × complexity (normalized)', () => {
    const result = aggregateHotspotToC4(
      [
        { filePath: 'a.ts', churn: 10 },
        { filePath: 'b.ts', churn: 4 },
      ],
      makeModel(),
      makeComplexity(),
    );
    const a = result.get('file::a.ts');
    expect(a?.churnNorm).toBeCloseTo(1, 5);
    expect(a?.complexity).toBe(3);
    expect(a?.complexityNorm).toBeCloseTo(1, 5);
    expect(a?.risk).toBeCloseTo(1, 5);

    const b = result.get('file::b.ts');
    expect(b?.churnNorm).toBeCloseTo(0.4, 5);
    expect(b?.complexity).toBe(0);
    expect(b?.risk).toBe(0);
  });
});
