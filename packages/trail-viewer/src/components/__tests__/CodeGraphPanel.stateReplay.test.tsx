/**
 * @jest-environment jsdom
 *
 * State Replay のうち「状態の正が React ラッパ側にある」振る舞いを固定する。
 * ベースラインの決め方と、差分を計算する条件（＝ベースラインのグラフを取りに行く条件）。
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
import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import type { CodeGraphDiff } from '@anytime-markdown/trail-core/codeGraphDiff';
import { CodeGraphPanel } from '../CodeGraphPanel';
import { TrailLocaleProvider } from '../../i18n';

let lastViewProps: Record<string, unknown> = {};

function panel(repoName = 'repo'): React.ReactElement {
  return (
    <TrailLocaleProvider locale="ja">
      <CodeGraphPanel serverUrl="http://x" repoName={repoName} />
    </TrailLocaleProvider>
  );
}

function node(id: string): CodeGraphNode {
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
  };
}

function graph(ids: string[]): CodeGraph {
  return {
    generatedAt: '2026-08-04T00:00:00.000Z',
    repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
    nodes: ids.map(node),
    edges: [],
    communities: { 0: 'c' },
    godNodes: [],
  };
}

// released_at 昇順。v1.16.0 は未生成。
const RELEASES = [
  { tag: 'v1.14.0', releasedAt: '2026-07-17T07:38:41.000Z', hasGraph: true },
  { tag: 'v1.15.0', releasedAt: '2026-07-17T21:46:09.000Z', hasGraph: true },
  { tag: 'v1.16.0', releasedAt: '2026-07-20T00:00:00.000Z', hasGraph: false },
];

function baselineProp(): { tag: string; hasGraph: boolean } | null {
  return lastViewProps.baseline as { tag: string; hasGraph: boolean } | null;
}

/** ベースライン取得の呼び出し（enabled: true で release を指定しているもの）。 */
function baselineFetchCalls(): Array<{ release?: string; enabled?: boolean }> {
  return useCodeGraphMock.mock.calls.map(
    (c) => (c[1] ?? {}) as { release?: string; enabled?: boolean },
  );
}

function selectDiffMode(): void {
  const onColorByChange = lastViewProps.onColorByChange as (mode: string) => void;
  act(() => {
    onColorByChange('diff');
  });
}

describe('CodeGraphPanel: State Replay の状態管理', () => {
  beforeEach(() => {
    lastViewProps = {};
    useCodeGraphMock.mockReset();
    useCodeGraphReleasesMock.mockReset();
    useCodeGraphMock.mockReturnValue({
      graph: graph(['keep']),
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    useCodeGraphReleasesMock.mockReturnValue({
      releases: RELEASES,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('uses the newest release that actually has a graph as the baseline for "current"', () => {
    render(panel());

    // v1.16.0 は未生成なので、在庫のある v1.15.0 まで遡る。
    expect(baselineProp()?.tag).toBe('v1.15.0');
  });

  it('uses the immediately preceding tick as the baseline for a past release', () => {
    render(panel());
    const onReleaseChange = lastViewProps.onReleaseChange as (tag: string) => void;
    act(() => {
      onReleaseChange('v1.15.0');
    });

    expect(baselineProp()?.tag).toBe('v1.14.0');
  });

  it('reports the ungenerated predecessor so the view can offer to generate it', () => {
    render(panel());
    const onReleaseChange = lastViewProps.onReleaseChange as (tag: string) => void;
    act(() => {
      onReleaseChange('v1.16.0');
    });

    expect(baselineProp()).toEqual({
      tag: 'v1.15.0',
      releasedAt: '2026-07-17T21:46:09.000Z',
      hasGraph: true,
    });
  });

  it('has no baseline at the oldest tick', () => {
    render(panel());
    const onReleaseChange = lastViewProps.onReleaseChange as (tag: string) => void;
    act(() => {
      onReleaseChange('v1.14.0');
    });

    expect(baselineProp()).toBeNull();
  });

  it('has no baseline when the release list is empty', () => {
    useCodeGraphReleasesMock.mockReturnValue({
      releases: [],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    render(panel());

    expect(baselineProp()).toBeNull();
  });

  // ベースラインのグラフは 1 本 2 MB ある。差分を見ていない間に取りに行かせない。
  it('does not fetch the baseline graph until the diff mode is selected', () => {
    render(panel());

    const enabledBaselineFetches = baselineFetchCalls().filter(
      (o) => o.enabled === true && o.release === 'v1.15.0',
    );
    expect(enabledBaselineFetches).toEqual([]);
  });

  it('fetches the baseline graph once the diff mode is selected', () => {
    render(panel());
    selectDiffMode();

    const enabledBaselineFetches = baselineFetchCalls().filter(
      (o) => o.enabled === true && o.release === 'v1.15.0',
    );
    expect(enabledBaselineFetches.length).toBeGreaterThan(0);
  });

  it('passes no diff while another colour mode is selected', () => {
    render(panel());

    expect(lastViewProps.diff).toBeNull();
  });

  it('computes the diff from the baseline graph and the selected graph', () => {
    // 1 本目（対象）と 2 本目（ベースライン）で別のグラフを返す。
    useCodeGraphMock.mockImplementation((_url: string, opts: { release?: string }) => ({
      graph: opts.release === 'v1.15.0' ? graph(['keep', 'gone']) : graph(['keep', 'fresh']),
      loading: false,
      error: null,
      refetch: jest.fn(),
    }));
    render(panel());
    selectDiffMode();

    const diff = lastViewProps.diff as CodeGraphDiff | null;
    expect(diff).not.toBeNull();
    expect(diff?.counts).toEqual({ added: 1, removed: 1, changed: 0, unchanged: 1 });
  });

  it('passes no diff when the baseline graph has not arrived yet', () => {
    useCodeGraphMock.mockImplementation((_url: string, opts: { release?: string }) => ({
      graph: opts.release === 'v1.15.0' ? null : graph(['keep']),
      loading: false,
      error: null,
      refetch: jest.fn(),
    }));
    render(panel());
    selectDiffMode();

    expect(lastViewProps.diff).toBeNull();
  });
});
