/**
 * @jest-environment jsdom
 */
import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION, computeSpecHash, type CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';
import { createFilterPanel } from '../ui/FilterPanel';
import { createWordListPanel } from '../ui/WordListPanel';
import { createCooccurrenceT } from '../i18n/createCooccurrenceT';

function file(): CooccurrenceFile {
  const base: CooccurrenceFile = {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [{ label: 'Alpha', frequency: 3 }, { label: 'Beta', frequency: 2 }],
      links: [[0, 1, 4]],
      clusters: [{ label: 'A', members: [0] }, { label: 'B', members: [1] }],
    },
  };
  base.layout = {
    positions: [[0, 0], [50, 0]],
    specHash: computeSpecHash(base.spec),
    algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  };
  return base;
}

function query(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`要素が見つからない: ${selector}`);
  return element;
}

/**
 * ボタン要素は UA 既定（白背景 `buttonface`・`2px outset` の枠・中央寄せ・内容幅）を持つ。
 * 打ち消しが漏れると、暗いテーマの前景色のまま白地に描かれて文字が読めなくなる。
 *
 * jsdom の制約: `var(--x)` を含む宣言は解決されず空文字を返す。そのため「個別スタイルが
 * 土台に潰されていないこと」は、具体値ではなく「土台の枠なしに落ちていないこと」
 * （`0px` でないこと）で検査する。実際の色は実機で確認する。
 */
describe('ボタンの UA 既定スタイルを打ち消す', () => {
  beforeEach(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(window, 'requestAnimationFrame', { value: jest.fn(() => 1), configurable: true });
    Object.defineProperty(window, 'cancelAnimationFrame', { value: jest.fn(), configurable: true });
    Object.defineProperty(window, 'ResizeObserver', {
      value: class { observe(): void {} disconnect(): void {} },
      configurable: true,
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    mountCooccurrenceViewer(container, { file: file(), themeMode: 'dark' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
    document.head.replaceChildren();
  });

  it('語一覧の行が UA 既定の白背景・枠・中央寄せを持たない', () => {
    const computed = getComputedStyle(query('.cooc-words__row'));

    expect(computed.backgroundColor).not.toBe('buttonface');
    expect(computed.borderTopWidth).toBe('0px');
    expect(computed.borderLeftWidth).toBe('0px');
    expect(computed.borderRightWidth).toBe('0px');
    expect(computed.textAlign).toBe('left');
  });

  it('語一覧の行が親の幅いっぱいに広がる（内容幅で行ごとに変わらない）', () => {
    expect(getComputedStyle(query('.cooc-words__row')).width).toBe('100%');
  });

  it('語一覧の行の下線が土台の枠なしに潰されない', () => {
    expect(getComputedStyle(query('.cooc-words__row')).borderBottomWidth).not.toBe('0px');
  });

  it.each([
    ['ツールバー', '.cooc-viewer__button'],
    ['語一覧の操作', '.cooc-words__button'],
  ])('%sボタンの枠が土台に潰されない（土台が個別スタイルより先に挿入されている）', (_name, selector) => {
    expect(getComputedStyle(query(selector)).borderTopWidth).not.toBe('0px');
  });

  it('土台のスタイルは重複して挿入されない', () => {
    expect(document.querySelectorAll('#cooccurrence-button-base-style')).toHaveLength(1);
  });

  it.each<[string, () => { destroy(): void }]>([
    ['絞り込み', () => createFilterPanel({
      file: file(),
      counts: { visibleNodeCount: 2, totalNodeCount: 2, visibleLinkCount: 1, totalLinkCount: 1 },
      t: createCooccurrenceT('Cooccurrence', 'ja'),
      onFilterChange: jest.fn(),
    })],
    ['語一覧', () => createWordListPanel({
      file: file(),
      visibleNodeIndexes: new Set([0, 1]),
      selectedNodeIndex: null,
      t: createCooccurrenceT('Cooccurrence', 'ja'),
      onSelectNode: jest.fn(),
      onFileChange: jest.fn(),
    })],
  ])('%sパネルを単体で組んでも土台が入る（呼び出し規約が全パネルで揃っている）', (_name, create) => {
    // ビューア経由では mount 側の ensureStyles が先に土台を入れてしまい、各パネルが
    // 呼んでいるかを検査できない。パネル単体で組み立てて確かめる。
    document.head.replaceChildren();
    const panel = create();

    expect(document.querySelectorAll('#cooccurrence-button-base-style')).toHaveLength(1);

    panel.destroy();
  });
});
