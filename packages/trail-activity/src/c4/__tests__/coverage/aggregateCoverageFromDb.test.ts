import { aggregateCoverageFromDb } from '../../coverage/aggregateCoverageFromDb';
import type { ReleaseCoverageRow } from '../../../domain/model/task';
import type { C4Model } from '../../types';

const model: C4Model = {
  level: 'component',
  elements: [
    { id: 'sys_app', type: 'system', name: 'App' },
    { id: 'pkg_core', type: 'container', name: 'core', boundaryId: 'sys_app' },
    { id: 'pkg_core/engine', type: 'component', name: 'engine', boundaryId: 'pkg_core' },
    { id: 'pkg_core/utils', type: 'component', name: 'utils', boundaryId: 'pkg_core' },
    { id: 'pkg_ui', type: 'container', name: 'ui', boundaryId: 'sys_app' },
    { id: 'pkg_ui/components', type: 'component', name: 'components', boundaryId: 'pkg_ui' },
  ],
  relationships: [],
};

function makeRow(
  pkg: string,
  filePath: string,
  linesCovered: number,
  linesTotal: number,
): ReleaseCoverageRow {
  const linesPct = linesTotal === 0 ? 100 : Math.round((linesCovered / linesTotal) * 10000) / 100;
  return {
    release_tag: 'v1.0.0',
    package: pkg,
    file_path: filePath,
    lines_covered: linesCovered,
    lines_total: linesTotal,
    lines_pct: linesPct,
    statements_covered: linesCovered,
    statements_total: linesTotal,
    statements_pct: linesPct,
    functions_covered: linesCovered,
    functions_total: linesTotal,
    functions_pct: linesPct,
    branches_covered: linesCovered,
    branches_total: linesTotal,
    branches_pct: linesPct,
  };
}

describe('aggregateCoverageFromDb', () => {
  it('aggregates file rows into component-level entries', () => {
    const rows: ReleaseCoverageRow[] = [
      makeRow('core', '/repo/packages/core/src/engine/render.ts', 80, 100),
      makeRow('core', '/repo/packages/core/src/engine/draw.ts', 20, 50),
    ];
    const result = aggregateCoverageFromDb(rows, model);
    const engine = result.entries.find(e => e.elementId === 'pkg_core/engine');
    expect(engine).toBeDefined();
    expect(engine!.lines.covered).toBe(100);
    expect(engine!.lines.total).toBe(150);
  });

  it('rolls up components to container level', () => {
    const rows: ReleaseCoverageRow[] = [
      makeRow('core', '/repo/packages/core/src/engine/render.ts', 80, 100),
      makeRow('core', '/repo/packages/core/src/utils/helper.ts', 50, 50),
    ];
    const result = aggregateCoverageFromDb(rows, model);
    const container = result.entries.find(e => e.elementId === 'pkg_core');
    expect(container).toBeDefined();
    expect(container!.lines.covered).toBe(130);
    expect(container!.lines.total).toBe(150);
  });

  it('rolls up containers to system level', () => {
    const rows: ReleaseCoverageRow[] = [
      makeRow('core', '/repo/packages/core/src/engine/foo.ts', 50, 100),
      makeRow('ui', '/repo/packages/ui/src/components/Bar.tsx', 30, 60),
    ];
    const result = aggregateCoverageFromDb(rows, model);
    const system = result.entries.find(e => e.elementId === 'sys_app');
    expect(system).toBeDefined();
    expect(system!.lines.covered).toBe(80);
    expect(system!.lines.total).toBe(160);
  });

  it('skips __total__ rows', () => {
    const rows: ReleaseCoverageRow[] = [
      makeRow('core', '__total__', 100, 200),
      makeRow('core', '/repo/packages/core/src/engine/foo.ts', 80, 100),
    ];
    const result = aggregateCoverageFromDb(rows, model);
    const engine = result.entries.find(e => e.elementId === 'pkg_core/engine');
    expect(engine?.lines.total).toBe(100);
  });

  it('generates file-level code entries for L4 view', () => {
    const rows: ReleaseCoverageRow[] = [
      makeRow('core', '/repo/packages/core/src/engine/render.ts', 80, 100),
    ];
    const result = aggregateCoverageFromDb(rows, model);
    const fileEntry = result.entries.find(
      e => e.elementId === 'file::packages/core/src/engine/render.ts',
    );
    expect(fileEntry).toBeDefined();
    expect(fileEntry!.lines.covered).toBe(80);
    expect(fileEntry!.lines.total).toBe(100);
  });

  it('generates file-level entry even for root-level files (no component dir)', () => {
    const rows: ReleaseCoverageRow[] = [
      makeRow('core', '/repo/packages/core/root-file.ts', 10, 10),
    ];
    const result = aggregateCoverageFromDb(rows, model);
    const fileEntry = result.entries.find(
      e => e.elementId === 'file::packages/core/root-file.ts',
    );
    expect(fileEntry).toBeDefined();
    // No component-level entry should be created
    expect(result.entries.find(e => e.elementId === 'pkg_core')).toBeUndefined();
  });

  it('includes generatedAt timestamp', () => {
    const before = Date.now();
    const result = aggregateCoverageFromDb([], model);
    expect(result.generatedAt).toBeGreaterThanOrEqual(before);
  });
});
