// sigma は jsdom で import すると WebGL2RenderingContext 未定義で落ちるため差し替える。
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import {
  CURRENT_RELEASE,
  mountCodeGraphPanel,
  type CodeGraphCommitTick,
  type CodeGraphPanelProps,
  type CodeGraphReleaseTick,
} from '../codeGraphPanel';

function node(id: string): CodeGraphNode {
  return {
    id, label: id, repo: 'r', package: 'p', fileType: 'code',
    community: 0, communityLabel: 'c', x: 0, y: 0, size: 1,
  };
}

const graph: CodeGraph = {
  generatedAt: '2026-08-03T00:00:00.000Z',
  repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
  nodes: [node('r:a')],
  edges: [],
  communities: { 0: 'c' },
  godNodes: [],
};

const RELEASES: readonly CodeGraphReleaseTick[] = [
  { tag: 'v1.14.0', releasedAt: '2026-07-17T07:38:41.000Z', hasGraph: true },
  { tag: 'v1.15.0', releasedAt: '2026-07-17T21:46:09.000Z', hasGraph: true },
];

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const COMMITS: readonly CodeGraphCommitTick[] = [
  { sha: SHA_A, shortSha: 'aaaaaaaa', committedAt: '2026-07-17T09:00:00.000Z', subject: 'feat: A', hasGraph: true },
  { sha: SHA_B, shortSha: 'bbbbbbbb', committedAt: '2026-07-17T10:00:00.000Z', subject: 'fix: B', hasGraph: false },
];

function baseProps(overrides: Partial<CodeGraphPanelProps> = {}): CodeGraphPanelProps {
  return {
    graphState: { status: 'ready', graph },
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
    releases: RELEASES,
    ...overrides,
  };
}

function commitProps(overrides: Partial<CodeGraphPanelProps> = {}): CodeGraphPanelProps {
  return baseProps({
    granularity: 'commit',
    commits: COMMITS,
    selectedCommit: SHA_B,
    selectedRelease: 'v1.15.0',
    commitRange: { fromTag: 'v1.14.0', toTag: 'v1.15.0' },
    ...overrides,
  });
}

function mount(props: CodeGraphPanelProps): {
  container: HTMLElement;
  handle: ReturnType<typeof mountCodeGraphPanel>;
  slider: () => HTMLInputElement;
  zoomButton: () => HTMLButtonElement;
  granularityLabel: () => HTMLElement;
  q: <T extends HTMLElement>(testid: string) => T | null;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCodeGraphPanel(container, props);
  const q = <T extends HTMLElement>(testid: string): T | null =>
    container.querySelector<T>(`[data-testid="${testid}"]`);
  return {
    container,
    handle,
    slider: () => container.querySelector('input[type=range]') as HTMLInputElement,
    zoomButton: () =>
      container.querySelector<HTMLButtonElement>(
        '[data-testid="code-graph-scrubber-zoom"] button',
      ) as HTMLButtonElement,
    granularityLabel: () => q<HTMLElement>('code-graph-scrubber-granularity') as HTMLElement,
    q,
  };
}

describe('codeGraphPanel: スクラバのズーム（リリース ⇄ コミット）', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('「現在」を選んでいる間はズームできない（区間の上端が決まらない）', () => {
    const { zoomButton, handle } = mount(baseProps({ selectedRelease: CURRENT_RELEASE }));
    expect(zoomButton().disabled).toBe(true);
    handle.destroy();
  });

  it('リリースを選んでいるとズームでき、押すと onZoomToCommits が呼ばれる', () => {
    const onZoomToCommits = jest.fn();
    const { zoomButton, handle } = mount(
      baseProps({ selectedRelease: 'v1.15.0', onZoomToCommits }),
    );
    expect(zoomButton().disabled).toBe(false);
    zoomButton().click();
    expect(onZoomToCommits).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('コミット粒度の目盛りはコミットだけで、「現在」を並べない', () => {
    const { slider, handle } = mount(commitProps());
    expect(slider().max).toBe('1'); // 2 コミット（現在の目盛りは無い）
    expect(slider().value).toBe('1'); // 選択中は SHA_B
    handle.destroy();
  });

  it('コミット粒度では区間を粒度ラベルに出す', () => {
    const { granularityLabel, handle } = mount(commitProps());
    expect(granularityLabel().textContent).toContain('v1.14.0');
    expect(granularityLabel().textContent).toContain('v1.15.0');
    handle.destroy();
  });

  it('区間の下端が無い（最古から）ときもラベルが成立する', () => {
    const { granularityLabel, handle } = mount(
      commitProps({ commitRange: { fromTag: null, toTag: 'v1.14.0' } }),
    );
    expect(granularityLabel().textContent).toContain('最古');
    handle.destroy();
  });

  it('目盛りの確定は onCommitChange へ SHA を渡す（onReleaseChange は呼ばない）', () => {
    const onCommitChange = jest.fn();
    const onReleaseChange = jest.fn();
    const { slider, handle } = mount(commitProps({ onCommitChange, onReleaseChange }));
    slider().value = '0';
    slider().dispatchEvent(new Event('change'));
    expect(onCommitChange).toHaveBeenCalledWith(SHA_A);
    expect(onReleaseChange).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('「リリースへ戻す」で onZoomToReleases が呼ばれる', () => {
    const onZoomToReleases = jest.fn();
    const { zoomButton, handle } = mount(commitProps({ onZoomToReleases }));
    zoomButton().click();
    expect(onZoomToReleases).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('未生成コミットを選んでグラフが無いとき、生成ボタンは onGenerateCommit へ完全な SHA を渡す', () => {
    const onGenerateCommit = jest.fn();
    const onGenerateRelease = jest.fn();
    const { q, handle } = mount(
      commitProps({ graphState: { status: 'no-graph' }, onGenerateCommit, onGenerateRelease }),
    );
    const btn = q<HTMLButtonElement>('code-graph-generate-release');
    expect(btn).not.toBeNull();
    btn?.click();
    expect(onGenerateCommit).toHaveBeenCalledWith(SHA_B);
    expect(onGenerateRelease).not.toHaveBeenCalled();
    handle.destroy();
  });

  it('未生成コミットの案内には短縮 SHA を出す（40 文字の SHA を貼らない）', () => {
    const { q, handle } = mount(commitProps({ graphState: { status: 'no-graph' } }));
    const text = q<HTMLElement>('code-graph-missing-release')?.textContent ?? '';
    expect(text).toContain('bbbbbbbb');
    expect(text).not.toContain(SHA_B);
    handle.destroy();
  });

  it('コミット粒度では最終編集者・編集頻度の配色を選べない（現在のノード集合の集計であるため）', () => {
    const { container, handle } = mount(commitProps());
    const options = Array.from(container.querySelectorAll('option'));
    const lastEditor = options.find((o) => o.value === 'lastEditor') as HTMLOptionElement;
    const editFrequency = options.find((o) => o.value === 'editFrequency') as HTMLOptionElement;
    expect(lastEditor.disabled).toBe(true);
    expect(editFrequency.disabled).toBe(true);
    handle.destroy();
  });

  it('区間にコミットが無くてもスクラバは残る（リリースへ戻す導線を消さない）', () => {
    const onZoomToReleases = jest.fn();
    const { zoomButton, container, handle } = mount(
      commitProps({ commits: [], selectedCommit: null, onZoomToReleases }),
    );
    const scrubber = container.querySelector<HTMLElement>('[data-testid="code-graph-scrubber"]');
    expect(scrubber?.style.display).not.toBe('none');
    zoomButton().click();
    expect(onZoomToReleases).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('リリース粒度へ戻すと目盛りもリリースへ戻る', () => {
    const { slider, handle } = mount(commitProps());
    expect(slider().max).toBe('1');
    handle.update(baseProps({ selectedRelease: 'v1.15.0' }));
    expect(slider().max).toBe('2'); // 2 リリース + 現在
    handle.destroy();
  });
});
