/**
 * rootComponentsB — vanilla view tests for 5 converted components
 *
 * Runs in jsdom (jest.config.js testEnvironment: "jsdom").
 * Covers: mountReleasesPanel, mountEvaluationPanel, mountPromptManagerSidebar,
 *         mountCodeGraphPanel, mountCodeGraphCanvas.
 *
 * Sigma.js requires WebGL2RenderingContext which doesn't exist in jsdom.
 * We mock sigma and sigma/rendering at module level so tests can exercise
 * the ctx-null guard path without instantiating a real Sigma renderer.
 */

// Mock sigma before any imports — Jest hoists jest.mock() calls.
jest.mock('sigma', () => {
  return {
    __esModule: true,
    default: class MockSigma {
      constructor() { /* no-op */ }
      on() { /* no-op */ }
      getGraph() { return { forEachNode: () => { /* no-op */ }, setNodeAttribute: () => { /* no-op */ } }; }
      refresh() { /* no-op */ }
      kill() { /* no-op */ }
    },
  };
});
jest.mock('sigma/rendering', () => ({
  EdgeArrowProgram: class MockEdgeArrowProgram {},
}));

import { mountReleasesPanel, type ReleasesPanelProps } from '../releasesPanel';
import { mountEvaluationPanel, type EvaluationPanelProps } from '../evaluationPanel';
import { mountPromptManagerSidebar, type PromptManagerSidebarProps } from '../promptManager';
import { mountCodeGraphPanel, type CodeGraphPanelProps } from '../codeGraphPanel';
import { mountCodeGraphCanvas, type CodeGraphCanvasViewProps } from '../codeGraphCanvas';
import type { TrailRelease } from '@anytime-markdown/trail-core/domain';
import type { TrailEvaluation, TrailPromptEntry } from '@anytime-markdown/trail-core/domain';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const t = (key: string): string => key;

const COLORS = {
  textSecondary: 'rgba(255,255,255,0.70)',
  border: 'rgba(255,255,255,0.12)',
  sectionBg: 'rgba(255,255,255,0.05)',
  iceBlue: '#90CAF9',
  hoverBg: 'rgba(255,255,255,0.16)',
  activeBg: 'rgba(255,255,255,0.24)',
  iceBlueBorder: 'rgba(144,202,249,0.3)',
  amberGold: '#E8A012',
  amberGoldHover: '#d4920e',
  textOnLight: 'rgba(0,0,0,0.87)',
};

const COMMIT_COLORS = {
  feat: '#66BB6A',
  fix: '#EF5350',
  refactor: '#42A5F5',
  test: '#FFA726',
  other: 'rgba(255,255,255,0.30)',
};

function makeRelease(overrides: Partial<TrailRelease> = {}): TrailRelease {
  return {
    tag: 'v1.0.0',
    releasedAt: '2026-01-01T00:00:00.000Z',
    prevTag: null,
    repoName: 'my-repo',
    packageTags: ['pkg-a'],
    commitCount: 10,
    filesChanged: 5,
    linesAdded: 100,
    linesDeleted: 20,
    totalLines: 1000,
    featCount: 3,
    fixCount: 2,
    refactorCount: 2,
    testCount: 2,
    otherCount: 1,
    affectedPackages: [],
    durationDays: 7.0,
    releaseTimeMin: null,
    ...overrides,
  };
}

function makeEvaluation(overrides: Partial<TrailEvaluation> = {}): TrailEvaluation {
  return {
    id: 'eval-1',
    sessionId: 'sess-1',
    score: 4,
    comment: 'Good work',
    evaluator: 'Alice',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePrompt(overrides: Partial<TrailPromptEntry> = {}): TrailPromptEntry {
  return {
    id: 'p1',
    name: 'My Prompt',
    content: '# Hello',
    version: 1,
    tags: ['general'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mountReleasesPanel
// ---------------------------------------------------------------------------

describe('mountReleasesPanel', () => {
  it('builds DOM with a table when releases are provided', () => {
    const container = document.createElement('div');
    const props: ReleasesPanelProps = {
      releases: [makeRelease()],
      t,
      commitColors: COMMIT_COLORS,
    };
    const handle = mountReleasesPanel(container, props);

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('tbody tr')).not.toBeNull();
    handle.destroy();
  });

  it('shows empty message when no releases', () => {
    const container = document.createElement('div');
    const props: ReleasesPanelProps = {
      releases: [],
      t,
      commitColors: COMMIT_COLORS,
    };
    const handle = mountReleasesPanel(container, props);

    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain('releases.noReleases');
    handle.destroy();
  });

  it('updates table when releases change', () => {
    const container = document.createElement('div');
    const props: ReleasesPanelProps = {
      releases: [makeRelease({ tag: 'v1.0.0' })],
      t,
      commitColors: COMMIT_COLORS,
    };
    const handle = mountReleasesPanel(container, props);

    expect(container.querySelectorAll('tbody tr').length).toBe(1);

    handle.update({
      ...props,
      releases: [makeRelease({ tag: 'v1.0.0' }), makeRelease({ tag: 'v2.0.0' })],
    });

    expect(container.querySelectorAll('tbody tr').length).toBe(2);
    handle.destroy();
  });

  it('removes root on destroy', () => {
    const container = document.createElement('div');
    const handle = mountReleasesPanel(container, { releases: [makeRelease()], t, commitColors: COMMIT_COLORS });
    expect(container.children.length).toBeGreaterThan(0);
    handle.destroy();
    expect(container.children.length).toBe(0);
  });

  it('renders repo selector when multiple repos', () => {
    const container = document.createElement('div');
    const props: ReleasesPanelProps = {
      releases: [makeRelease({ repoName: 'repo-a' }), makeRelease({ tag: 'v2.0.0', repoName: 'repo-b' })],
      t,
      commitColors: COMMIT_COLORS,
    };
    const handle = mountReleasesPanel(container, props);
    // createSelect renders a <button> with role=combobox, not a native <select>
    const selectorBtn = container.querySelector('[aria-label="releases.repository"]');
    expect(selectorBtn).not.toBeNull();
    handle.destroy();
  });
});

// ---------------------------------------------------------------------------
// mountEvaluationPanel
// ---------------------------------------------------------------------------

describe('mountEvaluationPanel', () => {
  const baseProps = (): EvaluationPanelProps => ({
    evaluations: [],
    t,
    onSave: jest.fn(),
    colors: {
      textSecondary: COLORS.textSecondary,
      border: COLORS.border,
      amberGold: COLORS.amberGold,
      amberGoldHover: COLORS.amberGoldHover,
      textOnLight: COLORS.textOnLight,
    },
    radius: { md: '8px' },
  });

  it('shows selectSession message when no session selected', () => {
    const container = document.createElement('div');
    const handle = mountEvaluationPanel(container, baseProps());
    expect(container.textContent).toContain('eval.selectSession');
    handle.destroy();
  });

  it('shows form + noEvaluations when session selected but no evaluations', () => {
    const container = document.createElement('div');
    const handle = mountEvaluationPanel(container, {
      ...baseProps(),
      selectedSessionId: 'sess-1',
    });
    expect(container.textContent).toContain('eval.newEvaluation');
    expect(container.textContent).toContain('eval.noEvaluations');
    handle.destroy();
  });

  it('renders existing evaluations list', () => {
    const container = document.createElement('div');
    const handle = mountEvaluationPanel(container, {
      ...baseProps(),
      selectedSessionId: 'sess-1',
      evaluations: [makeEvaluation({ sessionId: 'sess-1' })],
    });
    // evaluator name should appear
    expect(container.textContent).toContain('Alice');
    handle.destroy();
  });

  it('updates when selectedSessionId changes', () => {
    const container = document.createElement('div');
    const props = baseProps();
    const handle = mountEvaluationPanel(container, props);
    expect(container.textContent).toContain('eval.selectSession');

    handle.update({ ...props, selectedSessionId: 'sess-1' });
    expect(container.textContent).toContain('eval.newEvaluation');
    handle.destroy();
  });

  it('removes root on destroy', () => {
    const container = document.createElement('div');
    const handle = mountEvaluationPanel(container, baseProps());
    expect(container.children.length).toBeGreaterThan(0);
    handle.destroy();
    expect(container.children.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountPromptManagerSidebar
// ---------------------------------------------------------------------------

describe('mountPromptManagerSidebar', () => {
  const baseProps = (): PromptManagerSidebarProps => ({
    prompts: [],
    selectedId: undefined,
    onSelect: jest.fn(),
    t,
    colors: {
      textSecondary: COLORS.textSecondary,
      border: COLORS.border,
      sectionBg: COLORS.sectionBg,
      iceBlue: COLORS.iceBlue,
      hoverBg: COLORS.hoverBg,
      activeBg: COLORS.activeBg,
      iceBlueBorder: COLORS.iceBlueBorder,
    },
  });

  it('shows empty message when no prompts', () => {
    const container = document.createElement('div');
    const handle = mountPromptManagerSidebar(container, baseProps());
    expect(container.textContent).toContain('prompt.noPrompts');
    handle.destroy();
  });

  it('renders category headers and prompt items', () => {
    const container = document.createElement('div');
    const prompt = makePrompt({ id: 'p1', name: 'Hello Prompt' });
    const handle = mountPromptManagerSidebar(container, {
      ...baseProps(),
      prompts: [prompt],
    });
    expect(container.textContent).toContain('Hello Prompt');
    handle.destroy();
  });

  it('calls onSelect when a prompt item is clicked', () => {
    const container = document.createElement('div');
    const onSelect = jest.fn();
    const prompt = makePrompt({ id: 'p1', name: 'My Prompt' });
    const handle = mountPromptManagerSidebar(container, {
      ...baseProps(),
      prompts: [prompt],
      onSelect,
    });

    // Find the prompt button and click it (it's inside the collapse content)
    const buttons = container.querySelectorAll('button');
    // First button is the category header; subsequent buttons are prompt items
    const promptBtn = Array.from(buttons).find((b) => b.textContent?.includes('My Prompt'));
    promptBtn?.click();
    expect(onSelect).toHaveBeenCalledWith('p1');
    handle.destroy();
  });

  it('updates prompt list on update()', () => {
    const container = document.createElement('div');
    const props = baseProps();
    const handle = mountPromptManagerSidebar(container, props);
    expect(container.textContent).toContain('prompt.noPrompts');

    handle.update({ ...props, prompts: [makePrompt({ name: 'New Prompt' })] });
    expect(container.textContent).toContain('New Prompt');
    handle.destroy();
  });

  it('removes root on destroy', () => {
    const container = document.createElement('div');
    const handle = mountPromptManagerSidebar(container, baseProps());
    expect(container.children.length).toBeGreaterThan(0);
    handle.destroy();
    expect(container.children.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountCodeGraphPanel
// ---------------------------------------------------------------------------

describe('mountCodeGraphPanel', () => {
  const baseProps = (): CodeGraphPanelProps => ({
    graphState: { status: 'loading' },
    highlightedNodes: new Set(),
    selectedNode: null,
    showSubagentDirectionalHint: false,
    ghostEdges: [],
    ghostEdgesEnabled: false,
    ghostEdgeGranularity: 'commit',
    isDark: false,
    onSearch: jest.fn(),
    onRefetch: jest.fn(),
    onNodeClick: jest.fn(),
  });

  it('mounts without throwing', () => {
    const container = document.createElement('div');
    expect(() => {
      const handle = mountCodeGraphPanel(container, baseProps());
      handle.destroy();
    }).not.toThrow();
  });

  it('renders search toolbar', () => {
    const container = document.createElement('div');
    const handle = mountCodeGraphPanel(container, baseProps());
    expect(container.querySelector('input')).not.toBeNull();
    handle.destroy();
  });

  it('shows loading indicator when status=loading', () => {
    const container = document.createElement('div');
    const handle = mountCodeGraphPanel(container, { ...baseProps(), graphState: { status: 'loading' } });
    expect(container.textContent).toContain('グラフを読み込み中');
    handle.destroy();
  });

  it('shows error message when status=error', () => {
    const container = document.createElement('div');
    const handle = mountCodeGraphPanel(container, {
      ...baseProps(),
      graphState: { status: 'error', message: 'Network error' },
    });
    expect(container.textContent).toContain('Network error');
    handle.destroy();
  });

  it('calls onRefetch when retry button is clicked (error state)', () => {
    const container = document.createElement('div');
    const onRefetch = jest.fn();
    const handle = mountCodeGraphPanel(container, {
      ...baseProps(),
      graphState: { status: 'error', message: 'err' },
      onRefetch,
    });
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('再試行'),
    );
    retryBtn?.click();
    expect(onRefetch).toHaveBeenCalled();
    handle.destroy();
  });

  it('calls onSearch when search button clicked', () => {
    const container = document.createElement('div');
    const onSearch = jest.fn();
    const handle = mountCodeGraphPanel(container, { ...baseProps(), onSearch });

    const searchBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('検索'),
    );
    searchBtn?.click();
    expect(onSearch).toHaveBeenCalled();
    handle.destroy();
  });

  it('removes root on destroy', () => {
    const container = document.createElement('div');
    const handle = mountCodeGraphPanel(container, baseProps());
    expect(container.children.length).toBeGreaterThan(0);
    handle.destroy();
    expect(container.children.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mountCodeGraphCanvas
// ---------------------------------------------------------------------------

describe('mountCodeGraphCanvas', () => {
  function makeGraph(): CodeGraphCanvasViewProps['graph'] {
    return {
      generatedAt: '2026-01-01T00:00:00.000Z',
      nodes: [{
        id: 'n1',
        label: 'node1.ts',
        x: 0, y: 0,
        size: 5,
        community: 0,
        repo: 'repo1',
        communityLabel: 'C0',
        package: 'trail-viewer',
        fileType: 'code',
      }],
      edges: [],
      repositories: [{ id: 'repo1', label: 'repo1', path: '/repo1' }],
      communities: { 0: 'default' },
      godNodes: [],
    };
  }

  function makeProps(overrides: Partial<CodeGraphCanvasViewProps> = {}): CodeGraphCanvasViewProps {
    return {
      graph: makeGraph(),
      isDark: false,
      ...overrides,
    };
  }

  it('mounts without throwing (jsdom ctx-null guard)', () => {
    const container = document.createElement('div');
    expect(() => {
      const handle = mountCodeGraphCanvas(container, makeProps());
      handle.destroy();
    }).not.toThrow();
  });

  it('appends inner div to container', () => {
    const container = document.createElement('div');
    const handle = mountCodeGraphCanvas(container, makeProps());
    expect(container.querySelector('div')).not.toBeNull();
    handle.destroy();
  });

  it('removes inner div on destroy', () => {
    const container = document.createElement('div');
    const handle = mountCodeGraphCanvas(container, makeProps());
    handle.destroy();
    expect(container.querySelector('div')).toBeNull();
  });

  it('does not throw when update is called', () => {
    const container = document.createElement('div');
    const handle = mountCodeGraphCanvas(container, makeProps());
    expect(() => {
      handle.update(makeProps({ isDark: true }));
    }).not.toThrow();
    handle.destroy();
  });

  it('handles duplicate destroy safely', () => {
    const container = document.createElement('div');
    const handle = mountCodeGraphCanvas(container, makeProps());
    expect(() => {
      handle.destroy();
      handle.destroy();
    }).not.toThrow();
  });
});
