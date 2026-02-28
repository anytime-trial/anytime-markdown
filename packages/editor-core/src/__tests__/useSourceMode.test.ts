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
});
