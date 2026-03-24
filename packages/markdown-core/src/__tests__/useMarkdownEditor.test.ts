import { renderHook, act } from "@testing-library/react";
import { useMarkdownEditor } from "../useMarkdownEditor";
import { STORAGE_KEY_CONTENT } from "../constants/storageKeys";

const STORAGE_KEY = STORAGE_KEY_CONTENT;

describe("useMarkdownEditor", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("localStorageからコンテンツを読み込む", () => {
    localStorage.setItem(STORAGE_KEY, "# Saved");

    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    expect(result.current.initialContent).toBe("# Saved");
    expect(result.current.loading).toBe(false);
  });

  test("localStorageが空の場合はデフォルトコンテンツを使用", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    expect(result.current.initialContent).toBe("# Default");
    expect(result.current.loading).toBe(false);
  });

  test("500msのdebounceでlocalStorageに保存", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    act(() => {
      result.current.saveContent("# Updated");
    });

    // まだ保存されていない
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // 保存完了
    expect(localStorage.getItem(STORAGE_KEY)).toBe("# Updated");
  });

  test("debounce中の連続呼び出しは最後の値のみ保存", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    act(() => {
      result.current.saveContent("# First");
    });
    act(() => {
      jest.advanceTimersByTime(200);
      result.current.saveContent("# Second");
    });
    act(() => {
      jest.advanceTimersByTime(200);
      result.current.saveContent("# Third");
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe("# Third");
  });

  test("clearContentでlocalStorageを空文字列にクリア", () => {
    localStorage.setItem(STORAGE_KEY, "# Saved");
    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    act(() => {
      result.current.clearContent();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe("");
  });
});
