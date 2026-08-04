// sigma は jsdom で import すると WebGL2RenderingContext 未定義で落ちるため差し替える。
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import {
  mountCodeGraphPanel,
  type CodeGraphPanelProps,
  type CodeGraphReleaseTick,
} from '../codeGraphPanel';

const GRAPH: CodeGraph = {
  generatedAt: '2026-08-04T00:00:00.000Z',
  repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
  nodes: [],
  edges: [],
  communities: {},
  godNodes: [],
};

const RELEASES: readonly CodeGraphReleaseTick[] = [
  { tag: 'v1.18.0', releasedAt: '2026-08-01T00:00:00.000Z', hasGraph: true },
  { tag: 'v1.19.0', releasedAt: '2026-08-02T00:00:00.000Z', hasGraph: false },
  { tag: 'v1.19.1', releasedAt: '2026-08-03T00:00:00.000Z', hasGraph: true },
];

function baseProps(overrides: Partial<CodeGraphPanelProps> = {}): CodeGraphPanelProps {
  return {
    graphState: { status: 'ready', graph: GRAPH },
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
    selectedRelease: 'current',
    playback: { status: 'idle', speed: '1x' },
    ...overrides,
  };
}

function mount(props: CodeGraphPanelProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCodeGraphPanel(container, props);
  const q = <T extends HTMLElement>(id: string): T =>
    container.querySelector(`[data-testid="${id}"]`) as T;
  return {
    container,
    handle,
    toggle: () => q<HTMLButtonElement>('code-graph-playback-toggle'),
    speed: () => q<HTMLSelectElement>('code-graph-playback-speed'),
    status: () => q<HTMLElement>('code-graph-playback-status'),
    slider: () => container.querySelector('input[type="range"]') as HTMLInputElement,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('codeGraphPanel: Auto Playback', () => {
  it('停止中は再生ラベル、再生中は一時停止ラベルを出す', () => {
    const view = mount(baseProps());
    expect(view.toggle().textContent).toBe('自動再生');

    view.handle.update(
      baseProps({
        playback: { status: 'playing', speed: '1x', position: 1, total: 3, skipped: 1, failed: 0 },
      }),
    );
    expect(view.toggle().textContent).toBe('一時停止');
  });

  it('再生対象が 2 本未満なら再生ボタンを押せない', () => {
    const view = mount(baseProps({ playback: { status: 'unavailable' } }));
    expect(view.toggle().disabled).toBe(true);
    expect(view.speed().disabled).toBe(true);
  });

  it('再生中は位置と除外件数を出す', () => {
    const view = mount(
      baseProps({
        playback: { status: 'playing', speed: '1x', position: 2, total: 3, skipped: 1, failed: 0 },
      }),
    );
    expect(view.status().textContent).toContain('2 / 3');
    expect(view.status().textContent).toContain('未生成を除外 1');
  });

  it('取得失敗の件数も再生中に出す', () => {
    const view = mount(
      baseProps({
        playback: { status: 'playing', speed: '1x', position: 3, total: 3, skipped: 0, failed: 2 },
      }),
    );
    expect(view.status().textContent).toContain('取得失敗 2');
  });

  it('停止時の帰結は role="status" の行に出る', () => {
    const view = mount(
      baseProps({
        playback: {
          status: 'idle',
          speed: '1x',
          result: { reason: 'completed', position: 3, total: 3, skipped: 1, failed: 0 },
        },
      }),
    );
    expect(view.status().getAttribute('role')).toBe('status');
    expect(view.status().textContent).toContain('再生が末尾まで到達しました');
    expect(view.status().textContent).toContain('3 / 3');
  });

  it('停止中で帰結が無ければ status 行は空である（毎フレーム読み上げない）', () => {
    const view = mount(baseProps());
    expect(view.status().textContent).toBe('');
  });

  it('速度セレクタの変更を通知する', () => {
    const seen: string[] = [];
    const view = mount(baseProps({ onPlaybackSpeedChange: (s) => seen.push(s) }));
    view.speed().value = '4x';
    view.speed().dispatchEvent(new Event('change'));
    expect(seen).toEqual(['4x']);
  });

  it('再生中にスライダーを手で動かすと停止を要求する（トグルではない）', () => {
    let stopped = 0;
    let toggled = 0;
    const view = mount(
      baseProps({
        playback: { status: 'playing', speed: '1x', position: 1, total: 3, skipped: 1, failed: 0 },
        onPlaybackStop: () => {
          stopped += 1;
        },
        onPlaybackToggle: () => {
          toggled += 1;
        },
      }),
    );
    view.slider().value = '0';
    view.slider().dispatchEvent(new Event('input'));
    expect(stopped).toBe(1);
    // トグルを呼ぶと、props が更新される前の 2 回目で「開始」と解釈され得る。
    expect(toggled).toBe(0);
  });

  it('ドラッグ中に input が連続しても停止要求のままで、再生要求へ転じない', () => {
    let stopped = 0;
    let toggled = 0;
    // props は据え置き（React が再レンダーするまで描画層は再生中のままに見える）。
    const view = mount(
      baseProps({
        playback: { status: 'playing', speed: '1x', position: 1, total: 3, skipped: 1, failed: 0 },
        onPlaybackStop: () => {
          stopped += 1;
        },
        onPlaybackToggle: () => {
          toggled += 1;
        },
      }),
    );
    for (const value of ['0', '1', '2']) {
      view.slider().value = value;
      view.slider().dispatchEvent(new Event('input'));
    }
    expect(stopped).toBe(3);
    expect(toggled).toBe(0);
  });

  it('停止中のスライダー操作では停止を要求しない', () => {
    let stopped = 0;
    const view = mount(
      baseProps({
        onPlaybackStop: () => {
          stopped += 1;
        },
      }),
    );
    view.slider().value = '0';
    view.slider().dispatchEvent(new Event('input'));
    expect(stopped).toBe(0);
  });

  it('再生中は未生成の時点の生成を要求しない', () => {
    const generated: string[] = [];
    const view = mount(
      baseProps({
        selectedRelease: 'v1.19.0',
        graphState: { status: 'no-graph' },
        playback: { status: 'playing', speed: '1x', position: 1, total: 3, skipped: 1, failed: 0 },
        onGenerateRelease: (tag) => generated.push(tag),
      }),
    );
    const button = Array.from(view.container.querySelectorAll('button')).find(
      (b) => b.textContent === 'このリリースのグラフを生成',
    );
    button?.click();
    expect(generated).toEqual([]);
  });

  it('停止中なら未生成の時点の生成を要求できる', () => {
    const generated: string[] = [];
    const view = mount(
      baseProps({
        selectedRelease: 'v1.19.0',
        graphState: { status: 'no-graph' },
        onGenerateRelease: (tag) => generated.push(tag),
      }),
    );
    const button = Array.from(view.container.querySelectorAll('button')).find(
      (b) => b.textContent === 'このリリースのグラフを生成',
    );
    button?.click();
    expect(generated).toEqual(['v1.19.0']);
  });

  it('playback を渡さなければ再生 UI を出さない', () => {
    const view = mount(baseProps({ playback: undefined }));
    const wrap = view.container.querySelector('[data-testid="code-graph-playback"]') as HTMLElement;
    expect(wrap.style.display).toBe('none');
  });
});
