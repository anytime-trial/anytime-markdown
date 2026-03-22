/**
 * useEditorFileHandling のユニットテスト
 *
 * エンコーディング変更、改行コード変換、frontmatter管理を検証する。
 */

import { renderHook, act } from "@testing-library/react";
import { useEditorFileHandling } from "../hooks/useEditorFileHandling";

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

describe("useEditorFileHandling", () => {
  describe("初期状態", () => {
    it("デフォルトのエンコーディングは UTF-8", () => {
      const { result } = renderHook(() => useEditorFileHandling(createArgs()));
      expect(result.current.encoding).toBe("UTF-8");
    });

    it("initialFrontmatter が設定される", () => {
      const { result } = renderHook(() =>
        useEditorFileHandling(createArgs({ initialFrontmatter: "title: Test" })),
      );
      expect(result.current.frontmatterText).toBe("title: Test");
    });
  });

  describe("handleLineEndingChange", () => {
    it("ソースモードで CRLF に変換する", () => {
      const handleSourceChange = jest.fn();
      const args = createArgs({
        sourceMode: true,
        sourceText: "line1\nline2\nline3",
        handleSourceChange,
      });
      const { result } = renderHook(() => useEditorFileHandling(args));

      act(() => {
        result.current.handleLineEndingChange("CRLF");
      });

      expect(handleSourceChange).toHaveBeenCalledWith("line1\r\nline2\r\nline3");
    });

    it("ソースモードで LF に変換する", () => {
      const handleSourceChange = jest.fn();
      const args = createArgs({
        sourceMode: true,
        sourceText: "line1\r\nline2\r\nline3",
        handleSourceChange,
      });
      const { result } = renderHook(() => useEditorFileHandling(args));

      act(() => {
        result.current.handleLineEndingChange("LF");
      });

      expect(handleSourceChange).toHaveBeenCalledWith("line1\nline2\nline3");
    });

    it("WYSIWYGモードでエディタのコンテンツを変換する", () => {
      const editor = {
        commands: { setContent: jest.fn() },
      };
      const setSourceText = jest.fn();
      const saveContent = jest.fn();
      const args = createArgs({
        sourceMode: false,
        editor,
        setSourceText,
        saveContent,
      });
      const { result } = renderHook(() => useEditorFileHandling(args));

      act(() => {
        result.current.handleLineEndingChange("CRLF");
      });

      expect(editor.commands.setContent).toHaveBeenCalled();
      expect(saveContent).toHaveBeenCalled();
    });
  });

  describe("handleEncodingChange", () => {
    it("エンコーディングを変更する", async () => {
      const { result } = renderHook(() => useEditorFileHandling(createArgs()));

      await act(async () => {
        await result.current.handleEncodingChange("Shift_JIS");
      });

      expect(result.current.encoding).toBe("Shift_JIS");
    });
  });

  describe("handleFrontmatterChange", () => {
    it("frontmatter を更新して saveContent を呼ぶ", () => {
      const saveContent = jest.fn();
      const frontmatterRef = { current: null as string | null };
      const args = createArgs({ saveContent, frontmatterRef });
      const { result } = renderHook(() => useEditorFileHandling(args));

      act(() => {
        result.current.handleFrontmatterChange("title: New");
      });

      expect(result.current.frontmatterText).toBe("title: New");
      expect(frontmatterRef.current).toBe("title: New");
      expect(saveContent).toHaveBeenCalled();
    });

    it("frontmatter を null にリセットできる", () => {
      const frontmatterRef = { current: "title: Old" as string | null };
      const args = createArgs({ frontmatterRef, initialFrontmatter: "title: Old" });
      const { result } = renderHook(() => useEditorFileHandling(args));

      act(() => {
        result.current.handleFrontmatterChange(null);
      });

      expect(result.current.frontmatterText).toBeNull();
      expect(frontmatterRef.current).toBeNull();
    });
  });
});
