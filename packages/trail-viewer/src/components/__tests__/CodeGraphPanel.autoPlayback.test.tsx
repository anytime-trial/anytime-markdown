/**
 * @jest-environment jsdom
 *
 * Auto Playback のうち「送りの制御が React ラッパ側にある」振る舞いを固定する。
 * 描画は vanilla view のテストが持つため、ここでは island を差し替えて
 * ラッパが渡す値と、送りで要求される時点だけを見る。
 */
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

const useCodeGraphMock = jest.fn();
const useCodeGraphReleasesMock = jest.fn();

jest.mock('../../hooks/useCodeGraph', () => ({
  useCodeGraph: (...args: unknown[]) => useCodeGraphMock(...args),
}));
jest.mock('../../hooks/useCodeGraphReleases', () => ({
  useCodeGraphReleases: (...args: unknown[]) => useCodeGraphReleasesMock(...args),
}));
jest.mock('../../hooks/useAuthorHeatmap', () => ({
  useAuthorHeatmap: () => ({ data: null, loading: false, error: null }),
}));
jest.mock('../../c4/hooks/useTemporalCoupling', () => ({
  useTemporalCoupling: () => ({ edges: [], directional: false, granularity: 'commit' }),
}));
jest.mock('../../shared/vanillaIsland', () => ({
  VanillaIsland: (props: { props: Record<string, unknown> }) => {
    lastViewProps = props.props;
    return null;
  },
}));

import { act, render } from '@testing-library/react';
import type { CodeGraph } from '@anytime-markdown/trail-activity/codeGraph';
import { CodeGraphPanel } from '../CodeGraphPanel';
import { TrailLocaleProvider } from '../../i18n';
import type { CodeGraphPlaybackViewState } from '../../views/codeGraphPanel';

let lastViewProps: Record<string, unknown> = {};

const GRAPH: CodeGraph = {
  generatedAt: '2026-08-04T00:00:00.000Z',
  repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
  nodes: [],
  edges: [],
  communities: {},
  godNodes: [],
};

/** 在庫あり 2 本 + 未生成 1 本。再生列は 生成済み 2 本 ＋「現在」の 3 本になる。 */
const RELEASES = [
  { tag: 'v1.18.0', releasedAt: '2026-08-01T00:00:00.000Z', hasGraph: true },
  { tag: 'v1.19.0', releasedAt: '2026-08-02T00:00:00.000Z', hasGraph: false },
  { tag: 'v1.19.1', releasedAt: '2026-08-03T00:00:00.000Z', hasGraph: true },
];

function panel(repoName = 'repo'): React.ReactElement {
  return (
    <TrailLocaleProvider locale="ja">
      <CodeGraphPanel serverUrl="http://x" repoName={repoName} />
    </TrailLocaleProvider>
  );
}

function playback(): CodeGraphPlaybackViewState {
  return lastViewProps.playback as CodeGraphPlaybackViewState;
}

function selectedRelease(): string | undefined {
  return lastViewProps.selectedRelease as string | undefined;
}

function toggle(): void {
  act(() => {
    (lastViewProps.onPlaybackToggle as () => void)();
  });
}

/** 最小滞在時間（1x = 1000 ms）を 1 フレームぶん消化する。 */
function advanceFrame(ms = 1000): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  lastViewProps = {};
  useCodeGraphReleasesMock.mockReturnValue({ releases: RELEASES, refetch: jest.fn() });
  // 要求された時点のグラフが即座に載る（取得完了と描画完了の合流を模す）。
  useCodeGraphMock.mockImplementation((_url: string, options: { release?: string; commit?: string }) => ({
    graph: GRAPH,
    graphKey: options.commit ?? options.release ?? 'current',
    loading: false,
    error: null,
    refetch: jest.fn(),
  }));
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('CodeGraphPanel: Auto Playback', () => {
  it('在庫のある目盛りと「現在」だけを再生列にする（未生成は除外して件数を出す）', () => {
    render(panel());
    toggle();
    const state = playback();
    expect(state.status).toBe('playing');
    if (state.status !== 'playing') throw new Error('unreachable');
    expect(state.total).toBe(3);
    expect(state.skipped).toBe(1);
  });

  it('「現在」から再生すると先頭へ戻し、最小滞在時間ごとに次の時点を選ぶ', () => {
    render(panel());
    expect(selectedRelease()).toBe('current');

    toggle();
    expect(selectedRelease()).toBe('v1.18.0');

    advanceFrame();
    expect(selectedRelease()).toBe('v1.19.1');

    advanceFrame();
    expect(selectedRelease()).toBe('current');
  });

  it('最小滞在時間の前には次へ進まない', () => {
    render(panel());
    toggle();
    advanceFrame(999);
    expect(selectedRelease()).toBe('v1.18.0');
  });

  it('末尾で停止し、ループしない', () => {
    render(panel());
    toggle();
    advanceFrame();
    advanceFrame();
    expect(selectedRelease()).toBe('current');

    advanceFrame();
    const state = playback();
    expect(state.status).toBe('idle');
    if (state.status !== 'idle') throw new Error('unreachable');
    expect(state.result?.reason).toBe('completed');
    // 末尾で止まったのだから、選択は先頭へ巻き戻っていない。
    expect(selectedRelease()).toBe('current');
  });

  it('一時停止すると送りが止まり、帰結が残る', () => {
    render(panel());
    toggle();
    expect(selectedRelease()).toBe('v1.18.0');

    toggle();
    advanceFrame();
    advanceFrame();
    expect(selectedRelease()).toBe('v1.18.0');
    const state = playback();
    if (state.status !== 'idle') throw new Error('unreachable');
    expect(state.result?.reason).toBe('paused');
  });

  it('速度を変えると次のフレームの滞在時間が変わる', () => {
    render(panel());
    act(() => {
      (lastViewProps.onPlaybackSpeedChange as (s: string) => void)('4x');
    });
    toggle();
    expect(selectedRelease()).toBe('v1.18.0');
    advanceFrame(250);
    expect(selectedRelease()).toBe('v1.19.1');
  });

  it('取得に失敗した時点は飛ばし、失敗件数を数える', () => {
    // v1.18.0 だけ取得できない状態を作る。
    useCodeGraphMock.mockImplementation((_url: string, options: { release?: string; commit?: string }) => {
      const key = options.commit ?? options.release ?? 'current';
      if (key === 'v1.18.0') {
        return { graph: null, graphKey: null, loading: false, error: 'HTTP 500', refetch: jest.fn() };
      }
      return { graph: GRAPH, graphKey: key, loading: false, error: null, refetch: jest.fn() };
    });
    render(panel());
    toggle();
    // 失敗した時点は滞在せず、次の目盛りへ送られる。
    advanceFrame(0);
    expect(selectedRelease()).toBe('v1.19.1');
    const state = playback();
    if (state.status !== 'playing') throw new Error('unreachable');
    expect(state.failed).toBe(1);
  });

  it('連続 3 本の取得失敗で停止する', () => {
    useCodeGraphMock.mockImplementation(() => ({
      graph: null,
      graphKey: null,
      loading: false,
      error: 'HTTP 500',
      refetch: jest.fn(),
    }));
    render(panel());
    toggle();
    advanceFrame(0);
    advanceFrame(0);
    advanceFrame(0);
    const state = playback();
    expect(state.status).toBe('idle');
    if (state.status !== 'idle') throw new Error('unreachable');
    expect(state.result?.reason).toBe('failed');
  });

  it('リポジトリが変わると再生を止める', () => {
    const { rerender } = render(panel('repo'));
    toggle();
    expect(playback().status).toBe('playing');

    act(() => {
      rerender(panel('other'));
    });
    expect(playback().status).toBe('idle');
  });

  it('再生対象が 2 本未満なら unavailable を渡す', () => {
    useCodeGraphReleasesMock.mockReturnValue({ releases: [], refetch: jest.fn() });
    render(panel());
    expect(playback().status).toBe('unavailable');
    toggle();
    expect(playback().status).toBe('unavailable');
  });
});
