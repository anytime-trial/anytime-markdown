/**
 * components-vanilla/SearchReplaceBar.ts — 脱React の vanilla 検索/置換バーのテスト。
 *
 * G4-B で旧 React 版 SearchReplaceBar.tsx が vanilla 代替なしに削除され、Mod-f
 * （searchReplaceExtension の openSearch）を押してもバーが出ない退行のリグレッション。
 *
 * 検証観点:
 *   1. 初期状態は非表示（display:none）・role=search
 *   2. extension の onSearchStateChange（isOpen=true）で表示・検索 input へフォーカス
 *   3. 選択テキストを初期検索語にプリフィル（setSearchTerm 発火）
 *   4. 入力はデバウンス 200ms 後に setSearchTerm
 *   5. Enter / Shift+Enter で goToNextMatch / goToPrevMatch
 *   6. Escape で closeSearch + 非表示
 *   7. カウンタ表示（searchResults / noResults）
 *   8. Aa / Ab| / .* トグルがコマンドを発火
 *   9. 置換行のトグルと replaceCurrentMatch / replaceAllMatches
 *  10. destroy で onSearchStateChange 解除と DOM 除去
 */

import { createSearchReplaceBar } from "../components-vanilla/SearchReplaceBar";

const t = (key: string, values?: Record<string, string | number>) => {
  if (key === "searchResults") return `${values?.current} / ${values?.total}`;
  return key;
};

interface MockStorage {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  results: Array<{ from: number; to: number }>;
  currentIndex: number;
  isOpen: boolean;
  showReplace: boolean;
  onSearchStateChange?: () => void;
}

function makeEditor(over: { selectionText?: string } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const storage: MockStorage = {
    searchTerm: "",
    replaceTerm: "",
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    results: [],
    currentIndex: 0,
    isOpen: false,
    showReplace: false,
    onSearchStateChange: undefined,
  };
  const commands = new Proxy(
    {},
    {
      get(_t, prop) {
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return true;
        };
      },
    },
  );
  const selText = over.selectionText ?? "";
  const editor = {
    storage: { searchReplace: storage },
    commands,
    state: {
      selection: { from: 1, to: selText ? 1 + selText.length : 1 },
      doc: { textBetween: () => selText },
    },
  } as never;
  return { editor, storage, calls };
}

function mount(over: { selectionText?: string } = {}) {
  const m = makeEditor(over);
  const handle = createSearchReplaceBar({ editor: m.editor, t });
  document.body.appendChild(handle.el);
  return { ...m, handle };
}

/** extension の openSearch 相当（isOpen を立てて状態変更を通知する）。 */
function fireOpen(storage: MockStorage): void {
  storage.isOpen = true;
  storage.showReplace = false;
  storage.onSearchStateChange?.();
}

afterEach(() => {
  jest.useRealTimers();
  document.body.replaceChildren();
});

describe("createSearchReplaceBar", () => {
  it("初期状態は非表示で role=search を持つ", () => {
    const { handle } = mount();
    expect(handle.el.getAttribute("role")).toBe("search");
    expect(handle.el.style.display).toBe("none");
    handle.destroy();
  });

  it("onSearchStateChange(isOpen) で表示され検索 input にフォーカスされる", () => {
    jest.useFakeTimers();
    const { handle, storage } = mount();
    fireOpen(storage);
    expect(handle.el.style.display).not.toBe("none");
    // isOpen フラグは consume される（旧 React 実装と同一）。
    expect(storage.isOpen).toBe(false);
    jest.advanceTimersByTime(60);
    const input = handle.el.querySelector<HTMLInputElement>(
      'input[aria-label="searchPlaceholder"]',
    );
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
    handle.destroy();
  });

  it("選択テキストがあれば初期検索語にして setSearchTerm を発火する", () => {
    const { handle, storage, calls } = mount({ selectionText: "apple" });
    fireOpen(storage);
    const input = handle.el.querySelector<HTMLInputElement>(
      'input[aria-label="searchPlaceholder"]',
    );
    expect(input?.value).toBe("apple");
    expect(calls).toContainEqual({ method: "setSearchTerm", args: ["apple"] });
    handle.destroy();
  });

  it("入力はデバウンス 200ms 後に setSearchTerm を発火する", () => {
    jest.useFakeTimers();
    const { handle, storage, calls } = mount();
    fireOpen(storage);
    const input = handle.el.querySelector<HTMLInputElement>(
      'input[aria-label="searchPlaceholder"]',
    )!;
    input.value = "foo";
    input.dispatchEvent(new Event("input"));
    expect(calls.find((c) => c.method === "setSearchTerm")).toBeUndefined();
    jest.advanceTimersByTime(200);
    expect(calls).toContainEqual({ method: "setSearchTerm", args: ["foo"] });
    handle.destroy();
  });

  it("Enter / Shift+Enter で next / prev、Escape で closeSearch + 非表示", () => {
    const { handle, storage, calls } = mount();
    fireOpen(storage);
    const input = handle.el.querySelector<HTMLInputElement>(
      'input[aria-label="searchPlaceholder"]',
    )!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(calls.some((c) => c.method === "goToNextMatch")).toBe(true);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(calls.some((c) => c.method === "goToPrevMatch")).toBe(true);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(calls.some((c) => c.method === "closeSearch")).toBe(true);
    expect(handle.el.style.display).toBe("none");
    handle.destroy();
  });

  it("結果ありで {current}/{total}、結果なしで noResults を表示する", () => {
    jest.useFakeTimers();
    const { handle, storage } = mount();
    fireOpen(storage);
    const input = handle.el.querySelector<HTMLInputElement>(
      'input[aria-label="searchPlaceholder"]',
    )!;
    input.value = "foo";
    input.dispatchEvent(new Event("input"));
    jest.advanceTimersByTime(200);
    storage.searchTerm = "foo";
    storage.results = [{ from: 1, to: 4 }, { from: 5, to: 8 }];
    storage.currentIndex = 1;
    storage.onSearchStateChange?.();
    expect(handle.el.textContent).toContain("2 / 2");
    storage.results = [];
    storage.currentIndex = 0;
    storage.onSearchStateChange?.();
    expect(handle.el.textContent).toContain("noResults");
    handle.destroy();
  });

  it("Aa / 単語 / 正規表現トグルが対応コマンドを発火する", () => {
    const { handle, storage, calls } = mount();
    fireOpen(storage);
    handle.el.querySelector<HTMLButtonElement>('button[aria-label="caseSensitive"]')?.click();
    handle.el.querySelector<HTMLButtonElement>('button[aria-label="wholeWord"]')?.click();
    handle.el.querySelector<HTMLButtonElement>('button[aria-label="regex"]')?.click();
    expect(calls.some((c) => c.method === "toggleCaseSensitive")).toBe(true);
    expect(calls.some((c) => c.method === "toggleWholeWord")).toBe(true);
    expect(calls.some((c) => c.method === "toggleUseRegex")).toBe(true);
    handle.destroy();
  });

  it("置換行のトグルで replace input が現れ replace / replaceAll を発火する", () => {
    const { handle, storage, calls } = mount();
    fireOpen(storage);
    // 置換行は折りたたみトグル（aria-label=replace の最初のボタン）で開く。
    handle.el.querySelector<HTMLButtonElement>('button[aria-label="replace"]')?.click();
    const replaceInput = handle.el.querySelector<HTMLInputElement>(
      'input[aria-label="replacePlaceholder"]',
    );
    expect(replaceInput).toBeTruthy();
    // 結果ありにして replace ボタンを有効化。
    storage.results = [{ from: 1, to: 4 }];
    storage.onSearchStateChange?.();
    const btns = [...handle.el.querySelectorAll<HTMLButtonElement>('button[aria-label="replace"]')];
    btns.at(-1)?.click();
    handle.el.querySelector<HTMLButtonElement>('button[aria-label="replaceAll"]')?.click();
    expect(calls.some((c) => c.method === "replaceCurrentMatch")).toBe(true);
    expect(calls.some((c) => c.method === "replaceAllMatches")).toBe(true);
    handle.destroy();
  });

  it("destroy で onSearchStateChange を解除し DOM を除去する", () => {
    const { handle, storage } = mount();
    expect(storage.onSearchStateChange).toBeDefined();
    handle.destroy();
    expect(storage.onSearchStateChange).toBeUndefined();
    expect(document.body.contains(handle.el)).toBe(false);
  });
});
