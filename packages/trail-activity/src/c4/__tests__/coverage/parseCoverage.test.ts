import { parseCoverage } from '../../coverage/parseCoverage';

const SAMPLE_COVERAGE = {
  '/project/packages/graph-core/src/engine/renderer.ts': {
    path: '/project/packages/graph-core/src/engine/renderer.ts',
    s: { '0': 1, '1': 0, '2': 3 },
    f: { '0': 1, '1': 0 },
    b: { '0': [1, 0], '1': [2, 1] },
    statementMap: {},
    fnMap: {},
    branchMap: {},
  },
  '/project/packages/graph-core/src/theme.ts': {
    path: '/project/packages/graph-core/src/theme.ts',
    s: { '0': 5, '1': 5 },
    f: { '0': 3 },
    b: {},
    statementMap: {},
    fnMap: {},
    branchMap: {},
  },
};

describe('parseCoverage', () => {
  it('should parse file-level coverage metrics', () => {
    const result = parseCoverage(SAMPLE_COVERAGE);
    expect(result).toHaveLength(2);
    const renderer = result.find(e => e.filePath.includes('renderer.ts'));
    expect(renderer).toBeDefined();
    expect(renderer!.lines.covered).toBe(2);
    expect(renderer!.lines.total).toBe(3);
    expect(renderer!.functions.covered).toBe(1);
    expect(renderer!.functions.total).toBe(2);
    expect(renderer!.branches.total).toBe(4);
    expect(renderer!.branches.covered).toBe(3);
  });

  it('should handle empty coverage data', () => {
    const result = parseCoverage({});
    expect(result).toEqual([]);
  });

  it('should calculate pct correctly', () => {
    const result = parseCoverage(SAMPLE_COVERAGE);
    const theme = result.find(e => e.filePath.includes('theme.ts'));
    expect(theme!.lines.pct).toBe(100);
    expect(theme!.functions.pct).toBe(100);
    expect(theme!.branches.pct).toBe(100);
  });
});
