// sigma は jsdom で import すると WebGL2RenderingContext 未定義で落ちるため差し替える。
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

import { chooseOption, comboboxLabel, openOptions } from './comboboxTestUtils';
import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-activity/codeGraph';
import {
  CURRENT_RELEASE,
  mountCodeGraphPanel,
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

// サーバは released_at 昇順で返す。v1.14.0 の方が v1.15.0 より早い実データを模す。
const RELEASES: readonly CodeGraphReleaseTick[] = [
  { tag: 'v1.14.0', releasedAt: '2026-07-17T07:38:41.000Z', hasGraph: true },
  { tag: 'v1.15.0', releasedAt: '2026-07-17T21:46:09.000Z', hasGraph: false },
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
    ...overrides,
  };
}

function mount(props: CodeGraphPanelProps): {
  container: HTMLElement;
  handle: ReturnType<typeof mountCodeGraphPanel>;
  scrubber: () => HTMLElement | null;
  slider: () => HTMLInputElement;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCodeGraphPanel(container, props);
  return {
    container,
    handle,
    scrubber: () => container.querySelector<HTMLElement>('[data-testid="code-graph-scrubber"]'),
    slider: () => container.querySelector('input[type=range]') as HTMLInputElement,
  };
}

/** 要素が実際に見えているか（display:none の祖先が無いか）を祖先まで遡って判定する。 */
function isVisible(el: HTMLElement | null): boolean {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.style.display === 'none') return false;
    cur = cur.parentElement;
  }
  return el !== null;
}

describe('codeGraphPanel: Time Scrubber', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('リリース一覧が空のときスクラバを出さない', () => {
    const { scrubber, handle } = mount(baseProps({ releases: [] }));
    expect(isVisible(scrubber())).toBe(false);
    handle.destroy();
  });

  it('リリース一覧があると目盛りが N+1 個になり、右端（現在）が初期選択される', () => {
    const { slider, handle } = mount(baseProps({ releases: RELEASES }));
    expect(slider().max).toBe('2'); // 2 リリース + 現在
    expect(slider().value).toBe('2');
    handle.destroy();
  });

  it('目盛りの並びはサーバの順序をそのまま使う（released_at 昇順）', () => {
    const seen: string[] = [];
    const { slider, handle } = mount(
      baseProps({ releases: RELEASES, onReleaseChange: (r) => seen.push(r) }),
    );
    slider().value = '0';
    slider().dispatchEvent(new Event('change'));
    expect(seen).toEqual(['v1.14.0']);
    handle.destroy();
  });

  it('ドラッグ中（input）では取得を要求せず、確定（change）で初めて通知する', () => {
    const seen: string[] = [];
    const { slider, handle } = mount(
      baseProps({ releases: RELEASES, onReleaseChange: (r) => seen.push(r) }),
    );
    slider().value = '1';
    slider().dispatchEvent(new Event('input'));
    expect(seen).toEqual([]);
    slider().dispatchEvent(new Event('change'));
    expect(seen).toEqual(['v1.15.0']);
    handle.destroy();
  });

  it('現在以外を選んでいる間はタグと日付を常時表示する', () => {
    const { container, handle } = mount(
      baseProps({ releases: RELEASES, selectedRelease: 'v1.14.0' }),
    );
    const value = container.querySelector('[data-testid="code-graph-scrubber-value"]');
    expect(value?.textContent).toContain('v1.14.0');
    expect(value?.textContent).toContain('2026-07-17');
    handle.destroy();
  });

  it('未生成の時点を選んでもスクラバが消えず、生成ボタンが出る', () => {
    const { container, scrubber, handle } = mount(
      baseProps({
        graphState: { status: 'no-graph' },
        releases: RELEASES,
        selectedRelease: 'v1.15.0',
      }),
    );
    // ツールバー（検索・配色）は非 ready で隠れるが、スクラバは残る。
    expect(isVisible(scrubber())).toBe(true);
    expect(container.querySelector('[data-testid="code-graph-missing-release"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="code-graph-generate-release"]')).not.toBeNull();
    handle.destroy();
  });

  it('生成ボタンは選択中のタグだけを要求する', () => {
    const requested: string[] = [];
    const { container, handle } = mount(
      baseProps({
        graphState: { status: 'no-graph' },
        releases: RELEASES,
        selectedRelease: 'v1.15.0',
        onGenerateRelease: (tag) => requested.push(tag),
      }),
    );
    container.querySelector<HTMLButtonElement>('[data-testid="code-graph-generate-release"]')?.click();
    expect(requested).toEqual(['v1.15.0']);
    handle.destroy();
  });

  it('スライダー操作だけでは生成を要求しない（自動生成しない）', () => {
    const requested: string[] = [];
    const { slider, handle } = mount(
      baseProps({
        releases: RELEASES,
        onGenerateRelease: (tag) => requested.push(tag),
        onReleaseChange: () => {},
      }),
    );
    slider().value = '1';
    slider().dispatchEvent(new Event('input'));
    slider().dispatchEvent(new Event('change'));
    expect(requested).toEqual([]);
    handle.destroy();
  });

  it('生成中は進捗を出し、生成ボタンを二重に出さない', () => {
    const { container, handle } = mount(
      baseProps({
        graphState: { status: 'no-graph' },
        releases: RELEASES,
        selectedRelease: 'v1.15.0',
        generateState: { status: 'running', tag: 'v1.15.0', percent: 42 },
      }),
    );
    const box = container.querySelector('[data-testid="code-graph-missing-release"]');
    expect(box?.textContent).toContain('42%');
    expect(container.querySelector('[data-testid="code-graph-generate-release"]')).toBeNull();
    handle.destroy();
  });

  it('生成失敗は理由を出し、再要求できる', () => {
    const { container, handle } = mount(
      baseProps({
        graphState: { status: 'no-graph' },
        releases: RELEASES,
        selectedRelease: 'v1.15.0',
        generateState: { status: 'error', tag: 'v1.15.0', message: 'HTTP 409' },
      }),
    );
    const box = container.querySelector('[data-testid="code-graph-missing-release"]');
    expect(box?.textContent).toContain('HTTP 409');
    expect(container.querySelector('[data-testid="code-graph-generate-release"]')).not.toBeNull();
    handle.destroy();
  });

  it('過去の時点では Author Heatmap 配色を選べない', () => {
    const { container, handle } = mount(
      baseProps({ releases: RELEASES, selectedRelease: 'v1.14.0' }),
    );
    const disabled = openOptions(container, 'code-graph-color-by')
      .filter((o) => o.disabled)
      .map((o) => o.label);
    // diff は baseline 未指定のため不活性（State Replay。最古の時点と同じ扱い）。
    expect(disabled.sort()).toEqual(['前版との差分', '最終編集者', '編集頻度'].sort());
    handle.destroy();
  });

  it('Author Heatmap 配色のまま過去の時点へ移ると community へ戻す', () => {
    const seen: string[] = [];
    const { container, handle } = mount(
      baseProps({ releases: RELEASES, onColorByChange: (v) => seen.push(v) }),
    );

    chooseOption(container, 'code-graph-color-by', '最終編集者');
    expect(seen).toEqual(['lastEditor']);

    handle.update(baseProps({ releases: RELEASES, selectedRelease: 'v1.14.0', onColorByChange: (v) => seen.push(v) }));
    expect(seen).toEqual(['lastEditor', 'community']);
    expect(comboboxLabel(container, 'code-graph-color-by')).toBe('コミュニティ');
    handle.destroy();
  });

  it('一覧に無いタグを選んだままなら右端（現在）として扱う', () => {
    const { slider, handle } = mount(
      baseProps({ releases: RELEASES, selectedRelease: 'v9.9.9' }),
    );
    expect(slider().value).toBe('2');
    handle.destroy();
  });

  it('CURRENT_RELEASE は取得系 API の予約語と一致する', () => {
    expect(CURRENT_RELEASE).toBe('current');
  });
});

describe('codeGraphPanel: Time Scrubber の生成抑止と読み上げ', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('別タグを生成中なら生成ボタンを出さない（解析は 1 本ずつしか走らない）', () => {
    const { container, handle } = mount(
      baseProps({
        graphState: { status: 'no-graph' },
        releases: RELEASES,
        selectedRelease: 'v1.15.0',
        generateState: { status: 'running', tag: 'v1.14.0' },
      }),
    );
    expect(container.querySelector('[data-testid="code-graph-generate-release"]')).toBeNull();
    const box = container.querySelector('[data-testid="code-graph-missing-release"]');
    expect(box?.textContent).toContain('別の時点を生成中');
    handle.destroy();
  });

  it('未生成の目盛りは読み上げ値にも「未生成」が載る', () => {
    const { slider, handle } = mount(
      baseProps({ releases: RELEASES, selectedRelease: 'v1.15.0' }),
    );
    expect(slider().getAttribute('aria-valuetext')).toContain('未生成');
    handle.destroy();
  });

  it('生成済みの目盛りには「未生成」を付けない', () => {
    const { slider, handle } = mount(
      baseProps({ releases: RELEASES, selectedRelease: 'v1.14.0' }),
    );
    expect(slider().getAttribute('aria-valuetext')).not.toContain('未生成');
    expect(slider().getAttribute('aria-valuetext')).toContain('v1.14.0');
    handle.destroy();
  });
});
