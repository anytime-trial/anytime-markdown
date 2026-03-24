import { renderHook, act } from "@testing-library/react";
import { useMergeMode } from "../hooks/useMergeMode";
import { getMarkdownFromEditor } from "../types";
import type { Editor } from "@tiptap/react";

jest.mock("../types", () => ({
  ...jest.requireActual("../types"),
  getMarkdownFromEditor: jest.fn(() => "# mock md"),
}));

const mockedGetMarkdown = getMarkdownFromEditor as jest.MockedFunction<typeof getMarkdownFromEditor>;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function createMockEditor(overrides?: Record<string, unknown>): Editor {
  return {
    commands: {
      clearDiffHighlight: jest.fn(),
    },
    ...overrides,
  } as unknown as Editor;
}

function setup(overrides?: Partial<Parameters<typeof useMergeMode>[0]>) {
  const defaults = {
    editor: createMockEditor(),
    sourceMode: false,
    isMd: true,
    outlineOpen: false,
    handleToggleOutline: jest.fn(),
    onCompareModeChange: jest.fn(),
    t: (key: string) => key,
    setLiveMessage: jest.fn(),
  };
  const props = { ...defaults, ...overrides };
  return {
    ...renderHook(
      ({ p }) => useMergeMode(p),
      { initialProps: { p: props } },
    ),
    props,
  };
}

describe("useMergeMode", () => {
  beforeEach(() => {
    mockedGetMarkdown.mockReset();
    mockedGetMarkdown.mockReturnValue("# mock md");
  });

  // --- 初期状態 ---
  test("初期状態: inlineMergeOpen=false", () => {
    const { result } = setup();
    expect(result.current.inlineMergeOpen).toBe(false);
    expect(result.current.editorMarkdown).toBe("");
    expect(result.current.mergeUndoRedo).toBeNull();
    expect(result.current.compareFileContent).toBeNull();
  });

  // --- handleMerge ---
  test("handleMerge() → inlineMergeOpen=true, setLiveMessage 呼び出し", () => {
    const { result, props } = setup();
    act(() => result.current.handleMerge());
    expect(result.current.inlineMergeOpen).toBe(true);
    expect(props.setLiveMessage).toHaveBeenCalledWith("switchedToCompare");
  });

  test("handleMerge() x2 → toggle off", () => {
    const { result, props } = setup();
    act(() => result.current.handleMerge());
    act(() => result.current.handleMerge());
    expect(result.current.inlineMergeOpen).toBe(false);
    expect(props.setLiveMessage).toHaveBeenCalledWith("switchedToNormal");
  });

  test("isMd=false → handleMerge() は無視", () => {
    const { result } = setup({ isMd: false });
    act(() => result.current.handleMerge());
    expect(result.current.inlineMergeOpen).toBe(false);
  });

  test("!sourceMode && editor → getMarkdownFromEditor 呼び出し", () => {
    const editor = createMockEditor();
    setup({ editor, sourceMode: false });
    // handleMerge is not called yet, so getMarkdownFromEditor should not be called
    expect(mockedGetMarkdown).not.toHaveBeenCalled();
  });

  test("handleMerge() で !sourceMode && editor → editorMarkdown 設定", () => {
    const editor = createMockEditor();
    const { result } = setup({ editor, sourceMode: false });
    act(() => result.current.handleMerge());
    expect(mockedGetMarkdown).toHaveBeenCalledWith(editor);
    expect(result.current.editorMarkdown).toBe("# mock md");
  });

  test("handleMerge() で sourceMode=true → getMarkdownFromEditor 未呼び出し", () => {
    const { result } = setup({ sourceMode: true });
    act(() => result.current.handleMerge());
    expect(mockedGetMarkdown).not.toHaveBeenCalled();
    expect(result.current.inlineMergeOpen).toBe(true);
  });

  test("outlineOpen=true → handleMerge() で handleToggleOutline 呼び出し", () => {
    const { result, props } = setup({ outlineOpen: true });
    act(() => result.current.handleMerge());
    expect(props.handleToggleOutline).toHaveBeenCalled();
  });

  // --- Effects ---
  test("inlineMergeOpen=false → clearDiffHighlight 呼び出し", () => {
    const editor = createMockEditor();
    const { result } = setup({ editor });

    // Open then close
    act(() => result.current.handleMerge());
    act(() => result.current.handleMerge());

    // clearDiffHighlight は setTimeout(100ms) 内で呼ばれる
    act(() => { jest.advanceTimersByTime(100); });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((editor.commands as any).clearDiffHighlight).toHaveBeenCalled();
  });

  test("onCompareModeChange コールバック呼び出し", () => {
    const onCompareModeChange = jest.fn();
    const { result } = setup({ onCompareModeChange });

    // Initial render triggers with false
    expect(onCompareModeChange).toHaveBeenCalledWith(false);

    act(() => result.current.handleMerge());
    expect(onCompareModeChange).toHaveBeenCalledWith(true);
  });

  // --- isMd auto-close ---
  test("inlineMergeOpen かつ isMd→false → auto close", () => {
    const { result, rerender } = setup({ isMd: true });
    act(() => result.current.handleMerge());
    expect(result.current.inlineMergeOpen).toBe(true);

    // Change isMd to false
    const newProps = {
      editor: createMockEditor(),
      sourceMode: false,
      isMd: false,
      outlineOpen: false,
      handleToggleOutline: jest.fn(),
      onCompareModeChange: jest.fn(),
      t: (key: string) => key,
      setLiveMessage: jest.fn(),
    };
    rerender({ p: newProps });
    expect(result.current.inlineMergeOpen).toBe(false);
  });

  // --- vscode event ---
  test("vscode-load-compare-file event → compareFileContent 設定 + open", () => {
    const { result } = setup();
    expect(result.current.inlineMergeOpen).toBe(false);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("vscode-load-compare-file", { detail: "compare content" }),
      );
    });

    expect(result.current.compareFileContent).toBe("compare content");
    expect(result.current.inlineMergeOpen).toBe(true);
  });
});
