/**
 * useMarkdownEditor.ts のカバレッジテスト
 * 未カバレッジ: skipLocalStorage, frontmatter処理, downloadMarkdown, QuotaExceeded, localStorage例外
 */
import { renderHook, act } from "@testing-library/react";
import { useMarkdownEditor } from "../useMarkdownEditor";
import { STORAGE_KEY_CONTENT } from "../constants/storageKeys";

describe("useMarkdownEditor coverage", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("skipLocalStorage=true ではlocalStorageを参照しない", () => {
    localStorage.setItem(STORAGE_KEY_CONTENT, "# Saved");
    const { result } = renderHook(() => useMarkdownEditor("# Default", true));
    expect(result.current.initialContent).toBe("# Default");
  });

  it("skipLocalStorage=true ではsaveContentが何もしない", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default", true));
    act(() => { result.current.saveContent("# Updated"); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(localStorage.getItem(STORAGE_KEY_CONTENT)).toBeNull();
  });

  it("frontmatter付きコンテンツを処理する", () => {
    localStorage.setItem(STORAGE_KEY_CONTENT, "---\ntitle: Test\n---\n# Body");
    const { result } = renderHook(() => useMarkdownEditor(""));
    // Body should not contain the frontmatter fence
    expect(result.current.initialContent).not.toContain("---");
    expect(result.current.frontmatterRef.current).toContain("title: Test");
  });

  it("末尾改行を検出する", () => {
    localStorage.setItem(STORAGE_KEY_CONTENT, "# Content\n");
    const { result } = renderHook(() => useMarkdownEditor(""));
    expect(result.current.initialTrailingNewline).toBe(true);
  });

  it("末尾改行なしを検出する", () => {
    localStorage.setItem(STORAGE_KEY_CONTENT, "# Content");
    const { result } = renderHook(() => useMarkdownEditor(""));
    expect(result.current.initialTrailingNewline).toBe(false);
  });

  it("saveContent withFrontmatter=false ではfrontmatter付加しない", () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    act(() => { result.current.saveContent("# Raw", false); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(localStorage.getItem(STORAGE_KEY_CONTENT)).toBe("# Raw");
  });

  it("saveContent with frontmatter prepends it", () => {
    localStorage.setItem(STORAGE_KEY_CONTENT, "---\ntitle: X\n---\n# Body");
    const { result } = renderHook(() => useMarkdownEditor(""));
    act(() => { result.current.saveContent("# Updated", true); });
    act(() => { jest.advanceTimersByTime(600); });
    const saved = localStorage.getItem(STORAGE_KEY_CONTENT);
    expect(saved).toContain("title: X");
    expect(saved).toContain("# Updated");
  });

  it("downloadMarkdown creates a blob link", async () => {
    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = jest.fn();

    await act(async () => {
      await result.current.downloadMarkdown("# Content");
    });

    expect(URL.createObjectURL).toHaveBeenCalled();
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });

  it("localStorage例外時にfallbackする", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const origGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("test"); };
    const { result } = renderHook(() => useMarkdownEditor("# Fallback"));
    expect(result.current.initialContent).toBe("# Fallback");
    Storage.prototype.getItem = origGetItem;
    warnSpy.mockRestore();
  });

  it("QuotaExceededErrorをハンドルする", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    };
    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    act(() => { result.current.saveContent("# Big"); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(warnSpy).toHaveBeenCalledWith("localStorage quota exceeded. Content not saved.");
    Storage.prototype.setItem = origSetItem;
    warnSpy.mockRestore();
  });

  it("saveContent一般エラーをハンドルする", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("generic error"); };
    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    act(() => { result.current.saveContent("# Err"); });
    act(() => { jest.advanceTimersByTime(600); });
    expect(warnSpy).toHaveBeenCalledWith("Failed to save to localStorage:", expect.any(Error));
    Storage.prototype.setItem = origSetItem;
    warnSpy.mockRestore();
  });

  it("downloadMarkdown with Shift_JIS encoding", async () => {
    jest.mock("encoding-japanese", () => ({
      __esModule: true,
      default: {
        stringToCode: (s: string) => Array.from(s).map(c => c.charCodeAt(0)),
        convert: (arr: number[]) => arr,
      },
    }), { virtual: true });

    const { result } = renderHook(() => useMarkdownEditor("# Default"));
    const origCreateObjectURL = URL.createObjectURL;
    const origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = jest.fn();

    await act(async () => {
      await result.current.downloadMarkdown("# Content", "Shift_JIS" as any);
    });

    expect(URL.createObjectURL).toHaveBeenCalled();
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });
});
