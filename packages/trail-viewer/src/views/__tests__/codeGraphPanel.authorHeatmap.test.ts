// sigma は jsdom で import すると WebGL2RenderingContext 未定義で落ちるため差し替える。
// パネルは canvas を mount するが、canvas 側は 2d コンテキストが取れない環境では
// Sigma 初期化をスキップするため、この差し替えで描画経路には触れない。
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

import type { CodeGraph, CodeGraphNode } from '@anytime-markdown/trail-core/codeGraph';
import type { AuthorHeatmapEntry } from '@anytime-markdown/trail-core/authorHeatmap';
import { chooseOption, openOptions } from './comboboxTestUtils';
import { mountCodeGraphPanel, type CodeGraphPanelProps } from '../codeGraphPanel';

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

const graph: CodeGraph = {
  generatedAt: '2026-08-03T00:00:00.000Z',
  repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
  nodes: [node('r:a'), node('r:b'), node('r:c')],
  edges: [],
  communities: { 0: 'c' },
  godNodes: [],
};

const entries: AuthorHeatmapEntry[] = [
  {
    nodeId: 'r:a',
    lastEditorSessionId: '11111111-aaaa-bbbb-cccc-dddddddddddd',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    commitCount: 1,
    sessionCount: 1,
    topSessionShare: 1,
  },
  {
    nodeId: 'r:b',
    lastEditorSessionId: '22222222-aaaa-bbbb-cccc-dddddddddddd',
    lastEditedAt: '2026-01-02T00:00:00.000Z',
    commitCount: 12,
    sessionCount: 3,
    topSessionShare: 0.4,
  },
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
  select: HTMLElement;
  legendText: () => string;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCodeGraphPanel(container, props);
  const select = container;
  // 凡例は testid で引く。スタイル文字列（0.65rem）で引くと Time Scrubber の凡例など
  // 同じ字送りの別要素を先に拾ってしまう。
  const legend = () =>
    container.querySelector<HTMLElement>('[data-testid="code-graph-legend"]')?.textContent ?? '';
  return { container, handle, select, legendText: legend };
}

function selectColorBy(container: HTMLElement, value: string): void {
  const labels: Record<string, string> = {
    community: 'コミュニティ',
    layer: '層',
    lastEditor: '最終編集者',
    editFrequency: '編集頻度',
    diff: '前版との差分',
  };
  const label = labels[value];
  if (!label) throw new Error(`unknown colorBy: ${value}`);
  chooseOption(container, 'code-graph-color-by', label);
}

describe('codeGraphPanel: Author Heatmap の配色セレクタと凡例', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('配色セレクタに 5 つの選択肢が並ぶ', () => {
    const { select, handle } = mount(baseProps());
    expect(openOptions(select, 'code-graph-color-by').map((o) => o.label)).toEqual([
      'コミュニティ',
      '層',
      '最終編集者',
      '編集頻度',
      // State Replay（前版との差分）。ベースラインが無い間は disabled で並ぶ。
      '前版との差分',
    ]);
    handle.destroy();
  });

  it('配色を変えると onColorByChange で通知される（取得の要否をラッパが判断できる）', () => {
    const seen: string[] = [];
    const { select, handle } = mount(baseProps({ onColorByChange: (v) => seen.push(v) }));
    selectColorBy(select, 'lastEditor');
    selectColorBy(select, 'editFrequency');
    selectColorBy(select, 'community');
    expect(seen).toEqual(['lastEditor', 'editFrequency', 'community']);
    handle.destroy();
  });

  it('同じ値を選び直しても再通知しない', () => {
    const seen: string[] = [];
    const { select, handle } = mount(baseProps({ onColorByChange: (v) => seen.push(v) }));
    selectColorBy(select, 'lastEditor');
    selectColorBy(select, 'lastEditor');
    expect(seen).toEqual(['lastEditor']);
    handle.destroy();
  });

  it('community 配色では凡例を出さない', () => {
    const { container, handle } = mount(baseProps());
    const legend = container.querySelector<HTMLElement>('[data-testid="code-graph-legend"]');
    expect(legend?.style.display).toBe('none');
    handle.destroy();
  });

  it('最終編集者の凡例に上位セッション・その他・記録なし・注記が並ぶ', () => {
    const { select, handle, legendText } = mount(
      baseProps({
        authorHeatmap: {
          entries,
          topSessions: [entries[0].lastEditorSessionId, entries[1].lastEditorSessionId],
          coveredNodes: 2,
          totalNodes: 3,
        },
      }),
    );
    selectColorBy(select, 'lastEditor');
    const text = legendText();
    expect(text).toContain('11111111');
    expect(text).toContain('22222222');
    expect(text).toContain('その他');
    expect(text).toContain('記録なし');
    expect(text).toContain('セッション（作業単位）');
    handle.destroy();
  });

  it('凡例に並ぶセッションはパレット数（8）で打ち切る（配色と凡例をずらさない）', () => {
    const many = Array.from({ length: 12 }, (_, i) => `sess${String(i).padStart(4, '0')}-xxxx`);
    const { select, handle, legendText } = mount(
      baseProps({
        authorHeatmap: { entries, topSessions: many, coveredNodes: 2, totalNodes: 3 },
      }),
    );
    selectColorBy(select, 'lastEditor');
    const text = legendText();
    expect(text).toContain('sess0007');
    expect(text).not.toContain('sess0008');
    expect(text).toContain('その他');
    handle.destroy();
  });

  it('被覆率は応答の値から算出して表示する', () => {
    const { select, handle, legendText } = mount(
      baseProps({
        authorHeatmap: { entries, topSessions: [], coveredNodes: 1493, totalNodes: 2444 },
      }),
    );
    selectColorBy(select, 'lastEditor');
    expect(legendText()).toContain('1493 / 2444 (61%)');
    handle.destroy();
  });

  it('編集頻度の凡例は 3 段階と記録なしを出す', () => {
    const { select, handle, legendText } = mount(
      baseProps({
        authorHeatmap: { entries, topSessions: [], coveredNodes: 2, totalNodes: 3 },
      }),
    );
    selectColorBy(select, 'editFrequency');
    const text = legendText();
    expect(text).toContain('低（1〜2 コミット）');
    expect(text).toContain('中（3〜8 コミット）');
    expect(text).toContain('高（9 コミット以上）');
    expect(text).toContain('記録なし');
    handle.destroy();
  });

  it('集計が未取得でも凡例が出てパネルが壊れない（取得失敗時の縮退）', () => {
    const { select, handle, legendText } = mount(baseProps({ authorHeatmap: null }));
    selectColorBy(select, 'lastEditor');
    expect(legendText()).toContain('記録なし');
    handle.destroy();
  });

  it('community へ戻すと凡例が消える', () => {
    const { container, select, handle } = mount(
      baseProps({
        authorHeatmap: { entries, topSessions: [], coveredNodes: 2, totalNodes: 3 },
      }),
    );
    selectColorBy(select, 'lastEditor');
    selectColorBy(select, 'community');
    const legend = container.querySelector<HTMLElement>('[data-testid="code-graph-legend"]');
    expect(legend?.style.display).toBe('none');
    handle.destroy();
  });

  it('i18n translator が注入されればそちらのラベルを使う', () => {
    const { select, handle } = mount(
      baseProps({ t: (key) => (key === 'codeGraph.colorBy.lastEditor' ? 'Last editor' : key) }),
    );
    const labels = openOptions(select, 'code-graph-color-by').map((o) => o.label);
    expect(labels).toContain('Last editor');
    handle.destroy();
  });
});
