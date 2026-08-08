import { computeFileHotspot } from '../computeFileHotspot';

describe('computeFileHotspot', () => {
  test('empty input → empty output', () => {
    expect(computeFileHotspot([])).toEqual([]);
  });

  test('single file single commit', () => {
    const result = computeFileHotspot([{ filePath: 'a.ts', churn: 1 }]);
    expect(result).toEqual([{ filePath: 'a.ts', churn: 1 }]);
  });

  test('multiple rows for same file are summed', () => {
    const result = computeFileHotspot([
      { filePath: 'a.ts', churn: 1 },
      { filePath: 'a.ts', churn: 2 },
    ]);
    expect(result).toEqual([{ filePath: 'a.ts', churn: 3 }]);
  });

  test('multiple files sorted by churn DESC', () => {
    const result = computeFileHotspot([
      { filePath: 'low.ts', churn: 1 },
      { filePath: 'high.ts', churn: 5 },
      { filePath: 'mid.ts', churn: 3 },
    ]);
    expect(result.map((r) => r.filePath)).toEqual(['high.ts', 'mid.ts', 'low.ts']);
  });
});
