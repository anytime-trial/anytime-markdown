/**
 * @jest-environment jsdom
 *
 * 右クリックコンテキストメニュー配線（host/mountVanillaGraphEditor.ts）の jsdom 統合テスト。
 *
 * 対象コミット: f4eccab5b（配線）、89b6a1b2f（applyContextSelection 抽出）。
 *
 * jsdom は getBoundingClientRect が常に 0 を返し、ノード配置に基づく当たり判定
 * （resolveContextTarget の node/edge 分岐）を再現できない。そのためここでは
 * 空キャンバス右クリック（targetType: 'canvas'）だけを対象にする。
 *
 * ロケールは createGraphT の detectLocale() が navigator.language（jsdom 既定 en-US）で
 * 判定するため、英語ラベル（Paste / Select All、src/i18n/en.json）を期待する。
 */

import { createDocument, createNode } from '@anytime-markdown/graph-core';
import type { GraphDocument } from '@anytime-markdown/graph-core';
import { mountVanillaGraphEditor } from '../host/mountVanillaGraphEditor';
import type { GraphEditorHandle } from '../host/mountVanillaGraphEditor';
import type { PersistenceAdapter } from '../types/persistence';

// --- jsdom 補完 ---
// GraphCanvas.ts は canvas 2D context・ResizeObserver・matchMedia（reduced-motion 監視）を
// 使うが、jsdom はいずれも未実装のため mount 自体が例外になる。
// mountVanillaGraphEditor 配下の実描画パス（GraphCanvas 本体・minimap 双方）は多数の
// CanvasRenderingContext2D メソッドを呼ぶため、個別列挙ではなく Proxy で未知のメソッド呼び出しを
// すべて no-op にする（packages/graph-core/src/__tests__/AnytimeGraphElement.test.ts の列挙型
// スタブは GraphCanvas の全描画パスをカバーしないため、本ファイルはこちらの方式を採る）。
function createStubCtx(): CanvasRenderingContext2D {
  const store: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop in target) return target[prop as string];
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  };
  return new Proxy(store, handler) as unknown as CanvasRenderingContext2D;
}
const stubCtx = createStubCtx();

beforeAll(() => {
  // @ts-expect-error jsdom の getContext を最小スタブで置換
  HTMLCanvasElement.prototype.getContext = () => stubCtx;

  // jest-environment-jsdom のグローバルには structuredClone が無い（graph-core の
  // reducer.ts が履歴スナップショットの deep clone に使用する）。
  globalThis.structuredClone ??= <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
});

function emptyPersistence(): PersistenceAdapter {
  return { loadInitial: () => null, save: () => {}, status: 'saved' };
}

/** 初期ロードの async IIFE（loadInitial → Promise.resolve → dispatch）を待つ。 */
async function flushInitialLoad(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function getCanvasEl(container: HTMLElement): HTMLCanvasElement {
  const el = container.querySelector('canvas');
  if (!el) throw new Error('canvas element not found');
  return el;
}

/** 空キャンバス（ノードが存在しない座標）を右クリックする。 */
function rightClickEmptyCanvas(canvasEl: HTMLElement): void {
  canvasEl.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 9000, clientY: 9000 }),
  );
}

function queryMenuPaper(): Element | null {
  return document.body.querySelector('.gv-menu-paper');
}

function queryMenuBackdrop(): Element | null {
  return document.body.querySelector('.gv-menu-backdrop');
}

function queryMenuItems(): Element[] {
  return Array.from(document.body.querySelectorAll('.gv-menu-paper [role="menuitem"]'));
}

describe('右クリックコンテキストメニュー配線（canvas 対象）', () => {
  let container: HTMLElement;
  let handle: GraphEditorHandle | null = null;
  let originalClipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // jsdom には navigator.clipboard が無い。pasteFromClipboard() の readText 経路を
    // 再現するため、読み取り拒否（rejected）と writeText no-op でスタブする。
    // navigator.clipboard は getter-only のことがあるため defineProperty で置換し、
    // 元の記述子を afterEach で復元する。
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: jest.fn().mockRejectedValue(new Error('denied')),
        writeText: jest.fn(),
      },
    });
  });

  afterEach(() => {
    handle?.destroy();
    handle = null;
    document.body.innerHTML = '';

    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    } else {
      // 元々未定義だった場合は削除して漏れを防ぐ。
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('空キャンバス右クリックで document.body にメニューが mount される', () => {
    handle = mountVanillaGraphEditor(container, { persistence: emptyPersistence() });

    rightClickEmptyCanvas(getCanvasEl(container));

    expect(queryMenuBackdrop()).not.toBeNull();
    const paper = queryMenuPaper();
    expect(paper).not.toBeNull();
    expect(paper?.getAttribute('role')).toBe('menu');
  });

  it('canvas 対象のメニューには Paste と Select All が表示される', () => {
    handle = mountVanillaGraphEditor(container, { persistence: emptyPersistence() });

    rightClickEmptyCanvas(getCanvasEl(container));

    const items = queryMenuItems();
    const labels = items.map((el) => el.textContent ?? '');
    expect(labels.some((label) => label.includes('Paste'))).toBe(true);
    expect(labels.some((label) => label.includes('Select All'))).toBe(true);
    // canvas 対象は Paste / Select All の 2 項目のみ（node/edge 分岐の項目は出ない）
    expect(items).toHaveLength(2);
  });

  it('クリップボードが空でも Paste 項目は有効（システムクリップボード非対称の回避）', () => {
    // hasClipboard: true 固定（c572b1d2e 以降）。内部クリップボードだけで disabled を
    // 決めると、別ドキュメントでコピー→ Ctrl+V は貼れるのにメニュー Paste だけ押せない
    // 非対称が生じるため、常に有効化し pasteFromClipboard() の no-op に委ねる仕様。
    handle = mountVanillaGraphEditor(container, { persistence: emptyPersistence() });

    rightClickEmptyCanvas(getCanvasEl(container));

    const pasteItem = queryMenuItems().find((el) => el.textContent?.includes('Paste'));
    expect(pasteItem).toBeDefined();
    expect(pasteItem?.getAttribute('aria-disabled')).not.toBe('true');
    expect(pasteItem?.className).not.toContain('gv-menu-item--disabled');
  });

  it('クリップボードが空のまま Paste をクリックしても例外なくノードが増えない', async () => {
    handle = mountVanillaGraphEditor(container, { persistence: emptyPersistence() });
    await flushInitialLoad();

    const canvasEl = getCanvasEl(container);
    rightClickEmptyCanvas(canvasEl);

    const pasteItem = queryMenuItems().find((el) => el.textContent?.includes('Paste'));
    expect(pasteItem).toBeDefined();

    // pasteFromClipboard() は navigator.clipboard.readText() を試み、失敗時は内部
    // クリップボード（空なら null → no-op）へフォールバックする。読み取り拒否を再現する。
    expect(() => {
      pasteItem?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }).not.toThrow();

    // pasteFromClipboard() は async。readText の rejected と後続マイクロタスクを流す。
    await flushInitialLoad();

    // メニューは閉じ、空キャンバスのまま（ノードが増えていない）。
    expect(queryMenuPaper()).toBeNull();
    const liveRegion = container.querySelector('[role="status"]');
    // 空キャンバスのアナウンス（emptyOverlay 表示）。nodeAdded は発火していない。
    expect(canvasEl.getAttribute('aria-label')).toContain('0 nodes');
  });

  it('handle.destroy() でメニューと backdrop が DOM から消える', () => {
    handle = mountVanillaGraphEditor(container, { persistence: emptyPersistence() });

    rightClickEmptyCanvas(getCanvasEl(container));
    expect(queryMenuPaper()).not.toBeNull();
    expect(queryMenuBackdrop()).not.toBeNull();

    handle.destroy();
    handle = null;

    expect(queryMenuPaper()).toBeNull();
    expect(queryMenuBackdrop()).toBeNull();
  });

  it('メニュー外のクリックで閉じる', () => {
    handle = mountVanillaGraphEditor(container, { persistence: emptyPersistence() });
    const canvasEl = getCanvasEl(container);

    rightClickEmptyCanvas(canvasEl);
    expect(queryMenuPaper()).not.toBeNull();

    // メニュー（paper）に含まれない要素でのクリック → handleGlobalClick が closeContextMenu()
    canvasEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(queryMenuPaper()).toBeNull();
    expect(queryMenuBackdrop()).toBeNull();
  });

  it('backdrop の mousedown で閉じ、backdrop が残留しない（89b6a1b2f 回帰防止）', () => {
    // Menu.ts の backdrop mousedown は close() を経由せず onClose() を直接呼ぶため、
    // mountVanillaGraphEditor 側の onClose が closeContextMenu()（= handle.close() 保証）を
    // 呼んでいないと backdrop が DOM に残留し、以降の全面クリックを遮断する。
    handle = mountVanillaGraphEditor(container, { persistence: emptyPersistence() });

    rightClickEmptyCanvas(getCanvasEl(container));
    const backdrop = queryMenuBackdrop();
    expect(backdrop).not.toBeNull();

    backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(queryMenuBackdrop()).toBeNull();
    expect(queryMenuPaper()).toBeNull();
  });

  it('Select All クリックで SELECT_ALL が反映され、例外なくメニューが閉じる', async () => {
    const doc: GraphDocument = {
      ...createDocument('sample'),
      nodes: [createNode('rect', 0, 0), createNode('rect', 200, 0)],
    };
    const persistence: PersistenceAdapter = {
      loadInitial: () => doc,
      save: () => {},
      status: 'saved',
    };

    handle = mountVanillaGraphEditor(container, { persistence });
    await flushInitialLoad();

    const canvasEl = getCanvasEl(container);
    expect(() => rightClickEmptyCanvas(canvasEl)).not.toThrow();

    const selectAllItem = queryMenuItems().find((el) => el.textContent?.includes('Select All'));
    expect(selectAllItem).toBeDefined();

    expect(() => {
      selectAllItem?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }).not.toThrow();

    // handleAction → onClose 経由でメニューが閉じる
    expect(queryMenuPaper()).toBeNull();
    expect(queryMenuBackdrop()).toBeNull();

    // syncUI の選択変化アナウンス（aria-live）で SELECT_ALL の反映を観測する。
    // store は closure 内に閉じており外部から直接参照できないため、この aria-live
    // テキストが唯一の外部から観測可能な反映結果。
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion?.textContent).toContain('2');
    expect(liveRegion?.textContent).toContain('nodes selected');
    expect(liveRegion?.textContent).toContain('0');
    expect(liveRegion?.textContent).toContain('edges selected');
  });
});
