/**
 * useEditorBlockActions coverage tests
 * Targets uncovered branches:
 * - editor null guard (lines 14, 22, 31, 34, 35, 36, 45, 46, 57)
 * - diagram code with different languages
 * - expandAllBlocks with no collapsed blocks
 * - table and image node types
 */
import { renderHook, act } from "@testing-library/react";
import { useEditorBlockActions } from "../hooks/useEditorBlockActions";

function createMockEditor(nodes: { type: string; attrs: Record<string, unknown>; pos?: number }[]) {
  const tr = { setNodeMarkup: jest.fn() };
  const editor = {
    state: {
      doc: {
        descendants: (callback: (node: unknown, pos: number) => boolean | void) => {
          let pos = 0;
          for (const node of nodes) {
            const result = callback(
              { type: { name: node.type }, attrs: { ...node.attrs } },
              node.pos ?? pos,
            );
            if (result === false) return;
            pos += 10;
          }
        },
      },
      tr,
    },
    view: { dispatch: jest.fn() },
  };
  return { editor, tr };
}

describe("useEditorBlockActions coverage", () => {
  it("handleToggleAllBlocks does nothing when editor is null", () => {
    const { result } = renderHook(() => useEditorBlockActions({ editor: null }));
    act(() => {
      result.current.handleToggleAllBlocks();
    });
    // No crash
  });

  it("handleToggleDiagramCode does nothing when editor is null", () => {
    const { result } = renderHook(() => useEditorBlockActions({ editor: null }));
    act(() => {
      result.current.handleToggleDiagramCode();
    });
  });

  it("handleExpandAllBlocks does nothing when editor is null", () => {
    const { result } = renderHook(() => useEditorBlockActions({ editor: null }));
    act(() => {
      result.current.handleExpandAllBlocks();
    });
  });

  it("handleToggleAllBlocks collapses all when some are expanded", () => {
    const { editor, tr } = createMockEditor([
      { type: "codeBlock", attrs: { collapsed: false } },
      { type: "table", attrs: { collapsed: true } },
      { type: "image", attrs: { collapsed: false } },
      { type: "paragraph", attrs: {} },
    ]);
    const { result } = renderHook(() => useEditorBlockActions({ editor: editor as any }));
    act(() => {
      result.current.handleToggleAllBlocks();
    });
    expect(editor.view.dispatch).toHaveBeenCalled();
    // Should set collapsed=true for code/table/image
    expect(tr.setNodeMarkup).toHaveBeenCalledTimes(3);
  });

  it("handleToggleAllBlocks expands all when all are collapsed", () => {
    const { editor, tr } = createMockEditor([
      { type: "codeBlock", attrs: { collapsed: true } },
      { type: "table", attrs: { collapsed: true } },
    ]);
    const { result } = renderHook(() => useEditorBlockActions({ editor: editor as any }));
    act(() => {
      result.current.handleToggleAllBlocks();
    });
    expect(tr.setNodeMarkup).toHaveBeenCalledTimes(2);
  });

  it("handleToggleDiagramCode collapses mermaid/plantuml code", () => {
    const { editor, tr } = createMockEditor([
      { type: "codeBlock", attrs: { language: "mermaid", codeCollapsed: false } },
      { type: "codeBlock", attrs: { language: "PlantUML", codeCollapsed: false } },
      { type: "codeBlock", attrs: { language: "javascript", codeCollapsed: false } },
    ]);
    const { result } = renderHook(() => useEditorBlockActions({ editor: editor as any }));
    act(() => {
      result.current.handleToggleDiagramCode();
    });
    // Should only set codeCollapsed for mermaid/plantuml (2 calls)
    expect(tr.setNodeMarkup).toHaveBeenCalledTimes(2);
  });

  it("handleToggleDiagramCode expands when all are collapsed", () => {
    const { editor, tr } = createMockEditor([
      { type: "codeBlock", attrs: { language: "mermaid", codeCollapsed: true } },
      { type: "codeBlock", attrs: { language: "plantuml", codeCollapsed: true } },
    ]);
    const { result } = renderHook(() => useEditorBlockActions({ editor: editor as any }));
    act(() => {
      result.current.handleToggleDiagramCode();
    });
    expect(tr.setNodeMarkup).toHaveBeenCalledTimes(2);
  });

  it("handleToggleDiagramCode handles empty language attr", () => {
    const { editor, tr } = createMockEditor([
      { type: "codeBlock", attrs: { language: "", codeCollapsed: false } },
    ]);
    const { result } = renderHook(() => useEditorBlockActions({ editor: editor as any }));
    act(() => {
      result.current.handleToggleDiagramCode();
    });
    // Empty language is not mermaid/plantuml, so no setNodeMarkup
    expect(tr.setNodeMarkup).not.toHaveBeenCalled();
  });

  it("handleExpandAllBlocks expands collapsed blocks", () => {
    const { editor, tr } = createMockEditor([
      { type: "codeBlock", attrs: { collapsed: true } },
      { type: "image", attrs: { collapsed: true } },
    ]);
    const { result } = renderHook(() => useEditorBlockActions({ editor: editor as any }));
    act(() => {
      result.current.handleExpandAllBlocks();
    });
    expect(tr.setNodeMarkup).toHaveBeenCalledTimes(2);
    expect(editor.view.dispatch).toHaveBeenCalled();
  });

  it("handleExpandAllBlocks does not dispatch when no blocks are collapsed", () => {
    const { editor, tr } = createMockEditor([
      { type: "codeBlock", attrs: { collapsed: false } },
      { type: "paragraph", attrs: {} },
    ]);
    const { result } = renderHook(() => useEditorBlockActions({ editor: editor as any }));
    act(() => {
      result.current.handleExpandAllBlocks();
    });
    expect(editor.view.dispatch).not.toHaveBeenCalled();
  });
});
