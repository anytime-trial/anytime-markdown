/**
 * useEditorFileHandling.ts - カバレッジテスト (lines 71-88)
 * handleEncodingChange with nativeHandle: re-read file with new encoding
 */
import { renderHook, act } from "@testing-library/react";
import { useEditorFileHandling } from "../hooks/useEditorFileHandling";

// TextDecoder polyfill for jsdom
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = class TextDecoder {
    encoding: string;
    constructor(label?: string) { this.encoding = label ?? "utf-8"; }
    decode(input?: ArrayBuffer) {
      if (!input) return "";
      const bytes = new Uint8Array(input);
      return Array.from(bytes).map(b => String.fromCharCode(b)).join("");
    }
  } as any;
}

jest.mock("../types", () => ({
  getMarkdownFromEditor: jest.fn().mockReturnValue("# Hello\nWorld"),
  getMarkdownStorage: jest.fn().mockReturnValue({
    parser: { parse: (text: string) => text },
  }),
}));

jest.mock("../utils/sanitizeMarkdown", () => ({
  sanitizeMarkdown: (text: string) => text,
  preserveBlankLines: (text: string) => text,
}));

function createArgs(overrides: Record<string, unknown> = {}) {
  return {
    editor: {
      commands: {
        setContent: jest.fn(),
      },
    } as unknown,
    sourceMode: false,
    sourceText: "# Hello\nWorld",
    handleSourceChange: jest.fn(),
    setSourceText: jest.fn(),
    saveContent: jest.fn(),
    fileHandle: null,
    frontmatterRef: { current: null },
    initialFrontmatter: null,
    ...overrides,
  } as Parameters<typeof useEditorFileHandling>[0];
}

describe("useEditorFileHandling coverage", () => {
  describe("handleEncodingChange with nativeHandle (lines 71-88)", () => {
    it("re-reads file with new encoding in WYSIWYG mode", async () => {
      const mockArrayBuffer = new Uint8Array([0x23, 0x20, 0x52, 0x65]).buffer;
      const mockFile = {
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      };
      const nativeHandle = {
        getFile: jest.fn().mockResolvedValue(mockFile),
      };
      const setContent = jest.fn();
      const saveContent = jest.fn();
      const setSourceText = jest.fn();

      const args = createArgs({
        fileHandle: { nativeHandle },
        editor: { commands: { setContent } },
        sourceMode: false,
        setSourceText,
        saveContent,
      });

      const { result } = renderHook(() => useEditorFileHandling(args));

      await act(async () => {
        await result.current.handleEncodingChange("UTF-8");
      });

      expect(result.current.encoding).toBe("UTF-8");
      expect(nativeHandle.getFile).toHaveBeenCalled();
      expect(setContent).toHaveBeenCalled();
      expect(saveContent).toHaveBeenCalled();
    });

    it("re-reads file with new encoding in source mode", async () => {
      const mockArrayBuffer = new Uint8Array([0x23, 0x20, 0x53, 0x72]).buffer;
      const mockFile = {
        arrayBuffer: jest.fn().mockResolvedValue(mockArrayBuffer),
      };
      const nativeHandle = {
        getFile: jest.fn().mockResolvedValue(mockFile),
      };
      const setSourceText = jest.fn();
      const saveContent = jest.fn();

      const args = createArgs({
        fileHandle: { nativeHandle },
        sourceMode: true,
        setSourceText,
        saveContent,
      });

      const { result } = renderHook(() => useEditorFileHandling(args));

      await act(async () => {
        await result.current.handleEncodingChange("Shift_JIS");
      });

      expect(result.current.encoding).toBe("Shift_JIS");
      expect(setSourceText).toHaveBeenCalled();
      expect(saveContent).toHaveBeenCalled();
    });

    it("handles error when re-reading file fails", async () => {
      const nativeHandle = {
        getFile: jest.fn().mockRejectedValue(new Error("File access error")),
      };
      const saveContent = jest.fn();
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});

      const args = createArgs({
        fileHandle: { nativeHandle },
        saveContent,
      });

      const { result } = renderHook(() => useEditorFileHandling(args));

      await act(async () => {
        await result.current.handleEncodingChange("EUC-JP");
      });

      expect(result.current.encoding).toBe("EUC-JP");
      expect(consoleWarn).toHaveBeenCalledWith(
        "Failed to re-read file with encoding:",
        "EUC-JP",
        expect.any(Error),
      );

      consoleWarn.mockRestore();
    });

    it("does not re-read when no nativeHandle", async () => {
      const saveContent = jest.fn();
      const args = createArgs({
        fileHandle: { nativeHandle: undefined },
        saveContent,
      });

      const { result } = renderHook(() => useEditorFileHandling(args));

      await act(async () => {
        await result.current.handleEncodingChange("EUC-JP");
      });

      expect(result.current.encoding).toBe("EUC-JP");
      expect(saveContent).not.toHaveBeenCalled();
    });
  });

  describe("handleFrontmatterChange without editor", () => {
    it("updates frontmatter even without editor", () => {
      const frontmatterRef = { current: null as string | null };
      const args = createArgs({
        editor: null,
        frontmatterRef,
      });

      const { result } = renderHook(() => useEditorFileHandling(args));

      act(() => {
        result.current.handleFrontmatterChange("title: New");
      });

      expect(result.current.frontmatterText).toBe("title: New");
      expect(frontmatterRef.current).toBe("title: New");
    });
  });
});
