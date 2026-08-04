// sigma は jsdom で import すると WebGL2RenderingContext 未定義で落ちるため差し替える。
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import { diffCodeGraphs } from '@anytime-markdown/trail-core/codeGraphDiff';
import {
  mountCodeGraphPanel,
  type CodeGraphPanelProps,
  type CodeGraphReleaseTick,
} from '../codeGraphPanel';

function node(id: string, over: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id,
    label: id,
    repo: 'r',
    package: 'p',
    fileType: 'code',
    community: 0,
    communityLabel: 'c',
    x: 0,
    y: 0,
    size: 1,
    ...over,
  };
}

function graph(nodes: CodeGraphNode[]): CodeGraph {
  return {
    generatedAt: '2026-08-04T00:00:00.000Z',
    repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
    nodes,
    edges: [],
    communities: { 0: 'c' },
    godNodes: [],
  };
}

const baselineGraph = graph([node('keep'), node('gone')]);
const targetGraph = graph([node('keep'), node('fresh')]);
const DIFF = diffCodeGraphs(baselineGraph, targetGraph);

const BASELINE: CodeGraphReleaseTick = {
  tag: 'v1.18.0',
  releasedAt: '2026-08-01T00:00:00.000Z',
  hasGraph: true,
};

function baseProps(overrides: Partial<CodeGraphPanelProps> = {}): CodeGraphPanelProps {
  return {
    graphState: { status: 'ready', graph: targetGraph },
    highlightedNodes: new Set(),
    selectedNode: null,
    showSubagentDirectionalHint: false,
    ghostEdges: [],
    ghostEdgesEnabled: false,
    ghostEdgeGranularity: 'commit',
    isDark: true,
    onSearch: () => {},
    onRefetch: () => {},
    onNodeClick: () => {},
    baseline: BASELINE,
    diff: DIFF,
    ...overrides,
  };
}

function mount(props: CodeGraphPanelProps): {
  container: HTMLElement;
  handle: ReturnType<typeof mountCodeGraphPanel>;
  select: () => HTMLSelectElement;
  legend: () => HTMLElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCodeGraphPanel(container, props);
  return {
    container,
    handle,
    select: () => container.querySelector('select') as HTMLSelectElement,
    legend: () =>
      container.querySelector('[data-testid="code-graph-legend"]') as HTMLElement,
  };
}

function selectDiff(select: HTMLSelectElement): void {
  select.value = 'diff';
  select.dispatchEvent(new Event('change'));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('codeGraphPanel — State Replay', () => {
  it('offers a diff colour mode', () => {
    const { select, handle } = mount(baseProps());

    const values = [...select().querySelectorAll('option')].map((o) => o.value);
    expect(values).toContain('diff');

    handle.destroy();
  });

  it('disables the diff mode when there is no baseline', () => {
    const { select, handle } = mount(baseProps({ baseline: null }));

    const option = [...select().querySelectorAll('option')].find((o) => o.value === 'diff');
    expect(option?.disabled).toBe(true);

    handle.destroy();
  });

  it('falls back to community when the baseline disappears while diff is selected', () => {
    const changes: string[] = [];
    const { select, handle } = mount(
      baseProps({ onColorByChange: (mode) => changes.push(mode) }),
    );
    selectDiff(select());
    expect(select().value).toBe('diff');

    // 目盛りを最古へ動かしてベースラインが消えた場合。
    handle.update(baseProps({ baseline: null, onColorByChange: (mode) => changes.push(mode) }));

    expect(select().value).toBe('community');
    expect(changes).toEqual(['diff', 'community']);

    handle.destroy();
  });

  it('shows the four diff classes with their counts in the legend', () => {
    const { select, legend, handle } = mount(baseProps());
    selectDiff(select());

    const text = legend().textContent ?? '';
    // 追加 1 / 削除 1 / 依存変化 0 / 変化なし 1（keep のみ）
    expect(text).toContain('追加: 1');
    expect(text).toContain('削除: 1');
    expect(text).toContain('依存変化: 0');
    expect(text).toContain('変化なし: 1');
    expect(legend().style.display).toBe('flex');

    handle.destroy();
  });

  it('names the baseline in the legend so the comparison is not guessed', () => {
    const { select, legend, handle } = mount(baseProps());
    selectDiff(select());

    expect(legend().textContent).toContain('v1.18.0');

    handle.destroy();
  });

  it('warns that ghost positions come from the baseline layout', () => {
    const { select, legend, handle } = mount(baseProps());
    selectDiff(select());

    expect(legend().textContent).toContain('現在の配置とは一致しません');

    handle.destroy();
  });

  it('offers a toggle for removed nodes that defaults to on', () => {
    const { select, container, handle } = mount(baseProps());
    selectDiff(select());

    const box = container.querySelector(
      '[data-testid="code-graph-diff-show-removed"]',
    ) as HTMLInputElement;
    expect(box).not.toBeNull();
    expect(box.checked).toBe(true);

    box.checked = false;
    box.dispatchEvent(new Event('change'));
    const after = container.querySelector(
      '[data-testid="code-graph-diff-show-removed"]',
    ) as HTMLInputElement;
    expect(after.checked).toBe(false);

    handle.destroy();
  });

  it('offers to generate the baseline graph when it is missing', () => {
    const requested: string[] = [];
    const { select, container, handle } = mount(
      baseProps({
        baseline: { ...BASELINE, hasGraph: false },
        diff: null,
        onGenerateRelease: (tag) => requested.push(tag),
      }),
    );
    selectDiff(select());

    const btn = container.querySelector(
      '[data-testid="code-graph-diff-generate-baseline"]',
    ) as HTMLElement;
    expect(btn).not.toBeNull();
    btn.click();

    expect(requested).toEqual(['v1.18.0']);

    handle.destroy();
  });

  it('hides the generate button once the baseline has a graph', () => {
    const { select, container, handle } = mount(baseProps());
    selectDiff(select());

    expect(
      container.querySelector('[data-testid="code-graph-diff-generate-baseline"]'),
    ).toBeNull();

    handle.destroy();
  });

  it('keeps the diff legend hidden for other colour modes', () => {
    const { legend, handle } = mount(baseProps());

    expect(legend().style.display).toBe('none');

    handle.destroy();
  });
});
