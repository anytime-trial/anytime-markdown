/**
 * 図の描画と編集の入口（jsdom）。
 *
 * 押下・ドラッグの**動きの判定**は `@anytime-markdown/diagram-core` の純粋関数で測ってある。
 * ここで測るのは「操作要素が在るか・押せるか・何が描かれるか」— 配線が切れていないこと。
 *
 * 移植元は anytime-travel の `tests/genealogy*.test.tsx`（`renderToStaticMarkup` で測っていた節）。
 */

import { DEFAULT_DIAGRAM_SPACING, type DiagramDocument, type DiagramLayout } from '@anytime-markdown/diagram-core';

import { mountDiagramViewer } from '../mountDiagramViewer';
import { covered, type Spec } from '../ui/gutter';
import type { DiagramViewerHandle, DiagramViewerOptions } from '../types';

const DOC: DiagramDocument = {
  version: 1,
  title: '検査用の系図',
  lead: '導入文',
  note: '末尾の注記',
  legend: '実線は親子。',
  groups: [{ id: 'volume', label: '巻', values: { one: '上巻' } }],
  families: [
    { parents: ['祖父', '祖母'], children: ['父'], kind: 'birth', groups: { volume: 'one' } },
    { parents: ['父', '母'], children: ['子'], kind: 'birth', groups: { volume: 'one' } },
  ],
  nodes: [],
  shapes: {},
  connectors: [],
  annotations: { 子: '注記' },
  layout: { placements: {} },
};

let container: HTMLElement;
let handle: DiagramViewerHandle | null = null;

function mount(options: Partial<DiagramViewerOptions> = {}): DiagramViewerHandle {
  handle = mountDiagramViewer(container, { document: DOC, locale: 'ja', ...options });
  return handle;
}

const byText = (text: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((button) => button.textContent === text);

const byLabel = (label: string): HTMLButtonElement | null =>
  container.querySelector(`button[aria-label="${label}"]`);

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  handle?.destroy();
  handle = null;
  container.remove();
});

describe('図の描画', () => {
  it('人物を 1 人につき 1 つ描き、題名・導入文・注記をデータから出す', () => {
    mount();
    const nodes = container.querySelectorAll('.anytime-diagram-node');
    expect(nodes).toHaveLength(5);
    expect([...nodes].map((node) => node.getAttribute('data-person')).sort())
      .toEqual(['子', '母', '父', '祖母', '祖父']);
    expect(container.querySelector('.anytime-diagram-title')?.textContent).toBe(DOC.title);
    expect(container.querySelector('.anytime-diagram-lead')?.textContent).toBe(DOC.lead);
    expect(container.textContent).toContain('注記');
  });

  it('人物の札に群の名前を添える', () => {
    mount();
    const node = container.querySelector('[data-person="父"]');
    expect(node?.querySelector('span')?.textContent).toBe('上巻');
  });

  it('compact では読み物を省く（図に高さを譲る）', () => {
    mount({ compact: true });
    const lead = container.querySelector('.anytime-diagram-lead');
    expect(lead?.classList.contains('anytime-diagram-hidden')).toBe(true);
  });

  it('家族 1 件につき 1 本の系統線を描く', () => {
    mount();
    expect(container.querySelectorAll('.anytime-diagram-edges > g')).toHaveLength(DOC.families.length);
  });
});

describe('編集の入口', () => {
  it('編集できると告げられ、保存の口があるときだけ出す', () => {
    mount();
    expect(byText('配置を編集')?.classList.contains('anytime-diagram-hidden')).toBe(true);
    handle!.destroy();
    mount({ editable: true });
    // 保存の口が無ければ、押しても保存できない入口を出さない。
    expect(byText('配置を編集')?.classList.contains('anytime-diagram-hidden')).toBe(true);
    handle!.destroy();
    mount({ editable: true, onSave: () => {} });
    expect(byText('配置を編集')?.classList.contains('anytime-diagram-hidden')).toBe(false);
  });

  it('編集に入る前は升目の塗りも掴む取っ手も出さない', () => {
    mount({ editable: true, onSave: () => {} });
    expect(container.querySelector('.anytime-diagram-grid')?.classList.contains('anytime-diagram-hidden')).toBe(true);
    expect(container.querySelector('.anytime-diagram-handle')?.classList.contains('anytime-diagram-hidden')).toBe(true);
    expect(container.querySelector('.anytime-diagram-gutter')?.classList.contains('anytime-diagram-hidden')).toBe(true);
  });

  it('編集に入ると升目の塗り・取っ手・縁のアイコンが出る', () => {
    mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    expect(container.querySelector('.anytime-diagram-grid')?.classList.contains('anytime-diagram-hidden')).toBe(false);
    expect(container.querySelector('.anytime-diagram-grid path')?.getAttribute('d')).not.toBe('');
    expect(container.querySelector('.anytime-diagram-handle')?.classList.contains('anytime-diagram-hidden')).toBe(false);
    expect(container.querySelectorAll('.anytime-diagram-gutter button').length).toBeGreaterThan(0);
  });

  it('箱の大きさの取っ手は左上の 1 人にだけ出す', () => {
    mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    const shown = [...container.querySelectorAll('.anytime-diagram-size')]
      .filter((handleEl) => !handleEl.classList.contains('anytime-diagram-hidden'));
    // 右辺・下辺・右下の 3 つ。全部の箱に付けると「その箱だけが変わる」と読める形で並ぶ。
    expect(shown).toHaveLength(3);
  });

  it('縁のアイコンは図より前に置く（タブ順が人物の取っ手の後ろにならない）', () => {
    mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    const viewport = container.querySelector('.anytime-diagram-viewport')!;
    const children = [...viewport.children].map((child) => child.className.split(' ')[0]);
    expect(children.indexOf('anytime-diagram-gutter')).toBeLessThan(children.indexOf('anytime-diagram-surface'));
  });
});

describe('保存済みの配置', () => {
  const moved: DiagramLayout = { placements: { 子: { column: 4, row: 3 } } };

  it('初期表示に当て、動かした人物を印で示す', () => {
    mount({ document: { ...DOC, layout: moved } });
    const node = container.querySelector('[data-person="子"]') as HTMLElement;
    expect(node.classList.contains('is-moved')).toBe(true);
    const { nodeWidth, nodeHeight, columnGap, rowGap } = DEFAULT_DIAGRAM_SPACING;
    expect(node.style.left).toBe(`${30 + 4 * (nodeWidth + columnGap)}px`);
    expect(node.style.top).toBe(`${30 + 3 * (nodeHeight + rowGap)}px`);
  });

  it('動かしていない人物には印を付けない', () => {
    mount({ document: { ...DOC, layout: moved } });
    expect(container.querySelector('[data-person="父"]')!.classList.contains('is-moved')).toBe(false);
  });

  it('保存済みの刻みで描く', () => {
    mount({ document: { ...DOC, layout: { placements: {}, spacing: { ...DEFAULT_DIAGRAM_SPACING, nodeWidth: 300 } } } });
    expect((container.querySelector('[data-person="祖父"]') as HTMLElement).style.width).toBe('300px');
  });
});

describe('保存', () => {
  it('変更が無いうちは保存を押せない', () => {
    mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    expect(byText('保存')!.disabled).toBe(true);
  });

  it('自動配置に戻すと確認を挟む', () => {
    mount({ document: { ...DOC, layout: { placements: { 子: { column: 4, row: 3 } } } }, editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    byText('自動配置に戻す')!.click();
    const dialog = container.querySelector('.anytime-diagram-confirm')!;
    expect(dialog.classList.contains('anytime-diagram-hidden')).toBe(false);
    byText('戻す')!.click();
    expect(container.querySelector('[data-person="子"]')!.classList.contains('is-moved')).toBe(false);
    expect(byText('保存')!.disabled).toBe(false);
  });

  it('保存が失敗したら理由を出す（握り潰さない）', async () => {
    const onSave = jest.fn().mockRejectedValue(new Error('書き込めません'));
    mount({ document: { ...DOC, layout: { placements: { 子: { column: 4, row: 3 } } } }, editable: true, onSave });
    byText('配置を編集')!.click();
    byText('自動配置に戻す')!.click();
    byText('戻す')!.click();
    byText('保存')!.click();
    await Promise.resolve();
    await Promise.resolve();
    const error = container.querySelector('.anytime-diagram-error[role="alert"]')!;
    expect(error.textContent).toBe('書き込めません');
    expect(error.classList.contains('anytime-diagram-hidden')).toBe(false);
  });

  it('下書きの変化を宿主へ伝える', () => {
    const onDraftChange = jest.fn();
    mount({ editable: true, onSave: () => {}, onDraftChange });
    byText('配置を編集')!.click();
    // 下書きは**図の全体**（要素と線も編集するため）。配置差分だけを渡していた頃の形ではない。
    expect(onDraftChange).toHaveBeenCalledWith(DOC);
    byText('編集を終う')!.click();
    expect(onDraftChange).toHaveBeenLastCalledWith(null);
  });
});

describe('図の差し替え', () => {
  it('選択も下書きも持ち越さない（別の図の人物名を次の操作へ渡さない）', () => {
    mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    expect(handle!.getDraft()).not.toBeNull();
    handle!.update({ document: { ...DOC, title: '別の系図' } });
    expect(handle!.getDraft()).toBeNull();
    expect(container.querySelector('.anytime-diagram-title')?.textContent).toBe('別の系図');
  });

  it('locale を差し替えると操作列の文言も入れ替わる', () => {
    mount({ editable: true, onSave: () => {} });
    expect(byText('配置を編集')).toBeDefined();
    expect(byLabel('全体表示')).not.toBeNull();
    handle!.update({ locale: 'en' });
    expect(byText('配置を編集')).toBeUndefined();
    expect(byText('Edit layout')).toBeDefined();
    // 絵だけのボタンも名前を入れ替える（読み上げと吹き出しの両方を見る）。
    expect(byLabel('全体表示')).toBeNull();
    expect(byLabel('Fit to view')).not.toBeNull();
    expect(byLabel('Fit to view')!.title).toBe('Fit to view');
  });
});

describe('行・列を増減できない図', () => {
  it('同じ升目に 2 人居ると、アイコンを消す代わりに理由を出す', () => {
    // 自動配置の人物と、そこへ手で置かれた人物が重なっている図。差分へ引き写すと保存が断られる。
    const target = { ...DOC, layout: { placements: { 子: { column: 0, row: 0 } } } };
    mount({ document: target, editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    expect(container.querySelectorAll('.anytime-diagram-gutter button')).toHaveLength(0);
    const blocked = container.querySelector('[role="status"]')!;
    expect(blocked.classList.contains('anytime-diagram-hidden')).toBe(false);
  });
});

/**
 * 見え方の操作（拡大・縮小・全体表示・初期表示）は**図の枠の中**に、**絵で**置く。
 *
 * 枠の外の操作列に字で並べると、幅 1 万 px の図を見ながら視線と指が上の帯へ往復する。
 * 記号の文字を使わないのは、字形を持たない環境で豆腐になり操作が読めなくなるため。
 */
describe('見え方の操作', () => {
  const controls = () => container.querySelector('.anytime-diagram-viewcontrols');

  it('図の枠の中に置く（枠の外の操作列には出さない）', () => {
    mount();
    const viewport = container.querySelector('.anytime-diagram-viewport')!;
    expect(viewport.contains(controls())).toBe(true);
    const toolbar = container.querySelector('.anytime-diagram-toolbar')!;
    for (const label of ['全体表示', '初期表示', '拡大', '縮小']) {
      expect(toolbar.querySelector(`[aria-label="${label}"]`)).toBeNull();
    }
  });

  it('札は字でなく線画で描く（倍率だけは値なので字で出す）', () => {
    mount();
    for (const label of ['拡大', '縮小', '全体表示', '初期表示']) {
      const button = byLabel(label)!;
      expect(button).not.toBeNull();
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg path')).not.toBeNull();
    }
    expect(container.querySelector('.anytime-diagram-zoomlevel')!.textContent).toMatch(/^\d+%$/);
  });

  it('倍率の端では、その向きの操作を押せなくする', () => {
    mount();
    const zoomOut = byLabel('縮小')!;
    for (let i = 0; i < 40 && !zoomOut.disabled; i += 1) zoomOut.click();
    expect(zoomOut.disabled).toBe(true);
    expect(byLabel('拡大')!.disabled).toBe(false);
  });
});

/**
 * 行・列の ＋／− を、見え方の操作の区画の下へ置かない（押下を奪い合わせない）。
 *
 * **判定の規則そのものを測る。** jsdom は版組みをしないので `getBoundingClientRect` が
 * すべて 0 を返す。実際の矩形で重なりを測る検査はここでは必ず「重ならない」と言い、何も
 * 守らない。実寸での確認は実機（ブラウザ）で行う。
 */
describe('縁のアイコンと操作の区画の重なり', () => {
  const spec = (over: Partial<Spec>): Spec => ({
    key: 'k', axis: 'column', kind: 'insert', index: 0, left: null, top: null, label: 'l', ...over,
  });
  /** 枠の左上に浮かぶ操作の区画（幅 150 × 高さ 32、8px の余白つき）を模す。 */
  const panel = [{ left: 8, top: 8, right: 158, bottom: 40 }];

  it('区画に掛かる列のアイコンは描かない', () => {
    // 列のアイコンは縦位置が帯に固定されている（top は null）。区画の縦幅に入る。
    expect(covered(spec({ axis: 'column', left: 100 }), panel)).toBe(true);
  });

  it('区画の外の列のアイコンは描く', () => {
    expect(covered(spec({ axis: 'column', left: 300 }), panel)).toBe(false);
  });

  it('区画に掛かる行のアイコンは描かない', () => {
    // 行のアイコンは横位置が帯に固定されている（left は null）。
    expect(covered(spec({ axis: 'row', top: 20 }), panel)).toBe(true);
  });

  it('区画より下の行のアイコンは描く', () => {
    expect(covered(spec({ axis: 'row', top: 200 }), panel)).toBe(false);
  });

  it('固定されている側を 0 とみなさない（帯の位置で測る）', () => {
    // 行のアイコンの横位置を 0 と見ると、区画の左端 8px より手前になり「掛かっていない」と
    // 誤判定する。実際は帯（14px）に居るので掛かる。
    expect(covered(spec({ axis: 'row', top: 20 }), [{ ...panel[0]!, left: 8 }])).toBe(true);
  });

  it('区画が無ければ何も落とさない', () => {
    expect(covered(spec({ left: 10, top: 10 }), undefined)).toBe(false);
  });
});

/**
 * 図の上に何も被せない。
 *
 * 確認の覆いが出たままだと、図はそのまま見えている（地色が 70% 混ざるだけ）のに人物も縁の
 * アイコンも押せなくなる。背景のドラッグだけは覆いから親へ上がって効くので、「表示は正しいが
 * 編集だけできない」という読み取りにくい壊れ方をする。
 *
 * **クラスの有無ではなく `display` で測る。** クラスを見るだけの検査は、隠す指定が別の規則に
 * 競り負けても通ってしまう（実際にそれで見落とした）。
 */
describe('図を覆うもの', () => {
  const confirmOverlay = () => container.querySelector('.anytime-diagram-confirm') as HTMLElement;

  it('確認していない間、覆いは描かれない', () => {
    mount({ editable: true, onSave: () => {} });
    expect(getComputedStyle(confirmOverlay()).display).toBe('none');
  });

  it('編集に入っても覆いは描かれない（人物と縁のアイコンに手が届く）', () => {
    mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    expect(getComputedStyle(confirmOverlay()).display).toBe('none');
  });

  it('確認を出したときだけ覆いが描かれ、閉じると戻る', () => {
    mount({
      document: { ...DOC, layout: { placements: { 子: { column: 4, row: 3 } } } },
      editable: true,
      onSave: () => {},
    });
    byText('配置を編集')!.click();
    byText('自動配置に戻す')!.click();
    expect(getComputedStyle(confirmOverlay()).display).toBe('flex');
    byText('やめる')!.click();
    expect(getComputedStyle(confirmOverlay()).display).toBe('none');
  });
});

describe('後片付け', () => {
  it('destroy で描いたものをすべて外す', () => {
    mount();
    expect(container.children).toHaveLength(1);
    handle!.destroy();
    handle = null;
    expect(container.children).toHaveLength(0);
  });
});

/**
 * 要素の追加・改名・手引きの線。
 *
 * jsdom は版組みをしないので、枠の内寸（`clientWidth` / `clientHeight`）は 0 のまま返る。
 * 0 は「未計測」を表し、空いた升目の ＋ は 1 つも出ない（計測前に描くと画面の外へ並ぶため）。
 * ここでは**内寸だけを差し込んで**配線を測る。実寸の見え方は実機で確かめる。
 */
describe('要素と接続線', () => {
  const FRAME = { width: 1200, height: 800 };
  let sizes: PropertyDescriptor | undefined;

  beforeEach(() => {
    sizes = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => FRAME.width });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => FRAME.height });
  });

  afterEach(() => {
    if (sizes === undefined) return;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', sizes);
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', sizes);
  });

  const startEditing = (): DiagramViewerHandle => {
    const view = mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    return view;
  };

  const adders = (): HTMLButtonElement[] =>
    [...container.querySelectorAll<HTMLButtonElement>('.anytime-diagram-celladd button')];

  const connectPoint = (person: string): HTMLButtonElement =>
    container.querySelector<HTMLButtonElement>(
      `.anytime-diagram-node[data-person="${person}"] .anytime-diagram-connect`,
    )!;

  const links = (): Element[] => [...container.querySelectorAll('.anytime-diagram-links g[data-connector]')];

  it('編集中だけ空いた升目に ＋ が出る', () => {
    mount({ editable: true, onSave: () => {} });
    expect(adders()).toHaveLength(0);
    byText('配置を編集')!.click();
    expect(adders().length).toBeGreaterThan(0);
  });

  it('＋ を押すと要素が 1 つ増え、そのまま名札を書き換えられる', () => {
    const view = startEditing();
    const before = container.querySelectorAll('.anytime-diagram-node').length;
    adders()[0]!.click();
    expect(container.querySelectorAll('.anytime-diagram-node')).toHaveLength(before + 1);
    expect(view.getDraft()!.nodes).toEqual(['要素 1']);
    const input = container.querySelector<HTMLInputElement>('.anytime-diagram-rename:not(.anytime-diagram-hidden)');
    expect(input).not.toBeNull();
    expect(input!.value).toBe('要素 1');
  });

  it('足した要素は押した升目に載る', () => {
    const view = startEditing();
    const label = adders()[0]!.getAttribute('aria-label')!;
    const [, column, row] = /(\d+) 列 (\d+) 行目/.exec(label)!;
    adders()[0]!.click();
    expect(view.getDraft()!.layout.placements['要素 1'])
      .toEqual({ column: Number(column) - 1, row: Number(row) - 1 });
  });

  it('名札を書き換えると家族・配置・線の名前が一度に変わる', () => {
    const view = startEditing();
    adders()[0]!.click();
    const input = container.querySelector<HTMLInputElement>('.anytime-diagram-rename:not(.anytime-diagram-hidden)')!;
    input.value = '新しい札';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(view.getDraft()!.nodes).toEqual(['新しい札']);
    expect(Object.keys(view.getDraft()!.layout.placements)).toEqual(['新しい札']);
    expect(container.querySelector('.anytime-diagram-node[data-person="新しい札"]')).not.toBeNull();
  });

  it('すでに在る名前へは書き換えず、理由を出す', () => {
    const view = startEditing();
    adders()[0]!.click();
    const input = container.querySelector<HTMLInputElement>('.anytime-diagram-rename:not(.anytime-diagram-hidden)')!;
    input.value = '祖父';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(view.getDraft()!.nodes).toEqual(['要素 1']);
    expect(container.textContent).toContain('すでに図に在ります');
  });

  it('接続点を 2 つ押すと線が 1 本できる', () => {
    const view = startEditing();
    connectPoint('祖父').click();
    expect(container.querySelector('.anytime-diagram-node[data-person="祖父"]')!.className)
      .toContain('is-connect-source');
    connectPoint('父').click();
    expect(view.getDraft()!.connectors).toEqual([
      { id: 'c1', from: '祖父', to: '父', line: 'solid', color: 'default', start: 'none', end: 'arrow' },
    ]);
    expect(links()).toHaveLength(1);
  });

  it('同じ向きの同じ組は 2 本引かない', () => {
    const view = startEditing();
    connectPoint('祖父').click();
    connectPoint('父').click();
    connectPoint('祖父').click();
    connectPoint('父').click();
    expect(view.getDraft()!.connectors).toHaveLength(1);
  });

  it('線を選ぶと線種と両端を変えられる', () => {
    const view = startEditing();
    connectPoint('祖父').click();
    connectPoint('父').click();
    const selects = [...container.querySelectorAll<HTMLSelectElement>('.anytime-diagram-connectorbar select')];
    expect(selects).toHaveLength(4);
    const [line, colour, start, end] = selects as [HTMLSelectElement, HTMLSelectElement, HTMLSelectElement, HTMLSelectElement];
    line.value = 'dashed';
    line.dispatchEvent(new Event('change', { bubbles: true }));
    colour.value = 'danger';
    colour.dispatchEvent(new Event('change', { bubbles: true }));
    start.value = 'circle';
    start.dispatchEvent(new Event('change', { bubbles: true }));
    end.value = 'none';
    end.dispatchEvent(new Event('change', { bubbles: true }));
    expect(view.getDraft()!.connectors[0])
      .toMatchObject({ line: 'dashed', color: 'danger', start: 'circle', end: 'none' });
    expect(container.querySelector('.anytime-diagram-links .link-line')!.classList).toContain('is-dashed');
    expect(container.querySelector('.anytime-diagram-links g[data-connector]')!.classList).toContain('is-color-danger');
  });

  it('線を消すと図からも消える', () => {
    const view = startEditing();
    connectPoint('祖父').click();
    connectPoint('父').click();
    byLabel('この線を消す')!.click();
    expect(view.getDraft()!.connectors).toEqual([]);
    expect(links()).toHaveLength(0);
  });

  it('要素を取り除くと、その要素に付いた線も落ちる', () => {
    const view = startEditing();
    adders()[0]!.click();
    connectPoint('要素 1').click();
    connectPoint('父').click();
    expect(view.getDraft()!.connectors).toHaveLength(1);
    byLabel('要素を取り除く')!.click();
    expect(view.getDraft()!.nodes).toEqual([]);
    expect(view.getDraft()!.connectors).toEqual([]);
  });

  it('家族に出る人物も取り除ける。相手は名前だけの要素として残る', () => {
    const view = startEditing();
    container.querySelector<HTMLButtonElement>('[data-person="祖母"] .anytime-diagram-pick')!.click();
    expect(byLabel('要素を取り除く')!.disabled).toBe(false);
    byLabel('要素を取り除く')!.click();
    const draft = view.getDraft()!;
    expect(container.querySelector('[data-person="祖母"]')).toBeNull();
    // 祖父・父 は残る（家族は「祖父 → 父」の形で生き続ける）。
    expect(container.querySelector('[data-person="父"]')).not.toBeNull();
    expect(draft.families[0]!.parents).toEqual(['祖父']);
  });

  it('保存は図の全体を渡す', async () => {
    const onSave = jest.fn();
    mount({ editable: true, onSave });
    byText('配置を編集')!.click();
    adders()[0]!.click();
    byText('保存')!.click();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].nodes).toEqual(['要素 1']);
  });
});

describe('上・左への割り込み', () => {
  const insertHandle = (person: string, axis: 'row' | 'column'): HTMLButtonElement =>
    container.querySelector<HTMLButtonElement>(
      `.anytime-diagram-node[data-person="${person}"] .anytime-diagram-insert.is-${axis}`,
    )!;

  const startEditing = (options: Partial<DiagramViewerOptions> = {}): DiagramViewerHandle => {
    const view = mount({ editable: true, onSave: () => {}, ...options });
    byText('配置を編集')!.click();
    return view;
  };

  it('編集中だけ札に上・左の取っ手が出る', () => {
    mount({ editable: true, onSave: () => {} });
    expect(insertHandle('父', 'row').classList).toContain('anytime-diagram-hidden');
    byText('配置を編集')!.click();
    expect(insertHandle('父', 'row').classList).not.toContain('anytime-diagram-hidden');
    expect(insertHandle('父', 'column').classList).not.toContain('anytime-diagram-hidden');
  });

  it('上へ割り込むと、その札と同じ列の次の空きまでが 1 升下がる', () => {
    const view = startEditing();
    const before = view.getDraft()!.layout.placements;
    expect(before).toEqual({});
    insertHandle('祖父', 'row').click();
    const after = view.getDraft()!.layout.placements;
    // 祖父の居る列だけが動く。別の列（父・子）は差分を持たない。
    expect(Object.keys(after).length).toBeGreaterThan(0);
    expect(Object.keys(after)).not.toContain('子');
  });

  it('左へ割り込むと、その札と同じ行の次の空きまでが右へ動く', () => {
    const view = startEditing();
    insertHandle('祖父', 'column').click();
    const after = view.getDraft()!.layout.placements;
    expect(after['祖父']!.column).toBe(1);
  });

});

describe('家族ごと消えるときの知らせ', () => {
  /** 単親の家族を 1 件足した図。親を消すと家族ごと落ち、子が行き場を失う。 */
  const WITH_SINGLE_PARENT: DiagramDocument = {
    ...DOC,
    families: [...DOC.families, { parents: ['独神'], children: ['化生'], kind: 'creation', groups: {} }],
  };

  it('家族が落ちたら、何が起きたかを図の中で知らせる', () => {
    const view = mount({ document: WITH_SINGLE_PARENT, editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    container.querySelector<HTMLButtonElement>('[data-person="独神"] .anytime-diagram-pick')!.click();
    byLabel('要素を取り除く')!.click();
    // 化生 は「独神 → 化生」にしか出てこない。拾わないと 1 人消して 2 人消える。
    expect(view.getDraft()!.nodes).toContain('化生');
    expect(container.querySelector('[data-person="化生"]')).not.toBeNull();
    const notice = container.querySelector('.anytime-diagram-error:not(.anytime-diagram-hidden)');
    expect(notice?.textContent).toContain('化生');
  });
});

/**
 * 線を選んだときに設定の区画が出るか。
 *
 * **根の原因（押下と同時の `setPointerCapture` が `click` を枠へ付け替える）は jsdom では
 * 再現しない** — jsdom はポインタの捕捉に伴う事象の付け替えを実装しない。ここで測れるのは
 * 選び方の規則（押したら選ぶ・地を押したら外す）だけで、捕捉の側は実ブラウザで確認する。
 */
describe('線の選択', () => {
  // jsdom はポインタの捕捉を実装しない。札を掴む経路がそこで落ちるので、空の実装を足す。
  beforeEach(() => {
    for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const) {
      Object.defineProperty(Element.prototype, name, {
        configurable: true, writable: true, value: () => false,
      });
    }
  });

  const drawLine = (): DiagramViewerHandle => {
    const view = mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    container.querySelector<HTMLButtonElement>('[data-person="祖父"] .anytime-diagram-connect')!.click();
    container.querySelector<HTMLButtonElement>('[data-person="子"] .anytime-diagram-connect')!.click();
    return view;
  };
  const barShown = (): boolean =>
    !container.querySelector('.anytime-diagram-connectorbar')!.classList.contains('anytime-diagram-hidden');

  it('図の地を押すと線の選択が外れる', () => {
    drawLine();
    expect(barShown()).toBe(true);
    container.querySelector('.anytime-diagram-viewport')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(barShown()).toBe(false);
  });

  it('線を押すと選ばれる。もう一度押しても外れない（選んだつもりで消えない）', () => {
    drawLine();
    const hit = container.querySelector('.anytime-diagram-links .link-hit')!;
    container.querySelector('.anytime-diagram-viewport')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(barShown()).toBe(false);
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(barShown()).toBe(true);
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(barShown()).toBe(true);
  });

  it('札を押しても線の選択は外れない（図の地ではない）', () => {
    drawLine();
    container.querySelector('[data-person="父"]')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(barShown()).toBe(true);
  });
});

describe('最初からある線（家族の線）の見た目', () => {
  const selectFamilyLine = (): DiagramViewerHandle => {
    const view = mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    container.querySelector('.anytime-diagram-edges path:not(.anytime-diagram-hidden)')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return view;
  };
  const bar = (): HTMLElement => container.querySelector('.anytime-diagram-connectorbar')!;

  it('押すと設定の区画が出て、種別から決まる今の値が入っている', () => {
    selectFamilyLine();
    expect(bar().classList).not.toContain('anytime-diagram-hidden');
    const [line, colour, start, end] = [...bar().querySelectorAll<HTMLSelectElement>('select')];
    // 親子の家族なので実線・既定・印なし。
    expect([line!.value, colour!.value, start!.value, end!.value]).toEqual(['solid', 'default', 'none', 'none']);
  });

  it('消す口は出さない（家族の線を消すことは家族を消すこと）', () => {
    selectFamilyLine();
    expect(byLabel('この線を消す')!.classList).toContain('anytime-diagram-hidden');
  });

  it('変えるとその家族 1 件にだけ上書きが載る', () => {
    const view = selectFamilyLine();
    const [line, colour] = [...bar().querySelectorAll<HTMLSelectElement>('select')];
    line!.value = 'dashed';
    line!.dispatchEvent(new Event('change', { bubbles: true }));
    colour!.value = 'danger';
    colour!.dispatchEvent(new Event('change', { bubbles: true }));
    const families = view.getDraft()!.families;
    expect(families[0]!.look).toEqual({ line: 'dashed', color: 'danger', start: 'none', end: 'none' });
    // 別の家族は触らない（種別ごとではなく 1 件ごと）。
    expect(families[1]!.look).toBeUndefined();
  });

  it('端の印は子ごとに 1 つ描く', () => {
    selectFamilyLine();
    const [, , , end] = [...bar().querySelectorAll<HTMLSelectElement>('select')];
    end!.value = 'arrow';
    end!.dispatchEvent(new Event('change', { bubbles: true }));
    // 1 件目の家族（祖父・祖母 → 父）は子が 1 人。
    const group = container.querySelector('.anytime-diagram-edges > g')!;
    expect(group.querySelectorAll('.edge-cap')).toHaveLength(1);
  });
});

describe('要素の形', () => {
  const startEditing = (): DiagramViewerHandle => {
    const view = mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    return view;
  };
  const pick = (name: string): void => {
    container.querySelector<HTMLButtonElement>(`[data-person="${name}"] .anytime-diagram-pick`)!.click();
  };
  const shapePicker = (): HTMLSelectElement =>
    [...container.querySelectorAll<HTMLSelectElement>('.anytime-diagram-selection select')][0]!;
  const choose = (shape: string): void => {
    const select = shapePicker();
    select.value = shape;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const card = (name: string): HTMLElement => container.querySelector(`[data-person="${name}"]`)!;

  it('何も選んでいない間は形を変えられない（どれを変えたのか後から分からないため）', () => {
    startEditing();
    expect(shapePicker().disabled).toBe(true);
    pick('父');
    expect(shapePicker().disabled).toBe(false);
    pick('母');
    expect(shapePicker().disabled).toBe(true);
  });

  it('選んで形を変えると、その 1 つだけが変わる', () => {
    const view = startEditing();
    pick('父');
    choose('diamond');
    expect(view.getDraft()!.shapes).toEqual({ 父: 'diamond' });
    expect(card('父').getAttribute('data-shape')).toBe('diamond');
    expect(card('母').getAttribute('data-shape')).toBe('rect');
  });

  it('SVG で描く形のときだけ輪郭の層が出る', () => {
    startEditing();
    pick('父');
    const layer = card('父').querySelector('.anytime-diagram-shape')!;
    expect(layer.classList).toContain('anytime-diagram-hidden');
    choose('hexagon');
    expect(card('父').querySelector('.anytime-diagram-shape')!.classList)
      .not.toContain('anytime-diagram-hidden');
    expect(card('父').querySelector('.shape-outline')!.getAttribute('d')).toMatch(/^M /);
    // 角丸は border-radius で描くので層は出さない。
    choose('round');
    expect(card('父').querySelector('.anytime-diagram-shape')!.classList)
      .toContain('anytime-diagram-hidden');
  });

  it('既定（四角）へ戻すと鍵ごと落ちる', () => {
    const view = startEditing();
    pick('父');
    choose('cylinder');
    choose('rect');
    expect(view.getDraft()!.shapes).toEqual({});
  });

  it('選び直すとその要素の今の形が区画に出る', () => {
    startEditing();
    pick('父');
    choose('stadium');
    pick('父');
    pick('母');
    expect(shapePicker().value).toBe('rect');
  });
});

describe('形の変更は「変更あり」として扱う', () => {
  it('形だけ変えても保存が押せる（編集を終うときに黙って捨てられない）', () => {
    mount({ editable: true, onSave: () => {} });
    byText('配置を編集')!.click();
    expect(byText('保存')!.disabled).toBe(true);
    container.querySelector<HTMLButtonElement>('[data-person="父"] .anytime-diagram-pick')!.click();
    const select = container.querySelector<HTMLSelectElement>('.anytime-diagram-selection select')!;
    select.value = 'diamond';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(byText('保存')!.disabled).toBe(false);
  });
});
