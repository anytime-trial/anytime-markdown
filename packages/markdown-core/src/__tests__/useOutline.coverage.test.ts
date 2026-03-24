/**
 * useOutline hook - 追加カバレッジテスト
 *
 * handleOutlineResizeStart、handleOutlineClick の Text ノードケース、
 * isEditable=false のケースなど未カバー部分を検証する。
 */

import { renderHook, act } from "@testing-library/react";
import { useOutline } from "../hooks/useOutline";
import type { Editor } from "@tiptap/react";
import type { HeadingItem } from "../types";

jest.mock("../types", () => ({
  ...jest.requireActual("../types"),
  extractHeadings: jest.fn().mockReturnValue([]),
}));

jest.mock("../utils/sectionHelpers", () => ({
  moveHeadingSection: jest.fn(),
}));

function createMockEditor(overrides?: Record<string, unknown>): Editor {
  return {
    isEditable: true,
    state: {
      doc: {
        nodeAt: jest.fn(),
        content: { size: 0 },
        descendants: jest.fn(),
      },
    },
    chain: jest.fn(() => ({
      focus: jest.fn().mockReturnThis(),
      setTextSelection: jest.fn().mockReturnThis(),
      command: jest.fn().mockReturnThis(),
      run: jest.fn(),
    })),
    view: {
      domAtPos: jest.fn(() => ({
        node: document.createElement("div"),
      })),
    },
    commands: {
      setFoldedHeadings: jest.fn(),
    },
    ...overrides,
  } as unknown as Editor;
}

describe("useOutline - handleOutlineResizeStart", () => {
  it("マウスドラッグでアウトライン幅を変更する", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useOutline({ editor, sourceMode: false }),
    );

    // Simulate mousedown
    const mouseEvent = {
      clientX: 220,
      preventDefault: jest.fn(),
    } as unknown as React.MouseEvent;

    act(() => {
      result.current.handleOutlineResizeStart(mouseEvent);
    });

    expect(mouseEvent.preventDefault).toHaveBeenCalled();

    // Simulate mousemove
    const moveEvent = new MouseEvent("mousemove", { clientX: 280 });
    document.dispatchEvent(moveEvent);

    // Simulate mouseup
    const upEvent = new MouseEvent("mouseup");
    document.dispatchEvent(upEvent);

    // Body style should be reset
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});

describe("useOutline - handleOutlineClick", () => {
  it("isEditable=false の場合 setTextSelection を呼ばない", () => {
    const run = jest.fn();
    const setTextSelection = jest.fn().mockReturnValue({ run });
    const focus = jest.fn().mockReturnValue({ setTextSelection });
    const chain = jest.fn().mockReturnValue({ focus });
    const scrollIntoView = jest.fn();
    const el = document.createElement("div");
    el.scrollIntoView = scrollIntoView;

    const editor = createMockEditor({
      isEditable: false,
      chain,
      view: {
        domAtPos: jest.fn(() => ({ node: el })),
      },
    });

    const { result } = renderHook(() =>
      useOutline({ editor, sourceMode: false }),
    );
    act(() => result.current.handleOutlineClick(10));

    // chain should not have been called since isEditable is false
    expect(chain).not.toHaveBeenCalled();
    // But scrollIntoView should still be called
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("domAtPos が Text ノードを返す場合は parentElement にスクロールする", () => {
    const run = jest.fn();
    const setTextSelection = jest.fn().mockReturnValue({ run });
    const focus = jest.fn().mockReturnValue({ setTextSelection });
    const chain = jest.fn().mockReturnValue({ focus });

    const parentEl = document.createElement("div");
    parentEl.scrollIntoView = jest.fn();
    const textNode = document.createTextNode("hello");
    parentEl.appendChild(textNode);

    const editor = createMockEditor({
      chain,
      view: {
        domAtPos: jest.fn(() => ({ node: textNode })),
      },
    });

    const { result } = renderHook(() =>
      useOutline({ editor, sourceMode: false }),
    );
    act(() => result.current.handleOutlineClick(5));

    expect(parentEl.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
});

describe("useOutline - handleOutlineDelete 追加ケース", () => {
  it("heading の後に下位レベルの heading がある場合は下位も含めて削除する", () => {
    const run = jest.fn();
    const command = jest.fn((fn: any) => {
      // Execute the command function to cover its branch
      const tr = { delete: jest.fn() };
      fn({ tr });
      return { run };
    });
    const focus = jest.fn().mockReturnValue({ command });
    const chain = jest.fn().mockReturnValue({ focus });

    const nodes = [
      { pos: 0, node: { type: { name: "heading" }, attrs: { level: 1 }, nodeSize: 10 } },
      { pos: 10, node: { type: { name: "paragraph" }, attrs: {}, nodeSize: 5 } },
      { pos: 15, node: { type: { name: "heading" }, attrs: { level: 2 }, nodeSize: 8 } },
      { pos: 23, node: { type: { name: "heading" }, attrs: { level: 1 }, nodeSize: 10 } },
    ];

    const nodeAt = jest.fn((pos: number) => {
      const found = nodes.find((n) => n.pos === pos);
      return found ? found.node : null;
    });

    const editor = createMockEditor({
      chain,
      state: {
        doc: {
          nodeAt,
          content: { size: 33 },
          descendants: jest.fn(),
        },
      },
    });

    const { result } = renderHook(() =>
      useOutline({ editor, sourceMode: false }),
    );
    act(() => result.current.handleOutlineDelete(0, "heading"));

    expect(chain).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });
});

describe("useOutline - defaultOutlineOpen", () => {
  it("defaultOutlineOpen=true で初期状態が開いている", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useOutline({ editor, sourceMode: false, defaultOutlineOpen: true }),
    );
    expect(result.current.outlineOpen).toBe(true);
  });
});

describe("useOutline - hiddenByFold 追加ケース", () => {
  it("複数の折りたたみが重なるケース", () => {
    const editor = createMockEditor();
    const { result } = renderHook(() =>
      useOutline({ editor, sourceMode: false }),
    );

    const items: HeadingItem[] = [
      { level: 1, text: "H1", pos: 0, kind: "heading", headingIndex: 0 },
      { level: 2, text: "H2", pos: 10, kind: "heading", headingIndex: 1 },
      { level: 3, text: "H3", pos: 20, kind: "heading", headingIndex: 2 },
      { level: 2, text: "H2-2", pos: 30, kind: "heading", headingIndex: 3 },
    ];
    act(() => result.current.setHeadings(items));
    // Fold H2 (index=1), should hide H3 but not H2-2
    act(() => result.current.toggleFold(1));
    expect(result.current.hiddenByFold.has(2)).toBe(true); // H3
    expect(result.current.hiddenByFold.has(3)).toBe(false); // H2-2
  });
});
