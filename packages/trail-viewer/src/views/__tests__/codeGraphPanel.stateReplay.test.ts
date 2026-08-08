// sigma は jsdom で import すると WebGL2RenderingContext 未定義で落ちるため差し替える。
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-activity/codeGraph';
import { diffCodeGraphs } from '@anytime-markdown/trail-activity/codeGraphDiff';
import { chooseOption, comboboxLabel, openOptions } from './comboboxTestUtils';
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
  select: () => HTMLElement;
  legend: () => HTMLElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCodeGraphPanel(container, props);
  return {
    container,
    handle,
    select: () => container,
    legend: () =>
      container.querySelector('[data-testid="code-graph-legend"]') as HTMLElement,
  };
}

function selectDiff(container: HTMLElement): void {
  chooseOption(container, 'code-graph-color-by', '前版との差分');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('codeGraphPanel — State Replay', () => {
  it('offers a diff colour mode', () => {
    const { select, handle } = mount(baseProps());

    const values = openOptions(select(), 'code-graph-color-by').map((o) => o.label);
    expect(values).toContain('前版との差分');

    handle.destroy();
  });

  it('disables the diff mode when there is no baseline', () => {
    const { select, handle } = mount(baseProps({ baseline: null }));

    const option = openOptions(select(), 'code-graph-color-by').find((o) => o.label === '前版との差分');
    expect(option?.disabled).toBe(true);

    handle.destroy();
  });

  it('falls back to community when the baseline disappears while diff is selected', () => {
    const changes: string[] = [];
    const { select, handle } = mount(
      baseProps({ onColorByChange: (mode) => changes.push(mode) }),
    );
    selectDiff(select());
    expect(comboboxLabel(select(), 'code-graph-color-by')).toBe('前版との差分');

    // 目盛りを最古へ動かしてベースラインが消えた場合。
    handle.update(baseProps({ baseline: null, onColorByChange: (mode) => changes.push(mode) }));

    expect(comboboxLabel(select(), 'code-graph-color-by')).toBe('コミュニティ');
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

  it('replaces the baseline generate button with progress while a generation runs', () => {
    const { select, container, legend, handle } = mount(
      baseProps({
        baseline: { ...BASELINE, hasGraph: false },
        diff: null,
        generateState: { status: 'running', tag: 'v1.18.0', percent: 40 },
      }),
    );
    selectDiff(select());

    // 解析は 1 本ずつしか走らないため、実行中は押せるように見せない。
    expect(
      container.querySelector('[data-testid="code-graph-diff-generate-baseline"]'),
    ).toBeNull();
    expect(legend().textContent).toContain('40%');

    handle.destroy();
  });

  it('shows why the baseline generation failed and lets it be retried', () => {
    const { select, container, legend, handle } = mount(
      baseProps({
        baseline: { ...BASELINE, hasGraph: false },
        diff: null,
        generateState: { status: 'error', tag: 'v1.18.0', message: 'HTTP 500' },
      }),
    );
    selectDiff(select());

    expect(legend().textContent).toContain('HTTP 500');
    expect(
      container.querySelector('[data-testid="code-graph-diff-generate-baseline"]'),
    ).not.toBeNull();

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
