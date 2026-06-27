/**
 * host/vanillaMarkdownEditor の「ソースモードから比較モードに入ったときの表示」回帰テスト。
 *
 * ソースモード状態で比較モードに入ると、比較ビュー（InlineMergeView）が左右の source 差分を
 * 表示すべきだが、editor（editorMountEl）が contentEl に残って `display:""` になると単一の
 * WYSIWYG ペインが見えてしまう。比較中は sourceMode のとき editor.view.dom を隠すことを保証する。
 *
 * InlineMergeView は diff/align 拡張を要し jsdom で重いためモックし、host の表示制御のみ検証する。
 */

import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));
jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));
jest.mock("@floating-ui/dom", () => ({
  computePosition: jest.fn(() =>
    Promise.resolve({ x: 0, y: 0, placement: "bottom-start", middlewareData: {} }),
  ),
  autoUpdate: jest.fn(() => () => {}),
  offset: jest.fn(() => ({})),
  flip: jest.fn(() => ({})),
  shift: jest.fn(() => ({})),
}));
// InlineMergeView は実体が重い（diff/align コマンド必須）ためスタブ化し、host の
// editor.view.dom display 制御だけを検証する。
jest.mock("../components-vanilla/InlineMergeView", () => ({
  createInlineMergeView: () => ({
    el: document.createElement("div"),
    update: jest.fn(),
    // ミニマップ差分配線（setDiffSource）が参照する。scrollContainer は実 element が必要。
    getRightScroller: () => document.createElement("div"),
    getDiffBlockRatios: () => [],
    destroy: jest.fn(),
  }),
}));

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

describe("比較モード × ソースモードの editor 表示制御", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("ソースモードから比較モードに入ると editor は隠れる（単一WYSIWYG表示の回帰防止）", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      defaultSourceMode: true,
      persistModeState: false,
    });
    // 初期ソースモード: editor は隠れている。
    expect(handle.editor.view.dom.style.display).toBe("none");

    const compareBtn = container.querySelector<HTMLButtonElement>('button[aria-label="compare"]');
    expect(compareBtn).toBeTruthy();
    compareBtn?.click();

    // ソース比較では比較ビューが表示を担い、editor.view.dom は隠れたままにする。
    expect(handle.editor.view.dom.style.display).toBe("none");
    handle.destroy();
  });

  it("通常(WYSIWYG)から比較モードに入ると editor は表示される（右ペイン不可視の回帰防止）", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      persistModeState: false,
    });
    const compareBtn = container.querySelector<HTMLButtonElement>('button[aria-label="compare"]');
    compareBtn?.click();

    // WYSIWYG 比較では右ペインへ移設した editor を表示する。
    expect(handle.editor.view.dom.style.display).not.toBe("none");
    handle.destroy();
  });
});
