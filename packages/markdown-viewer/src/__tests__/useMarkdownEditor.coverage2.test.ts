/**
 * useMarkdownEditor.ts coverage2 tests
 * Targets uncovered lines: 39-40 (localStorage exception), 57-60 (QuotaExceeded),
 *   70-74 (downloadMarkdown with encoding)
 */
import { renderHook, act } from "@testing-library/react";
import { useMarkdownEditor } from "../useMarkdownEditor";
import { STORAGE_KEY_CONTENT } from "../constants/storageKeys";

describe("useMarkdownEditor coverage2", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // --- Lines 39-40: localStorage.getItem throws exception ---
  it("falls back to defaultContent when localStorage throws", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage unavailable");
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useMarkdownEditor("# Fallback"));
    expect(result.current.initialContent).toBe("# Fallback");
    expect(warnSpy).toHaveBeenCalledWith("Failed to read localStorage:", expect.any(Error));

    spy.mockRestore();
    warnSpy.mockRestore();
  });

  // --- Lines 57-60: QuotaExceededError during saveContent ---
  it("handles QuotaExceededError gracefully", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    // Mock localStorage.setItem to throw QuotaExceededError
    const setItemSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new DOMException("quota exceeded", "QuotaExceededError");
      throw err;
    });

    act(() => { result.current.saveContent("# Big content"); });
    act(() => { jest.advanceTimersByTime(600); });

    expect(warnSpy).toHaveBeenCalledWith("localStorage quota exceeded. Content not saved.");

    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // --- Lines 57-60: non-QuotaExceeded error during saveContent ---
  it("handles non-QuotaExceeded error during saveContent", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const setItemSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("some other error");
    });

    act(() => { result.current.saveContent("# Content"); });
    act(() => { jest.advanceTimersByTime(600); });

    expect(warnSpy).toHaveBeenCalledWith("Failed to save to localStorage:", expect.any(Error));

    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // --- Lines 70-74: downloadMarkdown with Shift_JIS encoding ---
  it("downloads markdown with Shift_JIS encoding", async () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = jest.fn();

    await act(async () => {
      await result.current.downloadMarkdown("# Content", "Shift_JIS");
    });

    expect(URL.createObjectURL).toHaveBeenCalled();

    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });

  // --- Lines 70-74: downloadMarkdown with EUC-JP encoding ---
  it("downloads markdown with EUC-JP encoding", async () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = jest.fn();

    await act(async () => {
      await result.current.downloadMarkdown("# Content", "EUC-JP");
    });

    expect(URL.createObjectURL).toHaveBeenCalled();

    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });

  // --- Debounce cancellation on multiple saves ---
  it("debounces multiple saves and only writes once", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));

    act(() => { result.current.saveContent("# First"); });
    act(() => { result.current.saveContent("# Second"); });
    act(() => { result.current.saveContent("# Third"); });
    act(() => { jest.advanceTimersByTime(600); });

    expect(localStorage.getItem(STORAGE_KEY_CONTENT)).toBe("# Third");
  });

  // --- Timer cleanup on unmount ---
  it("cleans up timer on unmount", () => {
    const { result, unmount } = renderHook(() => useMarkdownEditor("# Default"));

    act(() => { result.current.saveContent("# Pending"); });
    unmount();
    act(() => { jest.advanceTimersByTime(600); });

    // The pending save should not have been written
    expect(localStorage.getItem(STORAGE_KEY_CONTENT)).toBeNull();
  });
});
