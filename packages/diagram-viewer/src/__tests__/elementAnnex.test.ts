/**
 * 宿主が要素へ添える項目群（`elementAnnex`）と、選択の公開（`onSelect`）。
 *
 * ここで測るのは「宿主が渡したものが札へ届くか」ではなく、**届け方の不変条件**である。
 * 札を作り直さないこと・0 件で版組みが変わらないこと・描くたびに当て直すことの 3 つは、
 * 破れても画面は一応出るため、目視では気づけない（`ui/nodes.ts` の同名のコメントを参照）。
 */

import type { DiagramDocument } from '@anytime-markdown/diagram-core';

import { mountDiagramViewer } from '../mountDiagramViewer';
import type { DiagramElementAnnex, DiagramViewerHandle, DiagramViewerOptions } from '../types';

const DOC: DiagramDocument = {
  version: 1,
  title: '検査用の系図',
  lead: '',
  note: '',
  legend: '',
  groups: [],
  families: [{ parents: ['父'], children: ['子'], kind: 'birth', groups: {} }],
  nodes: [],
  shapes: {},
  connectors: [],
  annotations: {},
  layout: { placements: {} },
};

const ANNEX: Readonly<Record<string, DiagramElementAnnex>> = {
  父: {
    summary: '地図で見る',
    items: [
      { id: 'spot-a', label: '高千穂峰' },
      { id: 'spot-b', label: '橿原', ariaLabel: '地図で表示: 橿原' },
    ],
  },
};

let container: HTMLElement;
let handle: DiagramViewerHandle | null = null;

function mount(options: Partial<DiagramViewerOptions> = {}): DiagramViewerHandle {
  handle = mountDiagramViewer(container, { document: DOC, locale: 'ja', ...options });
  return handle;
}

const nodeOf = (name: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(`.anytime-diagram-node[data-person="${name}"]`);
  if (node === null) throw new Error(`札が見つからない: ${name}`);
  return node;
};

const annexOf = (name: string): HTMLDetailsElement => {
  const annex = nodeOf(name).querySelector<HTMLDetailsElement>('.anytime-diagram-annex');
  if (annex === null) throw new Error(`項目群の器が見つからない: ${name}`);
  return annex;
};

/** 隠されていない項目だけを返す（器は貸し借りで残るため、可視のものだけを数える）。 */
const visibleItems = (name: string): HTMLButtonElement[] =>
  [...annexOf(name).querySelectorAll<HTMLButtonElement>('.anytime-diagram-annex-item')]
    .filter((button) => !button.classList.contains('anytime-diagram-hidden'));

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  handle?.destroy();
  handle = null;
  container.remove();
});

describe('添える項目が無いとき', () => {
  it('器は在るが隠れており、札の中身は増えない', () => {
    mount();
    // 器そのものは常に作る。無ければ作らない作りにすると、項目が届いた瞬間に版組みが跳ぶ。
    expect(annexOf('父').classList.contains('anytime-diagram-hidden')).toBe(true);
    expect(visibleItems('父')).toHaveLength(0);
  });

  it('項目が付いて外れたあと、開いたままにならない', () => {
    const view = mount({ elementAnnex: ANNEX });
    annexOf('父').open = true;
    view.update({ elementAnnex: {} });
    expect(annexOf('父').open).toBe(false);
  });
});

describe('添える項目があるとき', () => {
  it('見出しへ件数を添え、項目を宣言された順に出す', () => {
    mount({ elementAnnex: ANNEX });
    expect(annexOf('父').querySelector('summary')?.textContent).toBe('地図で見る (2)');
    expect(visibleItems('父').map((button) => button.textContent)).toEqual(['高千穂峰', '橿原']);
  });

  it('既定では畳んだ状態で出す', () => {
    mount({ elementAnnex: ANNEX });
    expect(annexOf('父').open).toBe(false);
  });

  it('`ariaLabel` を渡した項目だけ支援技術向けの名前を持つ', () => {
    mount({ elementAnnex: ANNEX });
    const [first, second] = visibleItems('父');
    expect(first?.getAttribute('aria-label')).toBeNull();
    expect(second?.getAttribute('aria-label')).toBe('地図で表示: 橿原');
  });

  it('添えられていない要素の器は隠れたまま', () => {
    mount({ elementAnnex: ANNEX });
    expect(annexOf('子').classList.contains('anytime-diagram-hidden')).toBe(true);
  });
});

describe('差し替え', () => {
  it('札そのものを作り直さない', () => {
    const view = mount();
    const before = nodeOf('父');
    view.update({ elementAnnex: ANNEX });
    // 作り直すと、掴んでいる札の DOM が入れ替わってポインタの捕捉が外れる（実機でのみ壊れる）。
    expect(nodeOf('父')).toBe(before);
  });

  it('前の内容を残さず当て直す', () => {
    const view = mount({ elementAnnex: ANNEX });
    view.update({
      elementAnnex: { 父: { summary: '資料', items: [{ id: 'doc-a', label: '古事記' }] } },
    });
    expect(annexOf('父').querySelector('summary')?.textContent).toBe('資料 (1)');
    expect(visibleItems('父').map((button) => button.textContent)).toEqual(['古事記']);
  });

  it('`elementAnnex` を渡さない `update` は現在の項目を消さない', () => {
    const view = mount({ elementAnnex: ANNEX });
    view.update({ compact: true });
    expect(visibleItems('父')).toHaveLength(2);
  });
});

describe('押下', () => {
  it('受け口を渡すと、押した項目の鍵を要素名と一緒に返す', () => {
    const activated: [string, string][] = [];
    mount({ elementAnnex: ANNEX, onAnnexActivate: (name, id) => activated.push([name, id]) });
    visibleItems('父')[1]?.click();
    expect(activated).toEqual([['父', 'spot-b']]);
  });

  it('差し替えた後に押すと、新しい項目の鍵を返す', () => {
    const activated: string[] = [];
    const view = mount({ elementAnnex: ANNEX, onAnnexActivate: (_name, id) => activated.push(id) });
    view.update({
      elementAnnex: { 父: { summary: '資料', items: [{ id: 'doc-a', label: '古事記' }] } },
    });
    visibleItems('父')[0]?.click();
    // 受け口は作るときに 1 度だけ張る作りなので、位置から現在の項目を引けているかを測る。
    expect(activated).toEqual(['doc-a']);
  });

  it('押下を 1 度しか数えない（差し替えのたびに受け口を積まない）', () => {
    const activated: string[] = [];
    const view = mount({ elementAnnex: ANNEX, onAnnexActivate: (_name, id) => activated.push(id) });
    view.update({ elementAnnex: ANNEX });
    view.update({ elementAnnex: ANNEX });
    visibleItems('父')[0]?.click();
    expect(activated).toEqual(['spot-a']);
  });

  it('受け口を渡さないと押せない', () => {
    mount({ elementAnnex: ANNEX });
    const items = visibleItems('父');
    // 件数を先に測る。空配列に `every` を当てると、項目が 1 つも出ていない破れを真で通す。
    expect(items).toHaveLength(2);
    expect(items.every((button) => button.disabled)).toBe(true);
  });
});

describe('選択の公開', () => {
  it('札を押すと宿主へ要素名を渡す', () => {
    const selected: [string | null, boolean][] = [];
    mount({ onSelect: (name, additive) => selected.push([name, additive]) });
    nodeOf('父').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual([['父', false]]);
  });

  it('修飾キーを添えた押下は足す意味として渡す', () => {
    const selected: [string | null, boolean][] = [];
    mount({ onSelect: (name, additive) => selected.push([name, additive]) });
    nodeOf('父').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(selected).toEqual([['父', true]]);
  });

  it('足す押下で最後の 1 つが外れたら `null` を渡す', () => {
    const selected: (string | null)[] = [];
    mount({ onSelect: (name) => selected.push(name) });
    const node = nodeOf('父');
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    // 外れた名前を「選ばれた」と渡すと、宿主は外れたことに気づけない。
    expect(selected).toEqual(['父', null]);
  });

  it('図を差し替えて選びが消えたら `null` を渡す', () => {
    const selected: (string | null)[] = [];
    const view = mount({ onSelect: (name) => selected.push(name) });
    nodeOf('父').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    view.update({ document: { ...DOC, title: '別の系図' } });
    // 渡さないと、図の外の表示を選びに合わせている宿主が一度寄せた表示を戻せない。
    expect(selected).toEqual(['父', null]);
  });

  it('選びが無い状態で図を差し替えても `null` を重ねて渡さない', () => {
    const selected: (string | null)[] = [];
    const view = mount({ onSelect: (name) => selected.push(name) });
    view.update({ document: { ...DOC, title: '別の系図' } });
    expect(selected).toEqual([]);
  });

  it('見出しの開閉は札の選び直しを起こさない', () => {
    const selected: (string | null)[] = [];
    mount({ elementAnnex: ANNEX, onSelect: (name) => selected.push(name) });
    // `summary` は button / input / select のどれでもないので、札の click は素通りさせる。
    // 止めないと、項目を開いただけで図の外の表示（travel なら地図）が動く。
    annexOf('父').querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual([]);
  });

  it('添えた項目の押下は札の選び直しを起こさない', () => {
    const selected: (string | null)[] = [];
    mount({
      elementAnnex: ANNEX,
      onSelect: (name) => selected.push(name),
      onAnnexActivate: () => {},
    });
    const items = visibleItems('父');
    expect(items).toHaveLength(2);
    items[0]!.click();
    expect(selected).toEqual([]);
  });
});
