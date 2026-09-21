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
  it('人物を 1 人につき 1 つ描き、題名・導入文・注記・凡例をデータから出す', () => {
    mount();
    const nodes = container.querySelectorAll('.anytime-diagram-node');
    expect(nodes).toHaveLength(5);
    expect([...nodes].map((node) => node.getAttribute('data-person')).sort())
      .toEqual(['子', '母', '父', '祖母', '祖父']);
    expect(container.querySelector('.anytime-diagram-title')?.textContent).toBe(DOC.title);
    expect(container.querySelector('.anytime-diagram-lead')?.textContent).toBe(DOC.lead);
    expect(container.textContent).toContain(DOC.legend);
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
    // 凡例と操作の説明は省かない（線の意味と掴み方は編集中にこそ引く）。
    expect(container.textContent).toContain(DOC.legend);
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
    expect(onDraftChange).toHaveBeenCalledWith(DOC.layout);
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
    expect(byText('全体表示')).toBeDefined();
    handle!.update({ locale: 'en' });
    expect(byText('全体表示')).toBeUndefined();
    expect(byText('Fit to view')).toBeDefined();
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
