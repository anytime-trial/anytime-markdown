/**
 * @jest-environment jsdom
 *
 * コミット粒度へのズーム（Snapshot per Commit）のうち、状態の正が React ラッパ側にある
 * 振る舞いを固定する。描画は vanilla view のテストが持つため、island は差し替えて
 * ラッパが渡す値と、取得フックへ渡す引数だけを見る。
 */
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

const useCodeGraphMock = jest.fn();
const useCodeGraphReleasesMock = jest.fn();
const useCodeGraphCommitsMock = jest.fn();

jest.mock('../../hooks/useCodeGraph', () => ({
  useCodeGraph: (...args: unknown[]) => useCodeGraphMock(...args),
}));
jest.mock('../../hooks/useCodeGraphReleases', () => ({
  useCodeGraphReleases: (...args: unknown[]) => useCodeGraphReleasesMock(...args),
}));
jest.mock('../../hooks/useCodeGraphCommits', () => ({
  useCodeGraphCommits: (...args: unknown[]) => useCodeGraphCommitsMock(...args),
}));
jest.mock('../../hooks/useAuthorHeatmap', () => ({
  useAuthorHeatmap: (...args: unknown[]) => {
    authorHeatmapCalls.push(args[0] as Record<string, unknown>);
    return { data: null, loading: false, error: null };
  },
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

import { act, render, waitFor } from '@testing-library/react';
import { CodeGraphPanel } from '../CodeGraphPanel';
import { TrailLocaleProvider } from '../../i18n';

let lastViewProps: Record<string, unknown> = {};
let authorHeatmapCalls: Record<string, unknown>[] = [];

function panel(repoName = 'repo'): React.ReactElement {
  return (
    <TrailLocaleProvider locale="ja">
      <CodeGraphPanel serverUrl="http://x" repoName={repoName} />
    </TrailLocaleProvider>
  );
}

const RELEASES = [
  { tag: 'v1.14.0', releasedAt: '2026-07-17T07:38:41.000Z', hasGraph: true },
  { tag: 'v1.15.0', releasedAt: '2026-07-17T21:46:09.000Z', hasGraph: true },
];

const SHA_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const COMMITS = [
  { sha: SHA_A, shortSha: 'aaaaaaaa', committedAt: '2026-07-17T09:00:00.000Z', subject: 'feat: A', hasGraph: true },
  { sha: SHA_B, shortSha: 'bbbbbbbb', committedAt: '2026-07-17T10:00:00.000Z', subject: 'fix: B', hasGraph: false },
];

/** 本体グラフ取得（1 レンダーにつき 1 回目）が受け取った options。2 回目はベースライン。 */
const USE_CODE_GRAPH_CALLS_PER_RENDER = 2;

function lastGraphOptions(): { release?: string; commit?: string; enabled?: boolean } {
  const calls = useCodeGraphMock.mock.calls;
  expect(calls.length % USE_CODE_GRAPH_CALLS_PER_RENDER).toBe(0);
  const main = calls[calls.length - USE_CODE_GRAPH_CALLS_PER_RENDER];
  return (main?.[1] ?? {}) as { release?: string; commit?: string; enabled?: boolean };
}

function lastBaselineOptions(): { release?: string; commit?: string; enabled?: boolean } {
  const calls = useCodeGraphMock.mock.calls;
  return (calls[calls.length - 1]?.[1] ?? {}) as { release?: string; commit?: string; enabled?: boolean };
}

function lastCommitsOptions(): { enabled?: boolean; repo?: string; to?: string; from?: string | null } {
  const calls = useCodeGraphCommitsMock.mock.calls;
  return (calls[calls.length - 1]?.[1] ?? {}) as {
    enabled?: boolean; repo?: string; to?: string; from?: string | null;
  };
}

function setCommits(commits: unknown[], loading = false): void {
  useCodeGraphCommitsMock.mockReturnValue({
    commits, loading, error: null, refetch: refetchCommitsMock,
  });
}

const refetchCommitsMock = jest.fn();

function zoomIn(): void {
  act(() => (lastViewProps.onZoomToCommits as () => void)());
}

describe('CodeGraphPanel: コミット粒度へのズーム', () => {
  beforeEach(() => {
    lastViewProps = {};
    authorHeatmapCalls = [];
    refetchCommitsMock.mockReset();
    useCodeGraphMock.mockReset();
    useCodeGraphReleasesMock.mockReset();
    useCodeGraphCommitsMock.mockReset();
    useCodeGraphMock.mockReturnValue({
      graph: null, graphKey: null, loading: false, error: null, refetch: jest.fn(),
    });
    useCodeGraphReleasesMock.mockReturnValue({
      releases: RELEASES, loading: false, error: null, refetch: jest.fn(),
    });
    setCommits([]);
  });

  it('リリースを選んでズームすると、前のリリース..選択リリースの区間で一覧を取りに行く', () => {
    render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    expect(lastCommitsOptions()).toMatchObject({
      enabled: true, repo: 'repo', to: 'v1.15.0', from: 'v1.14.0',
    });
  });

  it('最古のリリースへズームすると区間の下端を送らない（最古から）', () => {
    render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.14.0'));
    zoomIn();
    expect(lastCommitsOptions().to).toBe('v1.14.0');
    expect(lastCommitsOptions().from).toBeNull();
  });

  it('「現在」からはズームしない（区間の上端が決まらない）', () => {
    render(panel());
    zoomIn();
    expect(lastViewProps.granularity).toBe('release');
    expect(lastCommitsOptions().enabled).toBe(false);
  });

  it('一覧が届くと区間の上端コミットを選び、そのコミットのグラフを要求する', async () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));
    expect(lastGraphOptions().commit).toBe(SHA_B);
  });

  it('選んだコミットが変わると取得も追従する', async () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));
    act(() => (lastViewProps.onCommitChange as (sha: string) => void)(SHA_A));
    expect(lastGraphOptions().commit).toBe(SHA_A);
  });

  it('ベースラインは 1 つ前のコミット（生成要求用に完全な SHA、表示は短縮 SHA）', async () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));
    expect(lastViewProps.baseline).toEqual({ tag: SHA_A, label: 'aaaaaaaa', hasGraph: true });
  });

  it('区間の先頭コミットにはベースラインが無い', async () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));
    act(() => (lastViewProps.onCommitChange as (sha: string) => void)(SHA_A));
    expect(lastViewProps.baseline).toBeNull();
  });

  it('コミット粒度のベースラインは release ではなく commit で取りに行く', async () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));
    act(() => (lastViewProps.onColorByChange as (c: string) => void)('diff'));
    const baselineOptions = lastBaselineOptions();
    expect(baselineOptions.commit).toBe(SHA_A);
    expect(baselineOptions.enabled).toBe(true);
  });

  it('一覧の取得中は直前のリリースのグラフを出さない', () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits([], true);
    rerender(panel());
    expect(lastViewProps.graphState).toEqual({ status: 'loading' });
  });

  it('リリース粒度へ戻すと選択リリースの取得へ復帰する', async () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));

    act(() => (lastViewProps.onZoomToReleases as () => void)());
    expect(lastViewProps.granularity).toBe('release');
    expect(lastViewProps.selectedCommit).toBeNull();
    expect(lastGraphOptions().release).toBe('v1.15.0');
    expect(lastGraphOptions().commit).toBeUndefined();
  });

  it('コミット粒度では Author Heatmap の集計を取りに行かない', async () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));
    act(() => (lastViewProps.onColorByChange as (c: string) => void)('lastEditor'));
    expect(authorHeatmapCalls[authorHeatmapCalls.length - 1]?.enabled).toBe(false);
  });

  it('リポジトリを切り替えるとズームを解除する（区間は前のリポジトリのタグで定義されている）', async () => {
    const { rerender } = render(panel('repo'));
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel('repo'));
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));

    rerender(panel('other-repo'));
    await waitFor(() => expect(lastViewProps.granularity).toBe('release'));
    expect(lastViewProps.selectedRelease).toBe('current');
    expect(lastCommitsOptions().enabled).toBe(false);
  });

  it('区間の上端リリースが一覧から消えたらズームを解除する', async () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));

    useCodeGraphReleasesMock.mockReturnValue({
      releases: [{ tag: 'v2.0.0', releasedAt: '2026-08-01T00:00:00.000Z', hasGraph: true }],
      loading: false, error: null, refetch: jest.fn(),
    });
    rerender(panel());
    await waitFor(() => expect(lastViewProps.granularity).toBe('release'));
    expect(lastGraphOptions().release).toBe('current');
  });

  // 粒度を切り替えるとベースラインは未生成（hasGraph:false）のことが多く、フックは
  // 直前のグラフを保持し続ける。突き合わせないと前の時点との差分を今の差分として描く。
  it('保持しているベースラインが今のベースラインでなければ差分を出さない', async () => {
    const staleGraph = {
      generatedAt: '2026-08-01T00:00:00.000Z',
      repositories: [], nodes: [], edges: [], communities: {}, godNodes: [],
    };
    // 本体・ベースラインとも「前のリリースのグラフを保持したまま」の状態を模す。
    useCodeGraphMock.mockReturnValue({
      graph: staleGraph, graphKey: 'v1.15.0', loading: false, error: null, refetch: jest.fn(),
    });
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    // 1 つ前のコミットは未生成（hasGraph:false）なので、ベースラインの取得は走らない。
    setCommits([COMMITS[0], { ...COMMITS[0], sha: SHA_B, shortSha: 'bbbbbbbb', hasGraph: false }]);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));
    act(() => (lastViewProps.onColorByChange as (c: string) => void)('diff'));

    expect(lastViewProps.diff).toBeNull();
  });

  it('コミット一覧の取得失敗を描画層へ伝える（空と区別させる）', () => {
    useCodeGraphCommitsMock.mockReturnValue({
      commits: [], loading: false, error: 'Error: HTTP 500', refetch: refetchCommitsMock,
    });
    render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    expect(lastViewProps.commitsError).toBe('Error: HTTP 500');
  });

  it('コミット生成は repo と sha を送り、完了後にコミット一覧を取り直す', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response),
    );
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    // WebSocket 未提供の環境（進捗が拾えないだけで生成自体は成立する）を模す。
    (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket = undefined;

    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.15.0'));
    zoomIn();
    setCommits(COMMITS);
    rerender(panel());
    await waitFor(() => expect(lastViewProps.selectedCommit).toBe(SHA_B));

    await act(async () => {
      (lastViewProps.onGenerateCommit as (sha: string) => void)(SHA_B);
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/api/analyze/commit');
    expect(JSON.parse(String(init.body))).toEqual({ repo: 'repo', sha: SHA_B });
    await waitFor(() => expect(refetchCommitsMock).toHaveBeenCalled());
  });
});
