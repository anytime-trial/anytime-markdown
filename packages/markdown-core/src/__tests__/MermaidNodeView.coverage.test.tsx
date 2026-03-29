/**
 * MermaidNodeView.tsx (CodeBlockNodeView) の追加カバレッジテスト
 * - 各言語分岐 (mermaid, plantuml, math, html, regular)
 * - selectNode の各分岐 (editor null, getPos non-function, diagram/math/html)
 * - auto-collapse on deselect
 * - handleCopyCode
 * - handleFsCodeChange (newCode empty, non-empty)
 * - handleFsTextChange (newCode empty, non-empty)
 * - compareLeft / compareLeftEditable 分岐
 */
import React from "react";
import { render, act } from "@testing-library/react";

// --- Mocks ---
let mockIsEditable = true;
let mockIsSelected = false;

jest.mock("@tiptap/react", () => ({
  useEditorState: jest.fn(() => mockIsEditable),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

jest.mock("@mui/material", () => ({
  useTheme: () => ({
    palette: {
      mode: "light",
      primary: { main: "#1976d2" },
      divider: "#e0e0e0",
      text: { secondary: "#666", disabled: "#999", primary: "#000" },
      action: { hover: "#f5f5f5", selected: "#eee" },
      background: { paper: "#fff" },
    },
  }),
}));

jest.mock("../hooks/useNodeSelected", () => ({
  useNodeSelected: () => mockIsSelected,
}));

jest.mock("../hooks/useDeleteBlock", () => ({
  useDeleteBlock: () => jest.fn(),
}));

jest.mock("../hooks/useBlockCapture", () => ({
  useBlockCapture: () => jest.fn(),
}));

jest.mock("../hooks/useTextareaSearch", () => ({
  useTextareaSearch: () => ({
    searchState: null,
    setSearchState: jest.fn(),
  }),
}));

jest.mock("../contexts/MergeEditorsContext", () => ({
  getMergeEditors: () => null,
}));

// Mock the block sub-components
const mockDiagramBlock = jest.fn((_props: any) => <div data-testid="diagram-block" />);
const mockMathBlock = jest.fn((_props: any) => <div data-testid="math-block" />);
const mockHtmlPreviewBlock = jest.fn((_props: any) => <div data-testid="html-preview-block" />);
const mockRegularCodeBlock = jest.fn((_props: any) => <div data-testid="regular-code-block" />);

jest.mock("../components/codeblock/DiagramBlock", () => ({
  DiagramBlock: (props: any) => mockDiagramBlock(props),
}));

jest.mock("../components/codeblock/MathBlock", () => ({
  MathBlock: (props: any) => mockMathBlock(props),
}));

jest.mock("../components/codeblock/HtmlPreviewBlock", () => ({
  HtmlPreviewBlock: (props: any) => mockHtmlPreviewBlock(props),
}));

jest.mock("../components/codeblock/RegularCodeBlock", () => ({
  RegularCodeBlock: (props: any) => mockRegularCodeBlock(props),
}));

import { CodeBlockNodeView } from "../MermaidNodeView";

function createMockEditor() {
  const run = jest.fn();
  const text = jest.fn((t: string) => ({ type: "text", text: t }));
  const tr = {
    replaceWith: jest.fn(),
    delete: jest.fn(),
  };
  const command = jest.fn((fn: any) => {
    fn({ tr });
    return { run };
  });
  const chain = jest.fn(() => ({ command }));
  return {
    chain,
    commands: {
      setTextSelection: jest.fn(),
    },
    schema: { text },
    isEditable: true,
  };
}

function createMockNode(language: string, attrs?: Record<string, any>) {
  return {
    attrs: {
      language,
      codeCollapsed: false,
      ...attrs,
    },
    nodeSize: 10,
    textContent: "test code",
    content: { size: 9 },
  };
}

function renderCodeBlock(language: string, options?: {
  isEditable?: boolean;
  isSelected?: boolean;
  codeCollapsed?: boolean;
  editorOverride?: any;
}) {
  mockIsEditable = options?.isEditable ?? true;
  mockIsSelected = options?.isSelected ?? false;
  const editor = options?.editorOverride ?? createMockEditor();
  const node = createMockNode(language, { codeCollapsed: options?.codeCollapsed });
  const updateAttributes = jest.fn();
  const getPos = jest.fn(() => 0);

  const result = render(
    <CodeBlockNodeView
      editor={editor as any}
      node={node as any}
      updateAttributes={updateAttributes}
      getPos={getPos}
      deleteNode={jest.fn()}
      decorations={[] as any}
      innerDecorations={[] as any}
      extension={{} as any}
      selected={false}
      HTMLAttributes={{}}
      view={{} as any}
    />,
  );

  return { ...result, editor, node, updateAttributes, getPos };
}

describe("CodeBlockNodeView - coverage", () => {
  beforeEach(() => {
    mockIsEditable = true;
    mockIsSelected = false;
    jest.clearAllMocks();
    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  // --- language routing ---
  test("language=mermaid で DiagramBlock がレンダリングされる", () => {
    renderCodeBlock("mermaid");
    expect(mockDiagramBlock).toHaveBeenCalled();
  });

  test("language=plantuml で DiagramBlock がレンダリングされる", () => {
    renderCodeBlock("plantuml");
    expect(mockDiagramBlock).toHaveBeenCalled();
  });

  test("language=math で MathBlock がレンダリングされる", () => {
    renderCodeBlock("math");
    expect(mockMathBlock).toHaveBeenCalled();
  });

  test("language=html で HtmlPreviewBlock がレンダリングされる", () => {
    renderCodeBlock("html");
    expect(mockHtmlPreviewBlock).toHaveBeenCalled();
  });

  test("language=javascript で RegularCodeBlock がレンダリングされる", () => {
    renderCodeBlock("javascript");
    expect(mockRegularCodeBlock).toHaveBeenCalled();
  });

  test("language=null/empty で RegularCodeBlock がレンダリングされる", () => {
    renderCodeBlock("");
    expect(mockRegularCodeBlock).toHaveBeenCalled();
  });

  // --- shared props verification ---
  test("shared props に code, isDark, isEditable が含まれる", () => {
    renderCodeBlock("javascript");
    const props = mockRegularCodeBlock.mock.calls[0][0];
    expect(props.code).toBe("test code");
    expect(props.isDark).toBe(false);
    expect(props.isEditable).toBe(true);
  });

  // --- isEditable=false ---
  test("isEditable=false で codeCollapsed が true になる", () => {
    renderCodeBlock("javascript", { isEditable: false });
    const props = mockRegularCodeBlock.mock.calls[0][0];
    expect(props.codeCollapsed).toBe(true);
  });

  // --- selectNode callback ---
  test("selectNode が呼ばれると setTextSelection が実行される", () => {
    const { editor } = renderCodeBlock("javascript");
    const props = mockRegularCodeBlock.mock.calls[0][0];
    act(() => {
      props.selectNode();
    });
    expect(editor.commands.setTextSelection).toHaveBeenCalledWith(1);
  });

  test("selectNode: diagram の場合 updateAttributes は呼ばれない", () => {
    const { updateAttributes } = renderCodeBlock("mermaid", { codeCollapsed: true });
    const props = mockDiagramBlock.mock.calls[0][0];
    act(() => {
      props.selectNode();
    });
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  test("selectNode: math の場合 updateAttributes は呼ばれない", () => {
    const { updateAttributes } = renderCodeBlock("math", { codeCollapsed: true });
    const props = mockMathBlock.mock.calls[0][0];
    act(() => {
      props.selectNode();
    });
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  test("selectNode: html の場合 updateAttributes は呼ばれない", () => {
    const { updateAttributes } = renderCodeBlock("html", { codeCollapsed: true });
    const props = mockHtmlPreviewBlock.mock.calls[0][0];
    act(() => {
      props.selectNode();
    });
    expect(updateAttributes).not.toHaveBeenCalled();
  });

  test("selectNode: regular + codeCollapsed=true → updateAttributes が呼ばれる", () => {
    const { updateAttributes } = renderCodeBlock("javascript", { codeCollapsed: true });
    const props = mockRegularCodeBlock.mock.calls[0][0];
    act(() => {
      props.selectNode();
    });
    expect(updateAttributes).toHaveBeenCalledWith({ codeCollapsed: false });
  });

  test("selectNode: editor が null の場合何もしない", () => {
    renderCodeBlock("javascript", { editorOverride: null });
    const props = mockRegularCodeBlock.mock.calls[0][0];
    // Should not throw
    act(() => {
      props.selectNode();
    });
  });

  // --- handleCopyCode ---
  test("handleCopyCode で clipboard に code がコピーされる", () => {
    renderCodeBlock("javascript");
    const props = mockRegularCodeBlock.mock.calls[0][0];
    act(() => {
      props.handleCopyCode();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test code");
  });

  // --- handleFsCodeChange (via onFsCodeChange) ---
  test("onFsCodeChange で非空コードがローカルステートに反映される", () => {
    renderCodeBlock("javascript");
    const props = mockRegularCodeBlock.mock.calls[0][0];
    const event = { target: { value: "new code" } } as React.ChangeEvent<HTMLTextAreaElement>;
    act(() => {
      props.onFsCodeChange(event);
    });
    const updatedProps = mockRegularCodeBlock.mock.calls.at(-1)?.[0];
    expect(updatedProps.fsCode).toBe("new code");
    expect(updatedProps.fsDirty).toBe(true);
  });

  test("onFsCodeChange で空コードがローカルステートに反映される", () => {
    renderCodeBlock("javascript");
    const props = mockRegularCodeBlock.mock.calls[0][0];
    const event = { target: { value: "" } } as React.ChangeEvent<HTMLTextAreaElement>;
    act(() => {
      props.onFsCodeChange(event);
    });
    const updatedProps = mockRegularCodeBlock.mock.calls.at(-1)?.[0];
    expect(updatedProps.fsCode).toBe("");
  });

  test("onFsCodeChange: editor が null の場合何もしない", () => {
    renderCodeBlock("javascript", { editorOverride: null });
    const props = mockRegularCodeBlock.mock.calls[0][0];
    const event = { target: { value: "code" } } as React.ChangeEvent<HTMLTextAreaElement>;
    // Should not throw
    act(() => {
      props.onFsCodeChange(event);
    });
  });

  // --- handleFsTextChange ---
  test("handleFsTextChange で非空コードがローカルステートに反映される", () => {
    renderCodeBlock("javascript");
    const props = mockRegularCodeBlock.mock.calls[0][0];
    act(() => {
      props.handleFsTextChange("updated text");
    });
    const updatedProps = mockRegularCodeBlock.mock.calls.at(-1)?.[0];
    expect(updatedProps.fsCode).toBe("updated text");
    expect(updatedProps.fsDirty).toBe(true);
  });

  test("handleFsTextChange で空コードがローカルステートに反映される", () => {
    renderCodeBlock("javascript");
    const props = mockRegularCodeBlock.mock.calls[0][0];
    act(() => {
      props.handleFsTextChange("");
    });
    const updatedProps = mockRegularCodeBlock.mock.calls.at(-1)?.[0];
    expect(updatedProps.fsCode).toBe("");
  });

  // --- isCompareLeft ---
  test("isCompareLeft が false の場合", () => {
    renderCodeBlock("javascript");
    const props = mockRegularCodeBlock.mock.calls[0][0];
    expect(props.isCompareLeft).toBe(false);
    expect(props.isCompareLeftEditable).toBe(false);
  });

  // --- auto-collapse on deselect ---
  test("isSelected が false かつ codeCollapsed=false で updateAttributes が呼ばれる", () => {
    const { updateAttributes } = renderCodeBlock("javascript", { isSelected: false, codeCollapsed: false });
    // The useEffect should have called updateAttributes
    expect(updateAttributes).toHaveBeenCalledWith({ codeCollapsed: true });
  });

  test("isSelected=true の場合 auto-collapse は発火しない", () => {
    const { updateAttributes } = renderCodeBlock("javascript", { isSelected: true, codeCollapsed: false });
    // updateAttributes should NOT have been called for auto-collapse
    expect(updateAttributes).not.toHaveBeenCalled();
  });
});
