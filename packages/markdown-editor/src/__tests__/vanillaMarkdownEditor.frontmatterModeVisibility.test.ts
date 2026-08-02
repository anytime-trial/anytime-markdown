/**
 * host/vanillaMarkdownEditor の「フロントマターブロックのモード別表示」回帰テスト。
 *
 * 要件（2026-07-11）: showFrontmatter 有効時、フロントマタースロットは
 *  - 編集(wysiwyg) / review モード → 表示
 *  - readonly（ユーザートグル） → 非表示（表示不要）
 *  - source モード → 非表示（生テキストに frontmatter を含めるため二重表示を防ぐ）
 *
 * スロット表示（frontmatterEl）は showFrontmatter とモードのみで決まり、ブロックの
 * frontmatter==null 自己非表示とは独立なので、本文なしでもモード別表示を検証できる。
 * mode 切替系の依存は compareClose テストと同形でモックし、host の表示制御のみ検証する。
 */

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [
    jest.requireActual("@anytime-markdown/markdown-starter-kit").default,
    jest.requireActual("../extensions/diffHighlight").DiffHighlight,
    jest.requireActual("../extensions/blockAlignSpacers").BlockAlignSpacers,
    jest.requireActual("../extensions/reviewModeExtension").ReviewModeExtension,
  ],
}));

jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

jest.mock("../utils/markdownSerializer", () => ({
  ...jest.requireActual("../utils/markdownSerializer"),
  getMarkdownFromEditorSafe: () => "MD",
}));

jest.mock("../utils/editorContentLoader", () => ({
  ...jest.requireActual("../utils/editorContentLoader"),
  applyMarkdownToEditor: () => ({ frontmatter: null, comments: new Map(), body: "" }),
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

class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe("mountVanillaMarkdownEditor フロントマターのモード別表示", () => {
  let container: HTMLElement;
  let originalRO: typeof ResizeObserver | undefined;

  beforeEach(() => {
    originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    if (originalRO) {
      globalThis.ResizeObserver = originalRO;
    } else {
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    }
    document.body.replaceChildren();
  });

  const slotDisplay = (): string => {
    const slot = container.querySelector<HTMLElement>("[data-am-frontmatter-slot]");
    if (!slot) throw new Error("frontmatter slot not found");
    return slot.style.display;
  };

  const clickMode = (mode: "wysiwyg" | "source" | "review" | "readonly"): void => {
    const btn = container.querySelector<HTMLButtonElement>(`button[aria-label="${mode}"]`);
    if (!btn) throw new Error(`mode button not found: ${mode}`);
    btn.click();
  };

  it("編集(wysiwyg)では表示・source では非表示・戻すと再表示", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      showFrontmatter: true,
      showReadonlyMode: true,
      persistModeState: false,
    });

    // 初期(wysiwyg): 表示。
    expect(slotDisplay()).not.toBe("none");

    // source: 生テキストに frontmatter が含まれるため非表示（二重表示防止）。
    clickMode("source");
    expect(slotDisplay()).toBe("none");

    // 編集へ戻す: 再表示。
    clickMode("wysiwyg");
    expect(slotDisplay()).not.toBe("none");

    handle.destroy();
  });

  it("readonly では非表示・review では表示", () => {
    const handle = mountVanillaMarkdownEditor(container, {
      t,
      showFrontmatter: true,
      showReadonlyMode: true,
      persistModeState: false,
    });

    // readonly: 表示不要。
    clickMode("readonly");
    expect(slotDisplay()).toBe("none");

    // 編集へ戻す。
    clickMode("wysiwyg");
    expect(slotDisplay()).not.toBe("none");

    // review: 表示する。
    clickMode("review");
    expect(slotDisplay()).not.toBe("none");

    handle.destroy();
  });
});
