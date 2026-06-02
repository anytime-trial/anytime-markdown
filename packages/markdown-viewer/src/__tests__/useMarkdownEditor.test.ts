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

  test("saveContent にプロデューサ関数を渡すと、500ms 後に1回だけ解決して保存する", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    const producer = jest.fn(() => "# Lazy");

    act(() => {
      result.current.saveContent(producer);
    });

    // debounce 経過前はプロデューサ未解決（打鍵中はシリアライズしない）
    expect(producer).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(producer).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("# Lazy");
  });

  test("プロデューサの連続呼び出しは最後の1回だけ解決される", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    const p1 = jest.fn(() => "# A");
    const p2 = jest.fn(() => "# B");

    act(() => {
      result.current.saveContent(p1);
    });
    act(() => {
      jest.advanceTimersByTime(200);
      result.current.saveContent(p2);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(p1).not.toHaveBeenCalled();
    expect(p2).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("# B");
  });

  test("プロデューサが null を返すと保存をスキップする", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    act(() => {
      result.current.saveContent(() => null);
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
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
