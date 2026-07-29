/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';

function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 1, generatedAt: '2026-07-20T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
    },
  };
}

function mount(): { container: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, { file: file(), themeMode: 'light' });
  return { container, destroy: () => handle.destroy() };
}

describe('cooccurrence viewer panel layout', () => {
  beforeEach(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Object.defineProperty(window, 'requestAnimationFrame', { value: jest.fn(() => 1), configurable: true });
    Object.defineProperty(window, 'cancelAnimationFrame', { value: jest.fn(), configurable: true });
    Object.defineProperty(window, 'ResizeObserver', {
      value: class {
        observe(): void {}
        disconnect(): void {}
      },
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.replaceChildren();
    document.getElementById('cooccurrence-viewer-style')?.remove();
    document.getElementById('cooccurrence-filter-panel-style')?.remove();
    document.getElementById('cooccurrence-word-list-panel-style')?.remove();
    document.getElementById('cooccurrence-side-rail-style')?.remove();
  });

  it('scrolls the word list itself instead of stretching the panel column', () => {
    const { container, destroy } = mount();
    const panels = container.querySelector('.cooc-viewer__panels') as HTMLElement;
    const words = container.querySelector('.cooc-words') as HTMLElement;

    // ガード: このアサーションが落ちるなら jsdom がスタイルシートを解決できていない。
    // 以下の検査が「常に既定値」で fail-open するのを防ぐ。
    expect(getComputedStyle(panels).width).toBe('300px');

    // 語一覧は親の高さに収まるまで縮む。縮まないと表の viewport が伸び続け、
    // 内部スクロール（仮想リストの前提）が働かない。
    expect(getComputedStyle(words).flexShrink).toBe('1');

    // ただし min-height:0 は与えない。与えると絞り込み列が高いときに語一覧が 0px まで
    // 潰れ、検索欄も編集フォームも到達不能になる（3056b2d00 が防いだ回帰の再来）。
    // 既定の min-height:auto が内容の最小高さを下限にし、超過分は下のスクロールが救う。
    expect(Number.parseFloat(getComputedStyle(words).minHeight)).toBeNaN();

    // 固定要素の合計が列を超える極端な高さでの最終手段。内部スクロールが先に効くので
    // 通常はここまで来ない。
    expect(getComputedStyle(panels).overflowY).toBe('auto');
    destroy();
  });

  it('scrolls inside the word list viewport', () => {
    const { container, destroy } = mount();
    const viewport = container.querySelector('.cooc-words__viewport') as HTMLElement;
    const computed = getComputedStyle(viewport);

    expect(computed.overflow).toBe('auto');
    // 縮めないと親からはみ出し、内部スクロールでなくパネル列の引き伸ばしになる。
    expect(computed.flexShrink).toBe('1');

    // basis は「単位なしの 0」でなければならない。0% でも auto でもいけない。
    // パーセンテージは親の高さが未確定な段階で解決できず content ベースへフォールバックし、
    // viewport の最小寄与が spacer の高さ（件数 × 36px）になって .cooc-words の
    // flex-shrink:1 が効かなくなる。ショートハンドの `flex:1` は `1 1 0%` に展開されるため
    // 同じ罠にはまる（元のコードがこれで、内部スクロールが働いていなかった）。
    // Chromium 実測（36 件・列高 900px）: 0% → viewport 1296px・スクロールなし、
    // 0 → 425px・スクロールあり。jsdom は 0% と 0px を区別できるのでここで固定する。
    expect(computed.flexBasis).toBe('0px');
    destroy();
  });

  it('keeps the filter section from being squeezed out of the panel column', () => {
    const { container, destroy } = mount();
    const filter = container.querySelector('.cooc-filter') as HTMLElement;

    expect(getComputedStyle(filter).flexShrink).toBe('0');
    destroy();
  });

  it('gives the active tab panel the column height', () => {
    const { container, destroy } = mount();
    // 表示中のタブで測る。隠れている側は display:none で、寸法の宣言が意味を持たない。
    // 既定はミニマップタブ（仕様 §3.5）。
    const activePanel = container.querySelector('#cooc-panel-minimap') as HTMLElement;
    const computed = getComputedStyle(activePanel);

    // ガード: 解決できていなければ以下の検査が既定値で fail-open する。
    expect(computed.display).toBe('flex');
    expect(computed.flexDirection).toBe('column');

    // 伸びないと語一覧が内容の高さしか得られず、タブへ分けた意味が無くなる。
    // 実ブラウザ側（web-app の e2e）で、伸長を止めると一覧の viewport が最小高さの
    // 120px まで潰れることを実測した（列高 900px・語 36 件）。
    expect(computed.flexGrow).toBe('1');
    expect(computed.flexShrink).toBe('1');

    // basis は単位なしの 0 でなければならない。0% は親の高さが未確定な段階で解決できず
    // content ベースへフォールバックする（fc045ca43 の真因）。現状の親（.cooc-viewer__panels）
    // は height:100% を持つため 0% へ戻しても実ブラウザでは落ちないことを実測したが、
    // 親の高さが未確定になった時点で同じ罠が再来する。ここで単位を固定しておく。
    expect(computed.flexBasis).toBe('0px');
    destroy();
  });

  it('keeps the icon rail from shrinking', () => {
    const { container, destroy } = mount();
    const rail = container.querySelector('.cooc-rail') as HTMLElement;
    const item = rail.querySelector('.cooc-rail__item') as HTMLElement;

    // ガード: 解決できていなければ以下の検査が既定値で fail-open する。
    expect(getComputedStyle(rail).width).toBe('46px');

    // 縮むとアイコンが潰れ、パネルの切り替えと開閉の手段そのものへ到達できなくなる。
    expect(getComputedStyle(rail).flexShrink).toBe('0');
    expect(getComputedStyle(item).flexShrink).toBe('0');
    destroy();
  });

  it('hides the inactive tab panel so it does not take column height', () => {
    const { container, destroy } = mount();
    const minimapPanel = container.querySelector('#cooc-panel-minimap') as HTMLElement;
    const filterPanel = container.querySelector('#cooc-panel-filter') as HTMLElement;
    const editPanel = container.querySelector('#cooc-panel-words') as HTMLElement;

    // hidden 属性だけでは display:flex が勝つ（UA の [hidden]{display:none} は
    // 詳細度で負ける）。明示した打ち消しが効いていることを固定する。
    expect(getComputedStyle(editPanel).display).toBe('none');
    expect(getComputedStyle(filterPanel).display).toBe('none');
    expect(getComputedStyle(minimapPanel).display).toBe('flex');
    destroy();
  });

  it.each([
    ['検索欄', '.cooc-words__search'],
    ['編集入力', '.cooc-words__edit'],
    ['操作ボタン', '.cooc-words__buttons'],
    ['エラー表示', '.cooc-words__error'],
  ])('%sは縮まないので到達不能にならない', (_name, selector) => {
    const { container, destroy } = mount();
    const element = container.querySelector(selector) as HTMLElement;

    // 語一覧が縮む設計へ変えたぶん、縮んではいけない要素を個別に固定する。
    // ここが 1 に戻ると、項目が多いときに編集入力やボタンが潰れて操作できなくなる。
    expect(getComputedStyle(element).flexShrink).toBe('0');
    destroy();
  });

  it('keeps the viewport from collapsing below a usable height', () => {
    const { container, destroy } = mount();
    const viewport = container.querySelector('.cooc-words__viewport') as HTMLElement;

    // 0 まで潰れると表が消える。この下限があるぶん、絞り込み列が高いときは語一覧全体が
    // 列からはみ出すので、パネル列側のスクロールが最終手段として要る。
    expect(Number.parseFloat(getComputedStyle(viewport).minHeight)).toBeGreaterThan(0);
    destroy();
  });

  it('keeps word rows to a single line so the virtual list row height stays valid', () => {
    const { container, destroy } = mount();
    const meta = container.querySelector('.cooc-words__meta') as HTMLElement;
    const computed = getComputedStyle(meta);

    // 折り返すと行が 36px を超え、spacer の総高さ（件数 × 36）とずれてスクロール位置が狂う。
    expect(computed.whiteSpace).toBe('nowrap');
    expect(computed.overflow).toBe('hidden');
    expect(computed.textOverflow).toBe('ellipsis');
    destroy();
  });

  it('renders the toolbar and status inside the stage so they never cover the panel column', () => {
    const { container, destroy } = mount();
    const stage = container.querySelector('.cooc-viewer__stage') as HTMLElement;
    const toolbar = container.querySelector('.cooc-viewer__toolbar') as HTMLElement;
    const status = container.querySelector('.cooc-viewer__status') as HTMLElement;

    expect(toolbar.parentElement).toBe(stage);
    expect(status.parentElement).toBe(stage);
    destroy();
  });
});
