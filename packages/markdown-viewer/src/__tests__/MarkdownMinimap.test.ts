/**
 * createMarkdownMinimap（vanilla）のユニットテスト。
 * G4-B 脱 React 移行で欠落していた変更オーバービューの回帰防止。
 */
import { createMarkdownMinimap } from "../components-vanilla/MarkdownMinimap";

// getChangedPositions をモックして変更位置を制御する。
jest.mock("../extensions/changeGutterExtension", () => ({
  getChangedPositions: jest.fn(() => [] as number[]),
}));
import { getChangedPositions } from "../extensions/changeGutterExtension";
const mockGetChangedPositions = getChangedPositions as jest.Mock;

const t = (key: string): string => key;

function makeScrollContainer(): HTMLElement {
  const el = document.createElement("div");
  // jsdom は実レイアウトを持たないため scrollHeight / getBoundingClientRect をスタブ。
  Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
  Object.defineProperty(el, "scrollTop", { value: 0, configurable: true });
  el.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  el.scrollTo = jest.fn();
  return el;
}

interface FakeEditor {
  isDestroyed: boolean;
  state: object;
  view: { domAtPos: jest.Mock };
  on: jest.Mock;
  off: jest.Mock;
  commands: { goToNextChange: jest.Mock; goToPrevChange: jest.Mock };
}

function makeEditor(elTop = 200): FakeEditor {
  // domAtPos は実 DOM ノードを返す。jsdom の getBoundingClientRect は 0 を返すためスタブする。
  const node = document.createElement("p");
  node.getBoundingClientRect = () => ({ top: elTop }) as DOMRect;
  return {
    isDestroyed: false,
    state: {},
    view: {
      domAtPos: jest.fn(() => ({ node })),
    },
    on: jest.fn(),
    off: jest.fn(),
    commands: { goToNextChange: jest.fn(), goToPrevChange: jest.fn() },
  };
}

describe("createMarkdownMinimap", () => {
  beforeEach(() => jest.clearAllMocks());

  it("前/次ボタンを生成し aria-label を i18n キーで付与する", () => {
    const editor = makeEditor();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: makeScrollContainer(),
      t,
    });
    const labels = Array.from(
      handle.el.querySelectorAll<HTMLButtonElement>("button"),
    ).map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["minimapPrevChange", "minimapNextChange"]);
    handle.destroy();
  });

  it("変更があるときマーカーを描画しボタンを活性化する", () => {
    mockGetChangedPositions.mockReturnValue([5, 10]);
    const editor = makeEditor();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: makeScrollContainer(),
      t,
    });
    expect(handle.el.querySelectorAll("[data-am-minimap-marker]")).toHaveLength(2);
    for (const btn of handle.el.querySelectorAll<HTMLButtonElement>("button")) {
      expect(btn.disabled).toBe(false);
    }
    handle.destroy();
  });

  it("変更がないときマーカー 0・ボタンは disabled", () => {
    mockGetChangedPositions.mockReturnValue([]);
    const editor = makeEditor();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: makeScrollContainer(),
      t,
    });
    expect(handle.el.querySelectorAll("[data-am-minimap-marker]")).toHaveLength(0);
    for (const btn of handle.el.querySelectorAll<HTMLButtonElement>("button")) {
      expect(btn.disabled).toBe(true);
    }
    handle.destroy();
  });

  it("ボタンクリックで goToPrevChange / goToNextChange を呼ぶ", () => {
    mockGetChangedPositions.mockReturnValue([5]);
    const editor = makeEditor();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: makeScrollContainer(),
      t,
    });
    const [prevBtn, nextBtn] = handle.el.querySelectorAll<HTMLButtonElement>("button");
    prevBtn.click();
    nextBtn.click();
    expect(editor.commands.goToPrevChange).toHaveBeenCalledTimes(1);
    expect(editor.commands.goToNextChange).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("バークリックで比率に応じてスクロールする", () => {
    const container = makeScrollContainer();
    const editor = makeEditor();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: container,
      t,
    });
    const bar = handle.el.querySelector<HTMLElement>("[data-am-minimap-bar]")!;
    bar.getBoundingClientRect = () => ({ top: 0, height: 400 }) as DOMRect;
    bar.dispatchEvent(new MouseEvent("click", { clientY: 200 }));
    // ratio = 200/400 = 0.5 → top = 0.5 * scrollHeight(1000) = 500
    expect(container.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ top: 500 }),
    );
    handle.destroy();
  });

  it("destroy で editor 購読・scroll listener・ResizeObserver を解除する", () => {
    const disconnect = jest.fn();
    const ResizeObserverMock = jest
      .fn()
      .mockImplementation(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect }));
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverMock;

    const editor = makeEditor();
    const container = makeScrollContainer();
    const removeSpy = jest.spyOn(container, "removeEventListener");

    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: container,
      t,
    });
    expect(editor.on).toHaveBeenCalledWith("update", expect.any(Function));

    handle.destroy();
    expect(editor.off).toHaveBeenCalledWith("update", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(disconnect).toHaveBeenCalledTimes(1);

    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  });

  it("setDiffSource で差分マーカー表示へ切替え、null で既定へ戻る", () => {
    mockGetChangedPositions.mockReturnValue([]); // 既定ソースは 0 件
    const editor = makeEditor();
    const defaultContainer = makeScrollContainer();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: defaultContainer,
      t,
    });
    expect(handle.el.querySelectorAll("[data-am-minimap-marker]")).toHaveLength(0);

    const diffContainer = makeScrollContainer();
    handle.setDiffSource({
      scrollContainer: diffContainer,
      getRatios: () => [0.25, 0.75],
    });
    // 差分ソースの 2 件が描画される。
    expect(handle.el.querySelectorAll("[data-am-minimap-marker]")).toHaveLength(2);

    handle.setDiffSource(null);
    // 既定（getChangedPositions=0件）へ戻る。
    expect(handle.el.querySelectorAll("[data-am-minimap-marker]")).toHaveLength(0);
    handle.destroy();
  });

  it("差分モードのバークリックは差分コンテナをスクロールする", () => {
    mockGetChangedPositions.mockReturnValue([]);
    const editor = makeEditor();
    const defaultContainer = makeScrollContainer();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: defaultContainer,
      t,
    });
    const diffContainer = makeScrollContainer();
    handle.setDiffSource({ scrollContainer: diffContainer, getRatios: () => [0.5] });

    const bar = handle.el.querySelector<HTMLElement>("[data-am-minimap-bar]")!;
    bar.getBoundingClientRect = () => ({ top: 0, height: 400 }) as DOMRect;
    bar.dispatchEvent(new MouseEvent("click", { clientY: 100 }));
    // 既定コンテナではなく差分コンテナがスクロールされる（ratio 0.25 * 1000 = 250）。
    expect(diffContainer.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 250 }));
    expect(defaultContainer.scrollTo).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("差分モードのナビは比率スクロール（editor コマンドを使わない）", () => {
    mockGetChangedPositions.mockReturnValue([]);
    const editor = makeEditor();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: makeScrollContainer(),
      t,
    });
    const diffContainer = makeScrollContainer(); // scrollTop=0, scrollHeight=1000
    handle.setDiffSource({ scrollContainer: diffContainer, getRatios: () => [0.25, 0.75] });

    const [, nextBtn] = handle.el.querySelectorAll<HTMLButtonElement>("button");
    nextBtn.click();
    // 現在位置 0 の次マーカー 0.25 → top 250 へスクロール。editor コマンドは呼ばれない。
    expect(diffContainer.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 250 }));
    expect(editor.commands.goToNextChange).not.toHaveBeenCalled();
    handle.destroy();
  });

  it("setActive(false) でルートを隠し refresh をスキップする", () => {
    mockGetChangedPositions.mockReturnValue([5]);
    const editor = makeEditor();
    const handle = createMarkdownMinimap({
      editor: editor as never,
      scrollContainer: makeScrollContainer(),
      t,
    });
    expect(handle.el.querySelectorAll("[data-am-minimap-marker]")).toHaveLength(1);

    handle.setActive(false);
    expect(handle.el.style.display).toBe("none");
    // 非アクティブ中は refresh しても再描画しない。
    handle.refresh();
    expect(handle.el.querySelectorAll("[data-am-minimap-marker]")).toHaveLength(1);

    handle.setActive(true);
    expect(handle.el.style.display).toBe("flex");
    handle.destroy();
  });
});
