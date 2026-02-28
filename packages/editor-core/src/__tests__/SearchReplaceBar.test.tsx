import { render, screen, fireEvent, act } from "@testing-library/react";
import { SearchReplaceBar } from "../components/SearchReplaceBar";

// MUI useTheme モック
jest.mock("@mui/material", () => {
  const actual = jest.requireActual("@mui/material");
  return {
    ...actual,
    useTheme: () => ({
      palette: { mode: "light" },
    }),
  };
});

const t = (key: string, values?: Record<string, string | number>) => {
  if (values) {
    return `${key}:${JSON.stringify(values)}`;
  }
  return key;
};

/** テスト用 editor モックを生成 */
function createMockEditor(storageOverrides: Record<string, unknown> = {}) {
  const storage = {
    searchReplace: {
      searchTerm: "",
      replaceTerm: "",
      caseSensitive: false,
      wholeWord: false,
      useRegex: false,
      results: [] as unknown[],
      currentIndex: 0,
      isOpen: false,
      showReplace: false,
      onSearchStateChange: undefined as (() => void) | undefined,
      ...storageOverrides,
    },
  };
  return {
    storage,
    state: {
      selection: { from: 0, to: 0 },
      doc: { textBetween: () => "" },
    },
    commands: {
      setSearchTerm: jest.fn(),
      setReplaceTerm: jest.fn(),
      closeSearch: jest.fn(),
      focus: jest.fn(),
      goToNextMatch: jest.fn(),
      goToPrevMatch: jest.fn(),
      replaceCurrentMatch: jest.fn(),
      replaceAllMatches: jest.fn(),
      toggleCaseSensitive: jest.fn(),
      toggleWholeWord: jest.fn(),
      toggleUseRegex: jest.fn(),
    },
  } as unknown as import("@tiptap/react").Editor;
}

/** SearchReplaceBar を表示状態にする（isOpen フラグをシミュレート） */
function openSearchBar(editor: import("@tiptap/react").Editor) {
  act(() => {
    editor.storage.searchReplace.isOpen = true;
    editor.storage.searchReplace.onSearchStateChange?.();
  });
}

describe("SearchReplaceBar", () => {
  test("isVisible=false のとき何もレンダリングしない", () => {
    const editor = createMockEditor();
    const { container } = render(<SearchReplaceBar editor={editor} t={t} />);
    expect(container.firstChild).toBeNull();
  });

  test("openSearch でバーが表示される", () => {
    const editor = createMockEditor();
    const { container } = render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);
    expect(container.firstChild).toBeTruthy();
  });

  test("検索入力が正しいaria-labelで表示される", () => {
    const editor = createMockEditor();
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    const input = screen.getByLabelText("searchPlaceholder");
    expect(input).toBeTruthy();
    expect(input.tagName).toBe("INPUT");
  });

  test("検索入力に入力するとsetSearchTermコマンドが呼ばれる", () => {
    jest.useFakeTimers();
    const editor = createMockEditor();
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    const input = screen.getByLabelText("searchPlaceholder");
    fireEvent.change(input, { target: { value: "hello" } });

    // デバウンス(300ms)を待つ
    jest.advanceTimersByTime(300);

    expect(editor.commands.setSearchTerm).toHaveBeenCalledWith("hello");
    jest.useRealTimers();
  });

  test("検索語があるときマッチ数が表示される", () => {
    const editor = createMockEditor({
      searchTerm: "test",
      results: [{}, {}, {}],
      currentIndex: 1,
    });
    const { container } = render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // aria-live="polite" の要素を取得
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeTruthy();
    // t("searchResults", { current: "2", total: "3" })
    expect(liveRegion!.textContent).toBe('searchResults:{"current":"2","total":"3"}');
  });

  test("replaceボタンをクリックするとreplaceCurrentMatchが呼ばれる", () => {
    const editor = createMockEditor({
      searchTerm: "test",
      results: [{}],
      currentIndex: 0,
    });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // replace パネルを開くトグルボタン（最初の "replace" aria-label）
    const toggleBtn = screen.getAllByLabelText("replace")[0];
    fireEvent.click(toggleBtn);

    // パネルが開いた後、replace ボタンが追加される（2つ目の "replace" aria-label）
    const replaceButtons = screen.getAllByLabelText("replace");
    // 最後の replace ボタンがアクションボタン
    const replaceActionBtn = replaceButtons[replaceButtons.length - 1];
    fireEvent.click(replaceActionBtn);

    expect(editor.commands.replaceCurrentMatch).toHaveBeenCalledTimes(1);
  });

  test("replaceAllボタンをクリックするとreplaceAllMatchesが呼ばれる", () => {
    const editor = createMockEditor({
      searchTerm: "test",
      results: [{}],
      currentIndex: 0,
    });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // replace パネルを開く
    const toggleBtn = screen.getAllByLabelText("replace")[0];
    fireEvent.click(toggleBtn);

    // Tooltip の span と button の両方に aria-label が付くため getAllByLabelText を使用
    const replaceAllElements = screen.getAllByLabelText("replaceAll");
    const replaceAllBtn = replaceAllElements.find((el) => el.tagName === "BUTTON")!;
    fireEvent.click(replaceAllBtn);

    expect(editor.commands.replaceAllMatches).toHaveBeenCalledTimes(1);
  });

  test("clearSearchボタンをクリックすると検索がクリアされる", () => {
    const editor = createMockEditor({
      searchTerm: "test",
    });
    render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);

    // searchTerm が "test" なので clearSearch ボタンが表示される
    const clearBtn = screen.getByLabelText("clearSearch");
    fireEvent.click(clearBtn);

    expect(editor.commands.setSearchTerm).toHaveBeenCalledWith("");
  });

  test("閉じるボタンをクリックするとバーが非表示になる", () => {
    const editor = createMockEditor();
    const { container } = render(<SearchReplaceBar editor={editor} t={t} />);
    openSearchBar(editor);
    expect(container.firstChild).toBeTruthy();

    const closeBtn = screen.getByLabelText("close");
    fireEvent.click(closeBtn);

    expect(container.firstChild).toBeNull();
    expect(editor.commands.closeSearch).toHaveBeenCalledTimes(1);
  });
});
