/**
 * @jest-environment jsdom
 */
import type { CooccurrenceFile } from '@anytime-markdown/graph-core';
import { mountCooccurrenceViewer } from '../mountCooccurrenceViewer';

/**
 * ポップアップの検査は「何か出た」で合格にしない（設計書 §6.4）。観測点が返す対象の種別と
 * 添字を見て、隣の要素の内容を出す取り違えを捕まえる。
 */
function file(): CooccurrenceFile {
  return {
    meta: { schemaVersion: 3, generatedAt: '2026-07-29T00:00:00.000Z', origin: 'manual' },
    spec: {
      nodes: [
        { label: 'Alpha', frequency: 3 },
        { label: 'Beta', frequency: 2 },
      ],
      links: [[0, 1, 4]],
      clusters: [{ label: 'alpha-cluster', members: [0] }],
      notes: {
        nodes: [[0, 'Alpha のメモ\n二行目']],
        links: [[0, '共起のメモ']],
        clusters: [[0, 'クラスタのメモ']],
      },
      // 座標を固定して、当たり判定を画面座標から逆算できるようにする。
    },
    layout: {
      positions: [
        [-50, 0],
        [50, 0],
      ],
      specHash: 'unused',
      algorithmVersion: 'unused',
    },
  };
}

function mount(next?: CooccurrenceFile): {
  container: HTMLElement;
  handle: ReturnType<typeof mountCooccurrenceViewer>;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handle = mountCooccurrenceViewer(container, {
    file: next ?? file(),
    themeMode: 'light',
    locale: 'ja',
  });
  return { container, handle };
}

function canvas(container: HTMLElement): HTMLCanvasElement {
  return container.querySelector('canvas') as HTMLCanvasElement;
}

/** 世界座標をそのまま画面座標として扱えるよう、視野を等倍・原点へ固定する。 */
function resetViewport(element: HTMLCanvasElement): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function movePointer(element: HTMLCanvasElement, x: number, y: number): void {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  element.dispatchEvent(event);
}

describe('ホバーのポップアップ', () => {
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
    for (const id of [
      'cooccurrence-viewer-style',
      'cooccurrence-filter-panel-style',
      'cooccurrence-word-list-panel-style',
      'cooccurrence-link-list-panel-style',
      'cooccurrence-cluster-list-panel-style',
      'cooccurrence-note-popup-style',
      'cooccurrence-note-editor-style',
      'cooccurrence-side-rail-style',
      'cooccurrence-minimap-panel-style',
      'cooccurrence-export-panel-style',
      'cooccurrence-button-base-style',
    ]) {
      document.getElementById(id)?.remove();
    }
  });

  it('図を開いた直後はポップアップが出ていない', () => {
    const { handle } = mount();

    expect(handle.getNotePopupState()).toBeNull();
  });

  it('語ごとに、その語自身の情報とメモが出る（隣の語の内容を出さない）', () => {
    const { container, handle } = mount();
    const element = canvas(container);
    resetViewport(element);

    const hits = findHits(element, handle);
    // 2 語とも拾えなければ「たまたま当たった 1 語」だけを見て合格にしてしまう。
    expect([...hits.nodes.keys()].sort()).toEqual([0, 1]);

    movePointer(element, hits.nodes.get(0)!.x, hits.nodes.get(0)!.y);
    expect(handle.getNotePopupState()).toMatchObject({
      kind: 'node',
      index: 0,
      title: 'Alpha',
      note: 'Alpha のメモ\n二行目',
    });

    movePointer(element, hits.nodes.get(1)!.x, hits.nodes.get(1)!.y);
    const beta = handle.getNotePopupState();
    expect(beta).toMatchObject({ kind: 'node', index: 1, title: 'Beta' });
    expect(beta?.note).toBeUndefined();
  });

  it('共起をホバーすると両端の語名・強度とメモが出る', () => {
    const { container, handle } = mount();
    const element = canvas(container);
    resetViewport(element);

    const hits = findHits(element, handle);
    expect(hits.link).not.toBeNull();

    movePointer(element, hits.link!.x, hits.link!.y);
    expect(handle.getNotePopupState()).toMatchObject({
      kind: 'link',
      index: 0,
      title: 'Alpha — Beta',
      note: '共起のメモ',
    });
  });

  it('メモを持たない語でもポップアップは出る', () => {
    const withoutNotes = file();
    delete withoutNotes.spec.notes;
    withoutNotes.meta.schemaVersion = 1;
    const { container, handle } = mount(withoutNotes);
    const element = canvas(container);
    resetViewport(element);

    const hits = findHits(element, handle);
    expect(hits.nodes.size).toBeGreaterThan(0);
    hoverNode(element, hits, 0);

    expect(handle.getNotePopupState()?.kind).toBe('node');
    expect(handle.getNotePopupState()?.note).toBeUndefined();
  });

  it('図の背景へ移すとポップアップが消える', () => {
    const { container, handle } = mount();
    const element = canvas(container);
    resetViewport(element);
    hoverNode(element, findHits(element, handle), 0);
    expect(handle.getNotePopupState()).not.toBeNull();

    // どの円からも線からも十分に離れた位置。
    movePointer(element, 10000, 10000);

    expect(handle.getNotePopupState()).toBeNull();
  });

  it('クラスタの一覧行をホバーするとクラスタのメモが出る', () => {
    const { container, handle } = mount();
    const clustersTab = container.querySelector('[role="tab"][aria-controls="cooc-panel-clusters"]');
    (clustersTab as HTMLButtonElement).click();

    const row = container.querySelector('#cooc-panel-clusters [role="option"]') as HTMLElement;
    row.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));

    const state = handle.getNotePopupState();
    expect(state?.kind).toBe('cluster');
    expect(state?.index).toBe(0);
    expect(state?.title).toBe('alpha-cluster');
    expect(state?.note).toBe('クラスタのメモ');

    row.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
    expect(handle.getNotePopupState()).toBeNull();
  });

  it('編集でファイルが差し替わるとポップアップを畳む（添字がずれた内容を出したままにしない）', () => {
    const { container, handle } = mount();
    const element = canvas(container);
    resetViewport(element);
    hoverNode(element, findHits(element, handle), 0);
    expect(handle.getNotePopupState()).not.toBeNull();

    handle.update({ file: file() });

    expect(handle.getNotePopupState()).toBeNull();
  });
});

/**
 * 円と線のそれぞれに当たる画面座標を探す。
 *
 * jsdom は要素の寸法を持たないため、視野の初期合わせが効かず、円が画面のどこへ来るかを
 * 事前に計算できない。格子状に探して、語ごとの最初の当たり位置と、線の当たり位置を記録する。
 */
function findHits(
  element: HTMLCanvasElement,
  handle: ReturnType<typeof mountCooccurrenceViewer>,
): { nodes: Map<number, { x: number; y: number }>; link: { x: number; y: number } | null } {
  const nodes = new Map<number, { x: number; y: number }>();
  let link: { x: number; y: number } | null = null;
  for (let x = -300; x <= 300; x += 5) {
    for (let y = -300; y <= 300; y += 5) {
      movePointer(element, x, y);
      const state = handle.getNotePopupState();
      if (state?.kind === 'node' && !nodes.has(state.index)) nodes.set(state.index, { x, y });
      if (state?.kind === 'link' && link === null) link = { x, y };
    }
  }
  return { nodes, link };
}

function hoverNode(
  element: HTMLCanvasElement,
  hits: ReturnType<typeof findHits>,
  nodeIndex: number,
): void {
  const point = hits.nodes.get(nodeIndex);
  if (point === undefined) throw new Error(`node ${nodeIndex} was never hit`);
  movePointer(element, point.x, point.y);
}
