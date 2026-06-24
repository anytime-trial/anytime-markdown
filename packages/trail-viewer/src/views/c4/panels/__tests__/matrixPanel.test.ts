/**
 * Regression: switching the DSM level (C2/C3/C4) must replace the grid data.
 *
 * The spreadsheet grid's update() only handles { isDark } — it cannot swap the
 * adapter/dimensions captured at mount time. matrixPanel previously called
 * gridHandle.update({ ...gridOptions, isDark }) on every level change, so the
 * new level's data was silently dropped and the table kept showing the first
 * level. The fix remounts the grid when its structure changes.
 */

interface RecordedMount {
  readonly gridRows: number | undefined;
  readonly rowHeaders: readonly string[] | undefined;
  readonly isDark: boolean;
}

const mockMounts: RecordedMount[] = [];
const mockUpdates: Array<{ isDark?: boolean }> = [];
let mockDestroyCount = 0;

jest.mock('@anytime-markdown/spreadsheet-viewer', () => ({
  mountSpreadsheetGrid: jest.fn((_container: HTMLElement, opts: { gridRows?: number; rowHeaders?: string[]; isDark: boolean }) => {
    mockMounts.push({ gridRows: opts.gridRows, rowHeaders: opts.rowHeaders, isDark: opts.isDark });
    return {
      el: document.createElement('div'),
      redraw: () => {},
      update: (p: { isDark?: boolean }) => { mockUpdates.push(p); },
      destroy: () => { mockDestroyCount += 1; },
    };
  }),
}));

import { mountMatrixPanel, type MatrixPanelVanillaProps } from '../matrixPanel';

function makeColors(): MatrixPanelVanillaProps['colors'] {
  return {
    bg: '#fff', border: '#333', accent: '#06c', hover: '#eee',
    focus: '#cde', textMuted: '#888', textSecondary: '#666',
  };
}

function gridOptions(gridRows: number, rowHeaders: string[], rowHeaderWidth: number): MatrixPanelVanillaProps['gridOptions'] {
  return {
    adapter: { getSnapshot: () => ({ range: { rows: gridRows, cols: 4 } }) },
    gridRows,
    gridCols: 4,
    columnHeaders: ['A', 'B', 'C', 'D'],
    rowHeaders,
    rowHeaderWidth,
  } as unknown as MatrixPanelVanillaProps['gridOptions'];
}

function baseProps(overrides: Partial<MatrixPanelVanillaProps> = {}): MatrixPanelVanillaProps {
  return {
    gridOptions: gridOptions(2, ['pkg-a', 'pkg-b'], 120),
    isDark: false,
    level: 'package',
    onLevelChange: () => {},
    colors: makeColors(),
    t: (k: string) => k,
    ...overrides,
  };
}

describe('mountMatrixPanel level switching', () => {
  beforeEach(() => {
    mockMounts.length = 0;
    mockUpdates.length = 0;
    mockDestroyCount = 0;
  });

  it('remounts the grid with the new level data when the DSM level changes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handle = mountMatrixPanel(container, baseProps());
    expect(mockMounts).toHaveLength(1);
    expect(mockMounts[0].rowHeaders).toEqual(['pkg-a', 'pkg-b']);

    // Switch C2 (package) -> C3 (component): different rows/headers/width.
    handle.update(baseProps({
      level: 'component',
      gridOptions: gridOptions(3, ['comp-x', 'comp-y', 'comp-z'], 200),
    }));

    // The grid must be remounted with the component-level data.
    expect(mockDestroyCount).toBe(1);
    expect(mockMounts).toHaveLength(2);
    expect(mockMounts[1].rowHeaders).toEqual(['comp-x', 'comp-y', 'comp-z']);
    expect(mockMounts[1].gridRows).toBe(3);

    handle.destroy();
    container.remove();
  });

  it('only updates theme (no remount) when isolated to an isDark toggle', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const props = baseProps();
    const handle = mountMatrixPanel(container, props);
    expect(mockMounts).toHaveLength(1);

    // Same structure, theme flip: must NOT remount, only update().
    handle.update(baseProps({ isDark: true }));

    expect(mockDestroyCount).toBe(0);
    expect(mockMounts).toHaveLength(1);
    expect(mockUpdates.at(-1)).toEqual({ isDark: true });

    handle.destroy();
    container.remove();
  });
});
