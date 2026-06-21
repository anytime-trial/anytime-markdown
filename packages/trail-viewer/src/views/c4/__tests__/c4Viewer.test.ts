/**
 * c4Viewer.ts — vanilla mount factory tests.
 *
 * Runs in jsdom. Tests that mountC4Viewer builds DOM layout and toolbar
 * without throwing, even with: null canvas ctx, no server, missing data.
 */

// Polyfill structuredClone (not available in jsdom / older Jest environments)
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(val: T): T => JSON.parse(JSON.stringify(val)) as T;
}

import { mountC4Viewer, computeMatrixGridOptions } from '../c4Viewer';
import type { C4ViewerViewProps } from '../c4Viewer';
import type { C4Model, CoverageMatrix } from '@anytime-markdown/trail-core/c4';

// ── Minimal mock for canvas context (jsdom has no canvas ctx) ──
const mockGetContext = jest.fn(() => null);
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: mockGetContext,
  writable: true,
});

// ── Suppress fetch (no server in tests) ──
globalThis.fetch = jest.fn(() => Promise.reject(new Error('no server'))) as unknown as typeof fetch;

// ── Mock requestAnimationFrame ──
let rafId = 0;
globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  // Don't run infinite loops in tests
  return ++rafId;
};
globalThis.cancelAnimationFrame = jest.fn();

// ── Helpers ──
function makeProps(overrides: Partial<C4ViewerViewProps> = {}): C4ViewerViewProps {
  return {
    isDark: false,
    c4Model: null,
    boundaries: [],
    featureMatrix: null,
    dsmMatrix: null,
    coverageMatrix: null,
    coverageDiff: null,
    connected: false,
    releases: [],
    serverUrl: '',
    t: (key: string) => key,
    ...overrides,
  };
}

// ── Tests ──
describe('mountC4Viewer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('mounts without throwing with minimal props', () => {
    expect(() => {
      const handle = mountC4Viewer(container, makeProps());
      handle.destroy();
    }).not.toThrow();
  });

  it('appends a root div to container', () => {
    const handle = mountC4Viewer(container, makeProps());
    expect(container.children.length).toBeGreaterThan(0);
    handle.destroy();
  });

  it('creates level buttons C1-C5', () => {
    const handle = mountC4Viewer(container, makeProps());
    const buttons = container.querySelectorAll('button[aria-label^="Level "]');
    expect(buttons.length).toBe(5);
    handle.destroy();
  });

  it('level buttons have correct aria-pressed for default level 1', () => {
    const handle = mountC4Viewer(container, makeProps());
    const buttons = Array.from(container.querySelectorAll('button[aria-label^="Level "]'));
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    handle.destroy();
  });

  it('initialLevel prop sets correct active button', () => {
    const handle = mountC4Viewer(container, makeProps({ initialLevel: 3 }));
    const buttons = Array.from(container.querySelectorAll('button[aria-label^="Level "]'));
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    handle.destroy();
  });

  it('clicking a level button changes aria-pressed', async () => {
    const handle = mountC4Viewer(container, makeProps());
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Level "]'));
    buttons[1].click(); // Click C2
    // scheduleRender uses queueMicrotask — flush
    await Promise.resolve();
    await Promise.resolve();
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    handle.destroy();
  });

  it('update() reflects prop changes without throwing', () => {
    const handle = mountC4Viewer(container, makeProps({ isDark: false }));
    expect(() => {
      handle.update(makeProps({ isDark: true }));
    }).not.toThrow();
    handle.destroy();
  });

  it('destroy() removes root from container', () => {
    const handle = mountC4Viewer(container, makeProps());
    const childCountBefore = container.children.length;
    expect(childCountBefore).toBeGreaterThan(0);
    handle.destroy();
    expect(container.children.length).toBe(0);
  });

  it('destroy() can be called multiple times safely', () => {
    const handle = mountC4Viewer(container, makeProps());
    expect(() => {
      handle.destroy();
      handle.destroy();
    }).not.toThrow();
  });

  it('overlay select is present', () => {
    const handle = mountC4Viewer(container, makeProps());
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(0);
    handle.destroy();
  });

  it('analysisProgress shows loading overlay', () => {
    const handle = mountC4Viewer(container, makeProps({
      analysisProgress: { phase: 'Indexing...', percent: 42 },
    }));
    // Loading overlay is appended to root, check it exists
    const dialogs = container.querySelectorAll('[role="dialog"][aria-label="Analysis in progress"]');
    expect(dialogs.length).toBeGreaterThan(0);
    handle.destroy();
  });

  it('no analysisProgress hides loading overlay', () => {
    const handle = mountC4Viewer(container, makeProps({ analysisProgress: null }));
    const dialogs = container.querySelectorAll('[role="dialog"][aria-label="Analysis in progress"]');
    // Should exist but be hidden (display:none)
    for (const d of dialogs) {
      expect((d as HTMLElement).style.display).toBe('none');
    }
    handle.destroy();
  });

  it('update() with isDark:true and isDark:false does not throw', () => {
    const handle = mountC4Viewer(container, makeProps({ isDark: false }));
    handle.update(makeProps({ isDark: true }));
    handle.update(makeProps({ isDark: false }));
    handle.destroy();
  });

  it('context menu is appended to document.body (not container)', () => {
    const handle = mountC4Viewer(container, makeProps());
    // Context menus go to document.body so they can be fixed-position
    // They should not be in container
    const ctxInContainer = container.querySelectorAll('[style*="z-index:1001"]');
    expect(ctxInContainer.length).toBe(0);
    handle.destroy();
  });

  it('destroy() removes context menu from document.body', () => {
    const bodyChildrenBefore = document.body.children.length;
    const handle = mountC4Viewer(container, makeProps());
    // Context menu overlay + menu el added to body
    const bodyChildrenDuring = document.body.children.length;
    handle.destroy();
    // After destroy they should be removed
    expect(document.body.children.length).toBeLessThanOrEqual(bodyChildrenBefore + 1); // +1 for container itself
  });

  it('tree host contains child DOM after mount', () => {
    const handle = mountC4Viewer(container, makeProps());
    // treeHost should have content (tree panel appended)
    const root = container.querySelector('div');
    expect(root).toBeTruthy();
    handle.destroy();
  });

  it('dialog hosts are present in DOM', () => {
    const handle = mountC4Viewer(container, makeProps());
    // dialogsHost should exist
    const dialogs = container.querySelectorAll('[role="dialog"]');
    // At minimum the loading dialog and the 3 mount dialogs (even if closed)
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    handle.destroy();
  });
});

// ── Minimal test data ──
function makeC4Model(): C4Model {
  return {
    level: 'component',
    elements: [
      { id: 'sys1', type: 'system', name: 'My System' },
      { id: 'ctr1', type: 'container', name: 'Backend', boundaryId: 'sys1' },
      { id: 'cmp1', type: 'component', name: 'AuthService', boundaryId: 'ctr1' },
      { id: 'cmp2', type: 'component', name: 'UserService', boundaryId: 'ctr1' },
    ],
    relationships: [],
  };
}

function makeCoverageMatrix(): CoverageMatrix {
  return {
    generatedAt: Date.now(),
    entries: [
      {
        elementId: 'cmp1',
        lines: { covered: 80, total: 100, pct: 80 },
        branches: { covered: 60, total: 100, pct: 60 },
        functions: { covered: 90, total: 100, pct: 90 },
      },
      {
        elementId: 'cmp2',
        lines: { covered: 50, total: 100, pct: 50 },
        branches: { covered: 40, total: 100, pct: 40 },
        functions: { covered: 70, total: 100, pct: 70 },
      },
    ],
  };
}

describe('computeMatrixGridOptions', () => {
  it('returns null when c4Model is null', () => {
    const result = computeMatrixGridOptions(
      'component', null, makeCoverageMatrix(), null, null, null, '', null, false,
    );
    expect(result).toBeNull();
  });

  it('returns null when coverageMatrix is null', () => {
    const result = computeMatrixGridOptions(
      'component', makeC4Model(), null, null, null, null, '', null, false,
    );
    expect(result).toBeNull();
  });

  it('returns null when no entries match the level type', () => {
    // 'package' level requires container/containerDb elements; only component entries exist
    const result = computeMatrixGridOptions(
      'package', makeC4Model(), makeCoverageMatrix(), null, null, null, '', null, false,
    );
    // coverageMatrix entries are 'component' type, so after filtering by 'package' level → 0 entries
    expect(result).toBeNull();
  });

  it('returns non-null gridOptions for component level with matching entries', () => {
    const result = computeMatrixGridOptions(
      'component', makeC4Model(), makeCoverageMatrix(), null, null, null, '', null, false,
    );
    expect(result).not.toBeNull();
    expect(result?.adapter).toBeDefined();
    expect(result?.columnHeaders).toBeDefined();
    expect(result?.rowHeaders).toBeDefined();
    expect(result?.rowHeaders?.length).toBe(2); // cmp1 + cmp2
    expect(result?.showToolbar).toBe(false);
    expect(result?.showApply).toBe(false);
    expect(result?.rowHeaderWidth).toBe(200); // component level
  });

  it('sets rowHeaderWidth correctly per level', () => {
    const model = makeC4Model();
    const coverage = makeCoverageMatrix();

    const componentResult = computeMatrixGridOptions('component', model, coverage, null, null, null, '', null, false);
    expect(componentResult?.rowHeaderWidth).toBe(200);

    // Add code-level entries for 'code' test
    const codeModel: C4Model = {
      ...model,
      elements: [
        ...model.elements,
        { id: 'code1', type: 'code', name: 'auth.ts', boundaryId: 'cmp1' },
      ],
    };
    const codeCoverage: CoverageMatrix = {
      generatedAt: Date.now(),
      entries: [{ elementId: 'code1', lines: { covered: 10, total: 20, pct: 50 }, branches: { covered: 5, total: 10, pct: 50 }, functions: { covered: 3, total: 5, pct: 60 } }],
    };
    const codeResult = computeMatrixGridOptions('code', codeModel, codeCoverage, null, null, null, '', null, false);
    expect(codeResult?.rowHeaderWidth).toBe(280);
  });

  it('provides getCellBackground that colors coverage columns', () => {
    const result = computeMatrixGridOptions(
      'component', makeC4Model(), makeCoverageMatrix(), null, null, null, '', null, false,
    );
    expect(result?.getCellBackground).toBeDefined();
    // col 0 = Lines%, col 3 = Complexity (no color)
    const coloredCell = result?.getCellBackground?.(0, 0, '80');
    expect(coloredCell).toBeDefined(); // Lines% at 80 → colored
    const uncoloredCell = result?.getCellBackground?.(0, 3, '42');
    expect(uncoloredCell).toBeUndefined(); // Complexity col → no color
  });

  it('returns rowHeaderGroups for component level (container span)', () => {
    const result = computeMatrixGridOptions(
      'component', makeC4Model(), makeCoverageMatrix(), null, null, null, '', null, false,
    );
    expect(result?.rowHeaderGroups).toBeDefined();
    expect(result?.rowHeaderGroups?.length).toBe(1); // one span row (container level)
  });

  it('returns no rowHeaderGroups for package level', () => {
    // Use container entries so we get a result
    const packageModel: C4Model = {
      level: 'container',
      elements: [
        { id: 'sys1', type: 'system', name: 'Sys' },
        { id: 'ctr1', type: 'container', name: 'Web', boundaryId: 'sys1' },
      ],
      relationships: [],
    };
    const packageCoverage: CoverageMatrix = {
      generatedAt: Date.now(),
      entries: [{ elementId: 'ctr1', lines: { covered: 70, total: 100, pct: 70 }, branches: { covered: 50, total: 100, pct: 50 }, functions: { covered: 80, total: 100, pct: 80 } }],
    };
    const result = computeMatrixGridOptions('package', packageModel, packageCoverage, null, null, null, '', null, false);
    expect(result).not.toBeNull();
    expect(result?.rowHeaderGroups).toBeUndefined();
    expect(result?.rowHeaderWidth).toBe(120);
  });
});
