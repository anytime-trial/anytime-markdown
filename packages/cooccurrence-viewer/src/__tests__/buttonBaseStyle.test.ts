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

  it('語一覧の操作ボタンの枠が土台に潰されない（土台が個別スタイルより先に挿入されている）', () => {
    expect(getComputedStyle(query('.cooc-words__button')).borderTopWidth).not.toBe('0px');
  });

  it('アイコン列のボタンの体裁が土台に潰されない（土台が個別スタイルより先に挿入されている）', () => {
    // アイコン列のボタンは枠を持たない。潰されると図柄の中央寄せと寸法が失われ、
    // 46px の列の中で図柄が左上へ寄る。
    const computed = getComputedStyle(query('.cooc-rail__item'));

    expect(computed.display).toBe('flex');
    expect(computed.alignItems).toBe('center');
    expect(computed.width).toBe('32px');
    expect(computed.borderRadius).toBe('6px');
  });

  it('土台のスタイルは重複して挿入されない', () => {
    expect(document.querySelectorAll('#cooccurrence-button-base-style')).toHaveLength(1);
  });

  /**
   * 個別のパネルごとに検査すると、新しく足したパネルが検査から漏れる。実際、時間軸パネルの
   * 並べ替え・削除・追加のボタンだけ土台クラスが抜けており、暗いテーマで白面に塗り潰されて
   * 図柄も活性状態も読めなくなっていた（同種の付け忘れは 3 回目）。
   */
  it('ビューアの中の全てのボタンが土台クラスを持つ（パネルを足したときの付け忘れを検知する）', () => {
    // スライス行は 1 枚も無いと描かれない。UI から 1 枚足して並べ替え・削除まで検査範囲に入れる。
    (query('#cooc-panel-timeline-tab') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const [labelInput, atInput] = [...document.querySelectorAll('.cooc-timeline__add input')] as HTMLInputElement[];
    labelInput.value = '1月';
    atInput.value = '2026-01-01';
    (query('.cooc-timeline__add button') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // 検査対象が空だと「全て通った」と「1 つも見ていない」が区別できない。
    expect(document.querySelectorAll('.cooc-timeline__slice').length).toBeGreaterThan(0);
    const buttons = [...document.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);

    // 症状そのものの検査。土台が効いていないと UA 既定の面（`buttonface`）が残り、
    // 明色の図柄と重なって読めなくなる。透明な面は土台からしか来ない
    // （jsdom は `transparent` を `rgba(0, 0, 0, 0)` へ正規化する）。
    const action = query('.cooc-timeline__actions button');
    expect(getComputedStyle(action).backgroundColor).toBe('rgba(0, 0, 0, 0)');

    const missing = buttons
      .filter((button) => !button.classList.contains('cooc-btn'))
      .map((button) => `${button.className || '(class なし)'} / ${button.getAttribute('aria-label') ?? button.textContent}`);
    expect(missing).toEqual([]);
  });

  it.each<[string, () => { destroy(): void }]>([
    ['絞り込み', () => createFilterPanel({
      file: file(),
      counts: { visibleNodeCount: 2, totalNodeCount: 2, visibleLinkCount: 1, totalLinkCount: 1 },
      t: createCooccurrenceT('Cooccurrence', 'ja'),
      onFilterChange: jest.fn(), onSelectedSliceLabelsChange: jest.fn(),
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
