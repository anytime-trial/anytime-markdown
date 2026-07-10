/**
 * host/vanillaMarkdownEditor.ts — サイドツールバーへの explorer 配線のリグレッションテスト。
 *
 * 上部ツールバーの explorer ボタンは sideToolbar 併用時に data-am-side-coupled が付き、
 * @media (min-width: 900px) で display:none になる（EditorToolbar.ts）。受け皿である
 * サイドツールバーへ onToggleExplorer を配線しないと、900px 以上で explorer トグルが
 * どこにも描画されない（jsdom は media query を評価しないためユニットでは可視性を検証できず、
 * 「サイドツールバーに項目が生成されるか」で検知する）。
 *
 * mock 方針は vanillaMarkdownEditor.regression.test.ts と同一。
 */
import { StarterKit } from "@anytime-markdown/markdown-starter-kit";

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [StarterKit],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

jest.mock("../utils/markdownSerializer", () => ({
  ...jest.requireActual("../utils/markdownSerializer"),
  getMarkdownFromEditorSafe: () => "MD",
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

import { mountVanillaMarkdownEditor } from "../host/vanillaMarkdownEditor";

const t = (key: string): string => key;

beforeAll(() => {
  const emptyRects = (): DOMRectList =>
    ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.getClientRects = Element.prototype.getClientRects ?? emptyRects;
  Range.prototype.getClientRects = Range.prototype.getClientRects ?? emptyRects;
  Range.prototype.getBoundingClientRect =
    Range.prototype.getBoundingClientRect ?? (() => new DOMRect());
});

describe("mountVanillaMarkdownEditor — サイドツールバーの explorer トグル", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.replaceChildren();
  });

  /** サイドツールバースロット内の explorer ボタンを取得する。 */
  function sideExplorerButton(): HTMLButtonElement | null {
    const slot = container.querySelector("[data-am-side-toolbar-slot]");
    return slot?.querySelector<HTMLButtonElement>('button[aria-label="explorer"]') ?? null;
  }

  it("sideToolbar 有効時はサイドツールバーに explorer ボタンを描画する", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      sideToolbar: true,
    });

    expect(sideExplorerButton()).not.toBeNull();

    handle.destroy();
  });

  it("hide.explorer 指定時はサイドツールバーにも explorer ボタンを描画しない", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      sideToolbar: true,
      hide: { explorer: true },
    });

    expect(sideExplorerButton()).toBeNull();

    handle.destroy();
  });

  it("explorer ボタンのクリックでパネル開閉状態がトグルされ active 表示が追従する", () => {
    const modes: boolean[] = [];
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      initialContent: "# a",
      sideToolbar: true,
      onModeChange: (state) => modes.push(state.explorerOpen === true),
    });

    const btn = sideExplorerButton();
    expect(btn).not.toBeNull();
    btn?.click();
    expect(modes.at(-1)).toBe(true);
    btn?.click();
    expect(modes.at(-1)).toBe(false);

    handle.destroy();
  });
});
