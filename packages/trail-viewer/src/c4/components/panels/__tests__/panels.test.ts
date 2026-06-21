/**
 * Vanilla panel view smoke tests.
 * All tests run in jsdom. canvas.getContext returns null and <anytime-chart>
 * won't register — panels that depend on them are guarded by existence checks.
 */
import { mountDeadCodeDetailPanel } from '../../../../views/c4/panels/deadCodeDetailPanel';
import { mountActivityTrendPanel } from '../../../../views/c4/panels/activityTrendPanel';
import { mountMatrixPanel } from '../../../../views/c4/panels/matrixPanel';
import { mountFunctionScatterPlotPanel } from '../../../../views/c4/panels/functionScatterPlotPanel';
import type { FileAnalysisApiEntry } from '../../../hooks/fetchFileAnalysisApi';
import type { DeadCodeDetailPanelProps } from '../../../../views/c4/panels/deadCodeDetailPanel';
import type { ActivityTrendPanelProps } from '../../../../views/c4/panels/activityTrendPanel';
import type { MatrixPanelVanillaProps } from '../../../../views/c4/panels/matrixPanel';
import type { FunctionScatterPlotPanelProps } from '../../../../views/c4/panels/functionScatterPlotPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function cleanup(el: HTMLElement): void {
  el.remove();
}

const t = (key: string): string => key;

const baseColors = {
  border: '#ccc',
  text: '#111',
  textSecondary: '#555',
  textMuted: '#999',
};

// ---------------------------------------------------------------------------
// DeadCodeDetailPanel
// ---------------------------------------------------------------------------

describe('mountDeadCodeDetailPanel', () => {
  function makeEntry(overrides: Partial<FileAnalysisApiEntry> = {}): FileAnalysisApiEntry {
    return {
      filePath: 'src/foo.ts',
      language: 'typescript',
      deadCodeScore: 60,
      signals: {
        orphan: true,
        fanInZero: false,
        noRecentChurn: true,
        zeroCoverage: false,
        isolatedCommunity: false,
      },
      ...overrides,
    } as FileAnalysisApiEntry;
  }

  it('mounts without error', () => {
    const container = makeContainer();
    const props: DeadCodeDetailPanelProps = {
      entries: [makeEntry()],
      t,
      colors: baseColors,
    };
    const handle = mountDeadCodeDetailPanel(container, props);
    expect(container.querySelector('div')).not.toBeNull();
    handle.destroy();
    cleanup(container);
  });

  it('renders nothing for empty entries', () => {
    const container = makeContainer();
    const props: DeadCodeDetailPanelProps = {
      entries: [],
      t,
      colors: baseColors,
    };
    const handle = mountDeadCodeDetailPanel(container, props);
    // root div appended but empty
    const root = container.querySelector('div');
    expect(root?.childNodes.length).toBe(0);
    handle.destroy();
    cleanup(container);
  });

  it('shows score in DOM', () => {
    const container = makeContainer();
    const props: DeadCodeDetailPanelProps = {
      entries: [makeEntry()],
      t,
      colors: baseColors,
    };
    const handle = mountDeadCodeDetailPanel(container, props);
    expect(container.textContent).toContain('/ 100');
    handle.destroy();
    cleanup(container);
  });

  it('update re-renders with new entries', () => {
    const container = makeContainer();
    const props: DeadCodeDetailPanelProps = {
      entries: [makeEntry()],
      t,
      colors: baseColors,
    };
    const handle = mountDeadCodeDetailPanel(container, props);
    handle.update({ ...props, entries: [] });
    const root = container.querySelector('div');
    expect(root?.childNodes.length).toBe(0);
    handle.destroy();
    cleanup(container);
  });

  it('destroy removes root from DOM', () => {
    const container = makeContainer();
    const handle = mountDeadCodeDetailPanel(container, { entries: [], t, colors: baseColors });
    handle.destroy();
    expect(container.childNodes.length).toBe(0);
    cleanup(container);
  });
});

// ---------------------------------------------------------------------------
// ActivityTrendPanel
// ---------------------------------------------------------------------------

describe('mountActivityTrendPanel', () => {
  const baseProps: ActivityTrendPanelProps = {
    elementId: 'elem-1',
    period: '30d',
    onPeriodChange: jest.fn(),
    spec: null,
    legendItems: [{ label: 'Commits', color: '#4caf50' }],
    loading: false,
    error: null,
    isDark: false,
    t,
  };

  it('mounts without error', () => {
    const container = makeContainer();
    const handle = mountActivityTrendPanel(container, baseProps);
    expect(container.querySelector('div')).not.toBeNull();
    handle.destroy();
    cleanup(container);
  });

  it('shows title from t()', () => {
    const container = makeContainer();
    const handle = mountActivityTrendPanel(container, baseProps);
    expect(container.textContent).toContain('c4.trend.title');
    handle.destroy();
    cleanup(container);
  });

  it('shows legend items', () => {
    const container = makeContainer();
    const handle = mountActivityTrendPanel(container, baseProps);
    expect(container.textContent).toContain('Commits');
    handle.destroy();
    cleanup(container);
  });

  it('shows loading text when loading and no spec', () => {
    const container = makeContainer();
    const handle = mountActivityTrendPanel(container, { ...baseProps, loading: true, spec: null });
    expect(container.textContent).toContain('c4.trend.loading');
    handle.destroy();
    cleanup(container);
  });

  it('shows error message', () => {
    const container = makeContainer();
    const handle = mountActivityTrendPanel(container, { ...baseProps, error: 'network error' });
    expect(container.textContent).toContain('network error');
    handle.destroy();
    cleanup(container);
  });

  it('update changes period select', () => {
    const container = makeContainer();
    const handle = mountActivityTrendPanel(container, baseProps);
    handle.update({ ...baseProps, period: '7d' });
    handle.destroy();
    cleanup(container);
  });

  it('destroy removes root', () => {
    const container = makeContainer();
    const handle = mountActivityTrendPanel(container, baseProps);
    handle.destroy();
    expect(container.childNodes.length).toBe(0);
    cleanup(container);
  });
});

// ---------------------------------------------------------------------------
// MatrixPanel (vanilla)
// ---------------------------------------------------------------------------

describe('mountMatrixPanel', () => {
  const matrixColors = {
    bg: '#fff',
    border: '#ccc',
    accent: '#1976D2',
    hover: 'rgba(0,0,0,0.06)',
    focus: 'rgba(25,118,210,0.12)',
    textMuted: '#999',
    textSecondary: '#555',
  };

  const baseProps: MatrixPanelVanillaProps = {
    gridOptions: null,
    isDark: false,
    level: 'component',
    onLevelChange: jest.fn(),
    colors: matrixColors,
    t,
  };

  it('mounts without error', () => {
    const container = makeContainer();
    const handle = mountMatrixPanel(container, baseProps);
    expect(container.querySelector('div')).not.toBeNull();
    handle.destroy();
    cleanup(container);
  });

  it('shows C2/C3/C4 level buttons', () => {
    const container = makeContainer();
    const handle = mountMatrixPanel(container, baseProps);
    const text = container.textContent ?? '';
    expect(text).toContain('C2');
    expect(text).toContain('C3');
    expect(text).toContain('C4');
    handle.destroy();
    cleanup(container);
  });

  it('shows empty state when gridOptions is null', () => {
    const container = makeContainer();
    const handle = mountMatrixPanel(container, baseProps);
    expect(container.textContent).toContain('Import a C4 model to view metrics');
    handle.destroy();
    cleanup(container);
  });

  it('update changes level active state', () => {
    const container = makeContainer();
    const handle = mountMatrixPanel(container, baseProps);
    handle.update({ ...baseProps, level: 'code' });
    // C4 button should be aria-pressed=true
    const buttons = container.querySelectorAll('button');
    const c4Btn = Array.from(buttons).find((b) => b.textContent === 'C4');
    expect(c4Btn?.getAttribute('aria-pressed')).toBe('true');
    handle.destroy();
    cleanup(container);
  });

  it('destroy removes root', () => {
    const container = makeContainer();
    const handle = mountMatrixPanel(container, baseProps);
    handle.destroy();
    expect(container.childNodes.length).toBe(0);
    cleanup(container);
  });
});

// ---------------------------------------------------------------------------
// FunctionScatterPlotPanel
// ---------------------------------------------------------------------------

describe('mountFunctionScatterPlotPanel', () => {
  const baseProps: FunctionScatterPlotPanelProps = {
    view: 'scatter',
    tourActive: false,
    tourStepsCount: 5,
    onViewChange: jest.fn(),
    onTourToggle: jest.fn(),
    colors: baseColors,
    t,
  };

  it('mounts without error', () => {
    const container = makeContainer();
    const handle = mountFunctionScatterPlotPanel(container, baseProps);
    expect(container.childNodes.length).toBeGreaterThan(0);
    handle.destroy();
    cleanup(container);
  });

  it('renders title from t()', () => {
    const container = makeContainer();
    const handle = mountFunctionScatterPlotPanel(container, baseProps);
    expect(container.textContent).toContain('c4.scatter.title');
    handle.destroy();
    cleanup(container);
  });

  it('renders view toggle buttons', () => {
    const container = makeContainer();
    const handle = mountFunctionScatterPlotPanel(container, baseProps);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4); // scatter, galaxy, city, tour
    handle.destroy();
    cleanup(container);
  });

  it('renders role legend items', () => {
    const container = makeContainer();
    const handle = mountFunctionScatterPlotPanel(container, baseProps);
    const text = container.textContent ?? '';
    expect(text).toContain('hub');
    expect(text).toContain('leaf');
    handle.destroy();
    cleanup(container);
  });

  it('disables tour button when tourStepsCount is 0', () => {
    const container = makeContainer();
    const handle = mountFunctionScatterPlotPanel(container, { ...baseProps, tourStepsCount: 0 });
    const buttons = container.querySelectorAll('button');
    const tourBtn = Array.from(buttons).find((b) => b.getAttribute('aria-label') === 'tour');
    expect(tourBtn?.disabled).toBe(true);
    handle.destroy();
    cleanup(container);
  });

  it('update changes view active state', () => {
    const container = makeContainer();
    const handle = mountFunctionScatterPlotPanel(container, baseProps);
    handle.update({ ...baseProps, view: 'galaxy' });
    handle.destroy();
    cleanup(container);
  });

  it('destroy removes root', () => {
    const container = makeContainer();
    const handle = mountFunctionScatterPlotPanel(container, baseProps);
    handle.destroy();
    expect(container.childNodes.length).toBe(0);
    cleanup(container);
  });
});
