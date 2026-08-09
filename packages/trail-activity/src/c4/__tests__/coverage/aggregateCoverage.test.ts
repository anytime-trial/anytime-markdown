import { aggregateCoverage } from '../../coverage/aggregateCoverage';
import type { FileCoverage } from '../../coverage/parseCoverage';
import type { C4Model } from '../../types';

const model: C4Model = {
  level: 'code',
  elements: [
    { id: 'sys_app', type: 'system', name: 'App' },
    { id: 'pkg_core', type: 'container', name: 'core', boundaryId: 'sys_app' },
    { id: 'pkg_core/engine', type: 'component', name: 'engine', boundaryId: 'pkg_core' },
    {
      id: 'file::packages/core/src/engine/render.ts',
      type: 'code', name: 'render.ts', boundaryId: 'pkg_core/engine',
    },
    {
      id: 'file::packages/core/src/engine/draw.ts',
      type: 'code', name: 'draw.ts', boundaryId: 'pkg_core/engine',
    },
    { id: 'pkg_core/utils', type: 'component', name: 'utils', boundaryId: 'pkg_core' },
    {
      id: 'file::packages/core/src/utils/helper.ts',
      type: 'code', name: 'helper.ts', boundaryId: 'pkg_core/utils',
    },
  ],
  relationships: [],
};

const files: readonly FileCoverage[] = [
  {
    filePath: '/project/packages/core/src/engine/render.ts',
    lines: { covered: 80, total: 100, pct: 80 },
    branches: { covered: 10, total: 20, pct: 50 },
    functions: { covered: 5, total: 5, pct: 100 },
  },
  {
    filePath: '/project/packages/core/src/engine/draw.ts',
    lines: { covered: 20, total: 50, pct: 40 },
    branches: { covered: 5, total: 10, pct: 50 },
    functions: { covered: 2, total: 4, pct: 50 },
  },
  {
    filePath: '/project/packages/core/src/utils/helper.ts',
    lines: { covered: 50, total: 50, pct: 100 },
    branches: { covered: 8, total: 8, pct: 100 },
    functions: { covered: 3, total: 3, pct: 100 },
  },
];

describe('aggregateCoverage', () => {
  it('should map files to C4 code elements', () => {
    const result = aggregateCoverage(files, model, '/project/');
    const renderEntry = result.entries.find(
      e => e.elementId === 'file::packages/core/src/engine/render.ts',
    );
    expect(renderEntry).toBeDefined();
    expect(renderEntry!.lines.pct).toBe(80);
  });

  it('should aggregate to component level (weighted average)', () => {
    const result = aggregateCoverage(files, model, '/project/');
    const engine = result.entries.find(e => e.elementId === 'pkg_core/engine');
    expect(engine).toBeDefined();
    expect(engine!.lines.covered).toBe(100);
    expect(engine!.lines.total).toBe(150);
  });

  it('should aggregate to container level', () => {
    const result = aggregateCoverage(files, model, '/project/');
    const core = result.entries.find(e => e.elementId === 'pkg_core');
    expect(core).toBeDefined();
    expect(core!.lines.covered).toBe(150);
    expect(core!.lines.total).toBe(200);
    expect(core!.lines.pct).toBe(75);
  });

  it('should include generatedAt timestamp', () => {
    const before = Date.now();
    const result = aggregateCoverage(files, model, '/project/');
    expect(result.generatedAt).toBeGreaterThanOrEqual(before);
  });

  it('should handle files not matching any C4 element', () => {
    const unmatchedFiles: readonly FileCoverage[] = [
      {
        filePath: '/project/packages/unknown/foo.ts',
        lines: { covered: 10, total: 10, pct: 100 },
        branches: { covered: 0, total: 0, pct: 100 },
        functions: { covered: 1, total: 1, pct: 100 },
      },
    ];
    const result = aggregateCoverage(unmatchedFiles, model, '/project/');
    expect(result.entries).toHaveLength(0);
  });
});
