import { renderHook, act } from "@testing-library/react";
import { useSourceMode } from "../hooks/useSourceMode";
import { getMarkdownFromEditor } from "../types";
import type { Editor } from "@tiptap/react";

jest.mock("../types", () => ({
  ...jest.requireActual("../types"),
  getMarkdownFromEditor: jest.fn(),
}));

const mockedGetMarkdown = getMarkdownFromEditor as jest.MockedFunction<typeof getMarkdownFromEditor>;

function createMockEditor() {
  return {
    commands: {
      closeSearch: jest.fn(),
      setContent: jest.fn(),
      initComments: jest.fn(),
    },
  } as unknown as Editor;
}

function setup(editor: Editor | null = createMockEditor()) {
  const saveContent = jest.fn();
  const t = jest.fn((key: string) => key);
  return {
    hook: renderHook(() => useSourceMode({ editor, saveContent, t })),
    saveContent,
    t,
    editor,
  };
}

describe("useSourceMode", () => {
  beforeEach(() => {
    mockedGetMarkdown.mockReset();
  });

  test("初期状態 → sourceMode=false, sourceText=''", () => {
    const { hook } = setup();
    expect(hook.result.current.sourceMode).toBe(false);
    expect(hook.result.current.sourceText).toBe("");
  });

  test("handleSwitchToSource → sourceMode=true, sourceText にエディタ内容セット", () => {
    mockedGetMarkdown.mockReturnValue("# Hello");
    const { hook } = setup();
    act(() => hook.result.current.handleSwitchToSource());
    expect(hook.result.current.sourceMode).toBe(true);
    expect(hook.result.current.sourceText).toBe("# Hello");
  });

  test("handleSwitchToWysiwyg → sourceMode=false, editor.commands.setContent 呼出", () => {
    mockedGetMarkdown.mockReturnValue("# Hello");
    const { hook, saveContent, editor } = setup();

    act(() => hook.result.current.handleSwitchToSource());
    act(() => hook.result.current.handleSwitchToWysiwyg());

    expect(hook.result.current.sourceMode).toBe(false);
    expect((editor as unknown as { commands: { setContent: jest.Mock } }).commands.setContent).toHaveBeenCalled();
    expect(saveContent).toHaveBeenCalled();
  });

  test("handleSourceChange → sourceText 更新、saveContent 呼出", () => {
    const { hook, saveContent } = setup();
    act(() => hook.result.current.handleSourceChange("new content"));
    expect(hook.result.current.sourceText).toBe("new content");
    expect(saveContent).toHaveBeenCalledWith("new content");
  });

  test("appendToSource 空テキスト → separator なしで追加", () => {
    const { hook, saveContent } = setup();
    act(() => hook.result.current.appendToSource("# Title"));
    expect(hook.result.current.sourceText).toBe("# Title");
    expect(saveContent).toHaveBeenCalledWith("# Title");
  });

  test("appendToSource 末尾改行なし → separator 付きで追加", () => {
    const { hook, saveContent } = setup();
    act(() => hook.result.current.handleSourceChange("line1"));
    act(() => hook.result.current.appendToSource("line2"));
    expect(hook.result.current.sourceText).toBe("line1\nline2");
    expect(saveContent).toHaveBeenLastCalledWith("line1\nline2");
  });

  test("appendToSource 末尾改行あり → separator なしで追加", () => {
    const { hook } = setup();
    act(() => hook.result.current.handleSourceChange("line1\n"));
    act(() => hook.result.current.appendToSource("line2"));
    expect(hook.result.current.sourceText).toBe("line1\nline2");
  });

  test("editor null 時の handleSwitchToSource → 何もしない", () => {
    const { hook } = setup(null);
    act(() => hook.result.current.handleSwitchToSource());
    expect(hook.result.current.sourceMode).toBe(false);
    expect(mockedGetMarkdown).not.toHaveBeenCalled();
  });

  describe("ソースモード切替時のコメント保持", () => {
    const SOURCE_WITH_COMMENTS = [
      "# Title",
      "",
      "Some <!-- comment-start:abc12345 -->highlighted<!-- comment-end:abc12345 --> text.",
      "",
      "<!-- comments",
      "abc12345: review this | 2026-01-01T00:00:00Z",
      "-->",
    ].join("\n");

    test("handleSwitchToWysiwyg → setContent にコメントデータブロックが含まれない", () => {
      const { hook, editor } = setup();
      const setContent = (editor as any).commands.setContent as jest.Mock;

      // ソースモードにしてコメント付きテキストを設定
      act(() => hook.result.current.handleSourceChange(SOURCE_WITH_COMMENTS));
      act(() => hook.result.current.handleSwitchToWysiwyg());

      // setContent に渡された引数を確認
      const contentArg = setContent.mock.calls[0][0] as string;
      expect(contentArg).not.toContain("<!-- comments");
      expect(contentArg).not.toContain("abc12345: review this");
    });

    test("handleSwitchToWysiwyg → initComments がコメント Map で呼ばれる", () => {
      const initComments = jest.fn();
      const mockEditor = {
        commands: {
          closeSearch: jest.fn(),
          setContent: jest.fn(),
          initComments,
        },
      } as unknown as Editor;
      const { hook } = setup(mockEditor);

      act(() => hook.result.current.handleSourceChange(SOURCE_WITH_COMMENTS));
      act(() => hook.result.current.handleSwitchToWysiwyg());

      expect(initComments).toHaveBeenCalledTimes(1);
      const commentsMap = initComments.mock.calls[0][0] as Map<string, any>;
      expect(commentsMap).toBeInstanceOf(Map);
      expect(commentsMap.size).toBe(1);
      expect(commentsMap.get("abc12345")).toEqual(
        expect.objectContaining({
          id: "abc12345",
          text: "review this",
          resolved: false,
        }),
      );
    });

    test("handleSwitchToWysiwyg → setContent にインラインコメントマーカーは保持される", () => {
      const { hook, editor } = setup();
      const setContent = (editor as any).commands.setContent as jest.Mock;

      act(() => hook.result.current.handleSourceChange(SOURCE_WITH_COMMENTS));
      act(() => hook.result.current.handleSwitchToWysiwyg());

      const contentArg = setContent.mock.calls[0][0] as string;
      // preprocessComments により <span data-comment-id> に変換されている
      expect(contentArg).toContain('data-comment-id="abc12345"');
    });

    test("handleSwitchToWysiwyg → saveContent にコメントデータブロックが含まれる（元テキスト保持）", () => {
      const { hook, saveContent } = setup();

      act(() => hook.result.current.handleSourceChange(SOURCE_WITH_COMMENTS));
      act(() => hook.result.current.handleSwitchToWysiwyg());

      // saveContent の最後の呼び出しに元のコメントデータが含まれる
      const lastCall = saveContent.mock.calls[saveContent.mock.calls.length - 1][0] as string;
      expect(lastCall).toContain("<!-- comments");
      expect(lastCall).toContain("abc12345: review this");
    });

    test("コメントなしのソーステキスト → initComments は呼ばれない", () => {
      const initComments = jest.fn();
      const mockEditor = {
        commands: {
          closeSearch: jest.fn(),
          setContent: jest.fn(),
          initComments,
        },
      } as unknown as Editor;
      const { hook } = setup(mockEditor);

      act(() => hook.result.current.handleSourceChange("# No comments here"));
      act(() => hook.result.current.handleSwitchToWysiwyg());

      expect(initComments).not.toHaveBeenCalled();
    });
  });
});
