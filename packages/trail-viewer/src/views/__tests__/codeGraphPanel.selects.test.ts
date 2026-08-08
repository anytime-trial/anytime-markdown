/**
 * コードグラフパネルのドロップダウンが共通部品（ui-core `createSelect`）で作られていることを固定する。
 *
 * 回帰の出所（2026-08-05）: 配色セレクタと速度セレクタだけが生の `<select>` で
 * `background:transparent; color:inherit` を当てていた。ダークテーマでは文字色が白を継承する
 * 一方、ネイティブのドロップダウン popup は OS 既定の白背景で描かれるため、
 * **白地に白文字で選択肢が読めなかった**。
 *
 * この症状は jsdom で再現できない（ネイティブ popup が無い）。そのため症状ではなく原因
 * ——生の `<select>` を使っていること——を検査する。
 */
jest.mock('sigma', () => ({ __esModule: true, default: class {} }));
jest.mock('sigma/rendering', () => ({ __esModule: true, EdgeArrowProgram: class {} }));

import type { CodeGraph } from '@anytime-markdown/trail-core/codeGraph';
import { mountCodeGraphPanel, type CodeGraphPanelProps } from '../codeGraphPanel';

const GRAPH: CodeGraph = {
  generatedAt: '2026-08-05T00:00:00.000Z',
  repositories: [{ id: 'r', label: 'r', path: '/tmp/r' }],
  nodes: [],
  edges: [],
  communities: {},
  godNodes: [],
};

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
    releases: [
      { tag: 'v1.18.0', releasedAt: '2026-08-01T00:00:00.000Z', hasGraph: true },
      { tag: 'v1.19.1', releasedAt: '2026-08-03T00:00:00.000Z', hasGraph: true },
    ],
    selectedRelease: 'current',
    playback: { status: 'idle', speed: '1x' },
    ...overrides,
  };
}

function mount(props: CodeGraphPanelProps) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCodeGraphPanel(container, props);
  return { container, handle };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('codeGraphPanel: ドロップダウン', () => {
  it('生の <select> を使わない（ネイティブ popup の OS 依存配色を持ち込まない）', () => {
    const view = mount(baseProps());
    expect(view.container.querySelector('select')).toBeNull();
  });

  it('配色は combobox として引ける', () => {
    const view = mount(baseProps());
    const el = view.container.querySelector('[data-testid="code-graph-color-by"]');
    expect(el).toBeTruthy();
    expect(el!.getAttribute('role')).toBe('combobox');
  });

  it('速度は combobox として引ける', () => {
    const view = mount(baseProps());
    const el = view.container.querySelector('[data-testid="code-graph-playback-speed"]');
    expect(el).toBeTruthy();
    expect(el!.getAttribute('role')).toBe('combobox');
  });
});
