/**
 * mountScatterPanel — composed scatter view (toolbar + canvas switching + tour).
 *
 * Regression target: the vanilla scatter popup previously mounted only the
 * toolbar (mountFunctionScatterPlotPanel) and never the plot canvas, and it
 * never updated its inner handle, so view (scatter/galaxy/city) and tour
 * toggles did nothing. This panel wires the canvases and reacts to prop changes
 * the way the Matrix panel does (remount on view change, update otherwise).
 */

interface RecHandle {
  readonly kind: string;
  updates: number;
  destroyed: boolean;
}

const mockHandles: RecHandle[] = [];

function makeMock(kind: string) {
  return jest.fn((_c: HTMLElement, _p: unknown) => {
    const h: RecHandle = { kind, updates: 0, destroyed: false };
    mockHandles.push(h);
    return {
      el: document.createElement('div'),
      update: () => { h.updates += 1; },
      destroy: () => { h.destroyed = true; },
    };
  });
}

jest.mock('../../canvas/bubbleCanvas', () => ({ mountBubbleCanvas: makeMock('bubble') }));
jest.mock('../../canvas/galaxyCanvas', () => ({ mountGalaxyCanvas: makeMock('galaxy') }));
jest.mock('../../canvas/codeCityCanvas', () => ({ mountCodeCityCanvas: makeMock('city') }));
jest.mock('../../tourMode', () => ({ mountTourMode: makeMock('tour') }));

import { mountScatterPanel, type ScatterPanelProps } from '../scatterPanel';
import type { FunctionAnalysisApiEntry } from '../../../../c4/hooks/fetchFunctionAnalysisApi';

function entry(name: string, file: string): FunctionAnalysisApiEntry {
  return {
    filePath: file,
    functionName: name,
    startLine: 1,
    endLine: 10,
    lineCount: 10,
    fanIn: 3,
    fanOut: 2,
    cognitiveComplexity: 6,
    functionRole: 'hub',
    importanceScore: 5,
  } as unknown as FunctionAnalysisApiEntry;
}

function makeColors(): ScatterPanelProps['colors'] {
  return { border: '#333', text: '#fff', textSecondary: '#aaa', textMuted: '#888' };
}

function baseProps(overrides: Partial<ScatterPanelProps> = {}): ScatterPanelProps {
  return {
    entries: [entry('a', 'f1.ts'), entry('b', 'f2.ts')],
    view: 'scatter',
    tourActive: false,
    isDark: false,
    onViewChange: () => {},
    onTourToggle: () => {},
    onFunctionOpen: () => {},
    colors: makeColors(),
    t: (k: string) => k,
    ...overrides,
  };
}

const last = (kind: string): RecHandle | undefined =>
  [...mockHandles].reverse().find((h) => h.kind === kind);
const count = (kind: string): number => mockHandles.filter((h) => h.kind === kind).length;

describe('mountScatterPanel', () => {
  beforeEach(() => { mockHandles.length = 0; });

  it('mounts the bubble canvas for the scatter view', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handle = mountScatterPanel(container, baseProps());
    expect(count('bubble')).toBe(1);
    expect(count('galaxy')).toBe(0);
    expect(count('city')).toBe(0);

    handle.destroy();
    container.remove();
  });

  it('remounts the canvas when the view changes (scatter -> galaxy -> city)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handle = mountScatterPanel(container, baseProps({ view: 'scatter' }));
    const bubble = last('bubble')!;

    handle.update(baseProps({ view: 'galaxy' }));
    expect(bubble.destroyed).toBe(true);
    expect(count('galaxy')).toBe(1);
    const galaxy = last('galaxy')!;

    handle.update(baseProps({ view: 'city' }));
    expect(galaxy.destroyed).toBe(true);
    expect(count('city')).toBe(1);

    handle.destroy();
    container.remove();
  });

  it('updates (not remounts) the canvas on an isDark-only change', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handle = mountScatterPanel(container, baseProps({ view: 'galaxy' }));
    expect(count('galaxy')).toBe(1);
    const galaxy = last('galaxy')!;

    handle.update(baseProps({ view: 'galaxy', isDark: true }));
    expect(count('galaxy')).toBe(1); // not remounted
    expect(galaxy.destroyed).toBe(false);
    expect(galaxy.updates).toBeGreaterThanOrEqual(1);

    handle.destroy();
    container.remove();
  });

  it('mounts the tour overlay only while tour is active in scatter view', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handle = mountScatterPanel(container, baseProps({ tourActive: false }));
    expect(count('tour')).toBe(0);

    handle.update(baseProps({ tourActive: true, view: 'scatter' }));
    expect(count('tour')).toBe(1);
    const tour = last('tour')!;

    // Switching away from scatter hides the tour overlay.
    handle.update(baseProps({ tourActive: true, view: 'galaxy' }));
    expect(tour.destroyed).toBe(true);

    handle.destroy();
    container.remove();
  });

  it('destroys all child handles on destroy', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const handle = mountScatterPanel(container, baseProps({ tourActive: true, view: 'scatter' }));
    handle.destroy();

    expect(last('bubble')!.destroyed).toBe(true);
    expect(last('tour')!.destroyed).toBe(true);
    container.remove();
  });
});
