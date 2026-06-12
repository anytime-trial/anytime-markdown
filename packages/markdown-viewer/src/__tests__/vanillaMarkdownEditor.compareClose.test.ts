/**
 * host/vanillaMarkdownEditor.ts の compare（merge）モード開閉のリグレッションテスト
 * （2026-06-10 レビュー補足: 潜在バグ B = update({externalCompareContent: null}) が
 * クローズ信号として握りつぶされる / 指摘 6 の Ctrl+Alt+M merge トグル）。
 *
 * merge ビュー（InlineMergeView）を実際に開くため、mock は
 * vanillaChrome.InlineMergeView.test.ts と同形（diff/align コマンド供給 + markdown 往復 no-op）。
 */

jest.mock("../buildEditorExtensions", () => ({
  buildEditorExtensions: () => [
    jest.requireActual("@anytime-markdown/markdown-starter-kit").default,
    jest.requireActual("../extensions/diffHighlight").DiffHighlight,
    jest.requireActual("../extensions/blockAlignSpacers").BlockAlignSpacers,
    jest.requireActual("../extensions/reviewModeExtension").ReviewModeExtension,
  ],
}));

// constants/templates は raw .md を import するため jest が解析できない（EditorMenuPopovers 経由）。
jest.mock("../constants/templates", () => ({
  getBuiltinTemplates: () => [],
}));

// StarterKit には tiptap-markdown storage が無いため、markdown 往復系を no-op / 固定値にする。
jest.mock("../utils/markdownSerializer", () => ({
  ...jest.requireActual("../utils/markdownSerializer"),
  getMarkdownFromEditorSafe: () => "MD",
}));
jest.mock("../utils/editorContentLoader", () => ({
  ...jest.requireActual("../utils/editorContentLoader"),
  applyMarkdownToEditor: () => ({ frontmatter: null, comments: new Map(), body: "" }),
}));
jest.mock("../utils/mergeContentSync", () => ({
  ...jest.requireActual("../utils/mergeContentSync"),
  normalizeCompareMarkdown: (_editor: unknown, raw: string) => raw,
}));

// @floating-ui/dom をモック（配置計算は本テストの対象外）。
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

// ResizeObserver を最小モック（jsdom 未実装・InlineMergeView が使用）。
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe("mountVanillaMarkdownEditor compare 開閉", () => {
  let container: HTMLElement;
  let originalRO: typeof ResizeObserver | undefined;

  beforeAll(() => {
    const emptyRects = (): DOMRectList =>
      ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
    Element.prototype.getClientRects = Element.prototype.getClientRects ?? emptyRects;
    Range.prototype.getClientRects = Range.prototype.getClientRects ?? emptyRects;
    Range.prototype.getBoundingClientRect =
      Range.prototype.getBoundingClientRect ?? (() => new DOMRect());
  });

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

  it("update({externalCompareContent}) で compare が開き、null への遷移で閉じる（潜在バグ B）", () => {
    const onCompareModeChange = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, { t, onCompareModeChange });

    handle.update({ externalCompareContent: "compare text" });
    expect(onCompareModeChange).toHaveBeenLastCalledWith(true);

    handle.update({ externalCompareContent: null });
    expect(onCompareModeChange).toHaveBeenLastCalledWith(false);

    handle.destroy();
  });

  it("null のまま（遷移なし）の patch では merge ビューを閉じない", () => {
    const onCompareModeChange = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, { t, onCompareModeChange });

    // toolbar の merge トグル相当（Ctrl+Alt+M）で開く（externalCompareContent は未設定のまま）。
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "m", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }),
    );
    expect(onCompareModeChange).toHaveBeenLastCalledWith(true);
    onCompareModeChange.mockClear();

    // Mount ラッパは live patch のたびに externalCompareContent（null のまま）を含めて送る。
    // 遷移していない null で閉じてはいけない。
    handle.update({ readOnly: false, externalCompareContent: null });
    expect(onCompareModeChange).not.toHaveBeenCalledWith(false);

    handle.destroy();
  });

  it("Ctrl+Alt+M で merge ビューがトグルする（指摘 6）", () => {
    const onCompareModeChange = jest.fn();
    const handle = mountVanillaMarkdownEditor(container, { t, onCompareModeChange });

    const press = (): void => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "m", ctrlKey: true, altKey: true, bubbles: true, cancelable: true }),
      );
    };
    press();
    expect(onCompareModeChange).toHaveBeenLastCalledWith(true);
    press();
    expect(onCompareModeChange).toHaveBeenLastCalledWith(false);

    handle.destroy();
  });

  it("同一 externalCompareContent の再 patch では再適用しない（変化検知）", () => {
    const handle = mountVanillaMarkdownEditor(container, { t });

    handle.update({ externalCompareContent: "same" });
    // 再 patch（テーマ変更などの相乗り）で例外なく no-op で通ること。
    expect(() => {
      handle.update({ externalCompareContent: "same", readOnly: false });
    }).not.toThrow();

    handle.destroy();
  });
});
