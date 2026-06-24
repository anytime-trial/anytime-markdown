/**
 * c4ElementTreePanel — type icon rendering.
 * Runs in jsdom. Verifies C4 element type は紛らわしいテキストバッジ(S/C/Co)ではなく
 * 種別ごとに区別できる SVG アイコン + tooltip で描画される。
 */
import { mountC4ElementTree, typeIconPath, typeLabel, type C4ElementTreeColors } from '../c4ElementTreePanel';

const colors: C4ElementTreeColors = {
  bg: '#fff',
  bgSecondary: '#eee',
  border: '#ccc',
  accent: '#08c',
  hover: '#f5f5f5',
  text: '#222',
  textMuted: '#888',
  textSecondary: '#666',
  selected: '#def',
};

// 最小ツリー: System > Container > Component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tree: any = [
  {
    id: 'sys1', type: 'system', name: 'anytime-markdown', children: [
      {
        id: 'ctr1', type: 'container', name: 'agent-core', children: [
          { id: 'cmp1', type: 'component', name: 'adapters', children: [] },
        ],
      },
    ],
  },
];

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    tree,
    dispatch: jest.fn(),
    colors,
    t: (k: string) => k,
    ...overrides,
  };
}

describe('c4ElementTreePanel / type → icon・label mapping', () => {
  // [type, expected label] — 全 C4TreeNode タイプを網羅
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['person', 'Person'],
    ['system', 'System'],
    ['boundary', 'System'],       // boundary は system に寄せる
    ['container', 'Container'],
    ['containerDb', 'Container (DB)'],
    ['component', 'Component'],
    ['code', 'Code'],
    ['community', 'Community'],
  ];

  it.each(cases)('type=%s → label "%s" かつ非空のアイコンパス', (type, label) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeLabel(type as any)).toBe(label);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeIconPath(type as any)).toMatch(/^M/); // SVG path は M で始まる
  });

  it('containerDb は通常 container と別アイコン（DB を区別）', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeIconPath('containerDb' as any)).not.toBe(typeIconPath('container' as any));
  });

  it('boundary は system と同一アイコンに寄せる', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeIconPath('boundary' as any)).toBe(typeIconPath('system' as any));
  });

  it('未知タイプは system アイコンへフォールバック', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeIconPath('__unknown__' as any)).toBe(typeIconPath('system' as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeLabel('__unknown__' as any)).toBe('Element');
  });
});

describe('c4ElementTreePanel / type icons', () => {
  let container: HTMLElement;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
  afterEach(() => { document.body.removeChild(container); });

  it('種別バッジをテキスト(S/C/Co)でなく SVG アイコンで描画する', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = mountC4ElementTree(container, makeProps() as any);
    const svgs = container.querySelectorAll('svg[role="img"]');
    expect(svgs.length).toBeGreaterThanOrEqual(3); // system + container + component
    // 種別バッジ span は SVG を内包し、紛らわしいテキストバッジ(S/C/Co)を持たない
    const badgeSpans = Array.from(container.querySelectorAll('span[title]'));
    expect(badgeSpans.length).toBeGreaterThanOrEqual(3);
    for (const span of badgeSpans) {
      expect(span.querySelector('svg')).toBeTruthy();
      expect((span.textContent ?? '').trim()).toBe('');
    }
    handle.destroy();
  });

  it('各種別を aria-label / tooltip で区別できる（色のみ依存しない三重表現）', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = mountC4ElementTree(container, makeProps() as any);
    const labels = Array.from(container.querySelectorAll('svg[role="img"]'))
      .map((s) => s.getAttribute('aria-label'));
    expect(labels).toEqual(expect.arrayContaining(['System', 'Container', 'Component']));
    // tooltip(title) も付与される
    const tooltips = Array.from(container.querySelectorAll('span[title]')).map((s) => s.getAttribute('title'));
    expect(tooltips).toEqual(expect.arrayContaining(['System', 'Container', 'Component']));
    handle.destroy();
  });
});
