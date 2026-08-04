/**
 * @jest-environment jsdom
 *
 * Time Scrubber のうち「状態の正が React ラッパ側にある」振る舞いを固定する。
 * 描画は vanilla view のテストが持つため、ここでは island を差し替えて
 * ラッパが渡す値だけを見る。
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
// vanilla island は mount 副作用を持つため、props を捕まえるだけのダミーへ差し替える。
jest.mock('../../shared/vanillaIsland', () => ({
  VanillaIsland: (props: { props: Record<string, unknown> }) => {
    lastViewProps = props.props;
    return null;
  },
}));

import { act, render } from '@testing-library/react';
import { CodeGraphPanel } from '../CodeGraphPanel';
import { TrailLocaleProvider } from '../../i18n';

let lastViewProps: Record<string, unknown> = {};

/** パネルは useTrailI18n を使うため Provider 必須。素の render は実行時に throw する。 */
function panel(repoName = 'repo'): React.ReactElement {
  return (
    <TrailLocaleProvider locale="ja">
      <CodeGraphPanel serverUrl="http://x" repoName={repoName} />
    </TrailLocaleProvider>
  );
}

const RELEASES = [
  { tag: 'v1.14.0', releasedAt: '2026-07-17T07:38:41.000Z', hasGraph: true },
  { tag: 'v1.15.0', releasedAt: '2026-07-17T21:46:09.000Z', hasGraph: false },
];

/**
 * 本体グラフ取得が受け取った options（release の実値）を返す。
 *
 * State Replay の追加で `useCodeGraph` は 1 レンダーにつき 2 回呼ばれるようになった
 * （1 回目 = 表示するグラフ、2 回目 = 差分のベースライン）。フック呼び出しの順序は
 * React が保証するため、最後のレンダーの 1 回目を本体として取る。末尾を取ると
 * ベースライン側の release を本体と取り違える。
 */
const USE_CODE_GRAPH_CALLS_PER_RENDER = 2;

function lastRequestedRelease(): string | undefined {
  const calls = useCodeGraphMock.mock.calls;
  // 呼び出し数が 1 レンダー 2 回でなくなったら、以降このヘルパは別の呼び出しを
  // 検査し続けて何も守らなくなる。前提が崩れたことを黙らせず、ここで落とす。
  expect(calls.length % USE_CODE_GRAPH_CALLS_PER_RENDER).toBe(0);
  const main = calls[calls.length - USE_CODE_GRAPH_CALLS_PER_RENDER];
  return (main?.[1] as { release?: string } | undefined)?.release;
}

describe('CodeGraphPanel: Time Scrubber の状態管理', () => {
  beforeEach(() => {
    lastViewProps = {};
    useCodeGraphMock.mockReset();
    useCodeGraphReleasesMock.mockReset();
    useCodeGraphMock.mockReturnValue({ graph: null, loading: false, error: null, refetch: jest.fn() });
    useCodeGraphReleasesMock.mockReturnValue({
      releases: RELEASES,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('初期表示は現在のスナップショットを要求する', () => {
    render(panel());
    expect(lastRequestedRelease()).toBe('current');
  });

  it('選択したタグをそのまま取得へ渡す', () => {
    render(panel());
    const onReleaseChange = lastViewProps.onReleaseChange as (r: string) => void;
    act(() => onReleaseChange('v1.14.0'));
    expect(lastRequestedRelease()).toBe('v1.14.0');
  });

  it('選択中のタグが一覧から消えたら現在へ戻し、取得タグも戻す', () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.14.0'));
    expect(lastRequestedRelease()).toBe('v1.14.0');

    // 一覧が入れ替わり、選択中のタグが消える（別リポジトリの一覧が届いた場合など）。
    useCodeGraphReleasesMock.mockReturnValue({
      releases: [{ tag: 'v2.0.0', releasedAt: '2026-08-01T00:00:00.000Z', hasGraph: true }],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    rerender(panel());

    expect(lastRequestedRelease()).toBe('current');
    expect(lastViewProps.selectedRelease).toBe('current');
  });

  it('一覧が空（取得失敗の縮退）では選択を壊さない', () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.14.0'));

    useCodeGraphReleasesMock.mockReturnValue({
      releases: [], loading: false, error: 'boom', refetch: jest.fn(),
    });
    rerender(panel());

    expect(lastRequestedRelease()).toBe('v1.14.0');
  });

  it('リポジトリを切り替えると現在へ戻す', () => {
    const { rerender } = render(panel());
    act(() => (lastViewProps.onReleaseChange as (r: string) => void)('v1.14.0'));
    expect(lastRequestedRelease()).toBe('v1.14.0');

    rerender(panel("other-repo"));
    expect(lastRequestedRelease()).toBe('current');
  });
});
