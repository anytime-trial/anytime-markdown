import type { C4Model } from '../../c4/types';
import { aggregateHeatmapColumnsToC4 } from '../aggregateHeatmapColumnsToC4';

function makeModel(): C4Model {
  return {
    level: 'code',
    elements: [
      { id: 'pkg_core', type: 'container', name: 'Core' },
      { id: 'pkg_core/x', type: 'component', name: 'X', boundaryId: 'pkg_core' },
      { id: 'file::x/a.ts', type: 'code', name: 'a.ts', boundaryId: 'pkg_core/x' },
      { id: 'file::x/b.ts', type: 'code', name: 'b.ts', boundaryId: 'pkg_core/x' },
    ],
    relationships: [],
  };
}

describe('aggregateHeatmapColumnsToC4', () => {
  test('aggregates multiple files belonging to same code element by sum', () => {
    const rows = [{ id: 'r1', label: 'r1' }];
    const cells = new Map<string, ReadonlyMap<string, number>>([
      [
        'r1',
        new Map([
          ['x/a.ts', 2],
          ['x/b.ts', 3],
        ]),
      ],
    ]);
    const matrix = aggregateHeatmapColumnsToC4(rows, cells, makeModel());
    expect(matrix.columns.find((c) => c.id === 'file::x/a.ts')).toBeDefined();
    expect(matrix.columns.find((c) => c.id === 'file::x/b.ts')).toBeDefined();
    const cellA = matrix.cells.find(
      (c) => matrix.columns[c.colIndex].id === 'file::x/a.ts' && c.rowIndex === 0,
    );
    expect(cellA?.value).toBe(2);
  });

  test('rows are preserved as passed in', () => {
    const rows = [
      { id: 'r1', label: 'r1' },
      { id: 'r2', label: 'r2' },
      { id: 'r3', label: 'r3' },
    ];
    const cells = new Map<string, ReadonlyMap<string, number>>([
      ['r1', new Map([['x/a.ts', 1]])],
      ['r3', new Map([['x/b.ts', 1]])],
    ]);
    const matrix = aggregateHeatmapColumnsToC4(rows, cells, makeModel());
    expect(matrix.rows).toHaveLength(3);
    expect(matrix.rows.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
  });

  test('columns are code elements (no parent rollup at column level)', () => {
    const rows = [{ id: 'r1', label: 'r1' }];
    const cells = new Map<string, ReadonlyMap<string, number>>([
      ['r1', new Map([['x/a.ts', 1]])],
    ]);
    const matrix = aggregateHeatmapColumnsToC4(rows, cells, makeModel());
    expect(matrix.columns).toHaveLength(1);
    expect(matrix.columns[0].id).toBe('file::x/a.ts');
  });
});
