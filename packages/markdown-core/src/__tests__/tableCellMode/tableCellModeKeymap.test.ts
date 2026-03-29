import type { EditorView } from "@tiptap/pm/view";
import { TextSelection } from "@tiptap/pm/state";
import {
  isPrintableKey,
  isModifierOnly,
  handleNavigationKeyDown,
  handleEditingKeyDown,
  handleKeyDown,
  getAdjacentCellPos,
  clearCellContent,
  placeCursorAtCellEnd,
} from "../../plugins/tableCellMode/tableCellModeKeymap";

// TextSelection.create をモックして prosemirror の内部検証を回避
jest.spyOn(TextSelection, "create").mockReturnValue({} as TextSelection);

// ----------------------------------------------------------------
// Helper function tests (TDD - pure functions)
// ----------------------------------------------------------------

describe("isPrintableKey", () => {
  it("英字は true を返す", () => {
    expect(isPrintableKey("a")).toBe(true);
    expect(isPrintableKey("Z")).toBe(true);
  });

  it("数字は true を返す", () => {
    expect(isPrintableKey("1")).toBe(true);
    expect(isPrintableKey("0")).toBe(true);
  });

  it("スペースは true を返す", () => {
    expect(isPrintableKey(" ")).toBe(true);
  });

  it("記号は true を返す", () => {
    expect(isPrintableKey("!")).toBe(true);
    expect(isPrintableKey("@")).toBe(true);
    expect(isPrintableKey("-")).toBe(true);
    expect(isPrintableKey("/")).toBe(true);
  });

  it("日本語文字は true を返す", () => {
    expect(isPrintableKey("あ")).toBe(true);
    expect(isPrintableKey("漢")).toBe(true);
  });

  it("修飾キーは false を返す", () => {
    expect(isPrintableKey("Shift")).toBe(false);
    expect(isPrintableKey("Control")).toBe(false);
    expect(isPrintableKey("Alt")).toBe(false);
    expect(isPrintableKey("Meta")).toBe(false);
  });

  it("特殊キーは false を返す", () => {
    expect(isPrintableKey("Enter")).toBe(false);
    expect(isPrintableKey("Escape")).toBe(false);
    expect(isPrintableKey("Tab")).toBe(false);
    expect(isPrintableKey("Backspace")).toBe(false);
    expect(isPrintableKey("Delete")).toBe(false);
  });

  it("矢印キーは false を返す", () => {
    expect(isPrintableKey("ArrowUp")).toBe(false);
    expect(isPrintableKey("ArrowDown")).toBe(false);
    expect(isPrintableKey("ArrowLeft")).toBe(false);
    expect(isPrintableKey("ArrowRight")).toBe(false);
  });

  it("ファンクションキーは false を返す", () => {
    expect(isPrintableKey("F1")).toBe(false);
    expect(isPrintableKey("F2")).toBe(false);
    expect(isPrintableKey("F12")).toBe(false);
  });

  it("Unidentified は false を返す", () => {
    expect(isPrintableKey("Unidentified")).toBe(false);
  });

  it("Process (IME) は false を返す", () => {
    expect(isPrintableKey("Process")).toBe(false);
  });
});

describe("isModifierOnly", () => {
  it("Shift は true を返す", () => {
    expect(isModifierOnly("Shift")).toBe(true);
  });

  it("Control は true を返す", () => {
    expect(isModifierOnly("Control")).toBe(true);
  });

  it("Alt は true を返す", () => {
    expect(isModifierOnly("Alt")).toBe(true);
  });

  it("Meta は true を返す", () => {
    expect(isModifierOnly("Meta")).toBe(true);
  });

  it("AltGraph は true を返す", () => {
    expect(isModifierOnly("AltGraph")).toBe(true);
  });

  it("英字は false を返す", () => {
    expect(isModifierOnly("a")).toBe(false);
    expect(isModifierOnly("Z")).toBe(false);
  });

  it("特殊キーは false を返す", () => {
    expect(isModifierOnly("Enter")).toBe(false);
    expect(isModifierOnly("Escape")).toBe(false);
  });
});

// ----------------------------------------------------------------
// Navigation mode handler tests
// ----------------------------------------------------------------

describe("handleNavigationKeyDown", () => {
  const createMockView = (
    overrides: Partial<{
      dispatch: jest.Mock;
      state: Record<string, unknown>;
    }> = {},
  ) => {
    const dispatch = overrides.dispatch ?? jest.fn();
    return {
      state: {
        doc: {
          resolve: jest.fn(),
          nodeAt: jest.fn().mockReturnValue({
            type: { name: "tableCell" },
            nodeSize: 10,
          }),
        },
        tr: {
          setMeta: jest.fn().mockReturnThis(),
          setSelection: jest.fn().mockReturnThis(),
          replaceWith: jest.fn().mockReturnThis(),
        },
        schema: {
          nodes: {
            paragraph: {
              create: jest.fn().mockReturnValue({}),
            },
          },
        },
        ...(overrides.state ?? {}),
      },
      dispatch,
    } as unknown as EditorView;
  };

  const createMockEvent = (
    key: string,
    mods: Partial<{
      shiftKey: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      altKey: boolean;
    }> = {},
  ) =>
    ({
      key,
      shiftKey: mods.shiftKey ?? false,
      ctrlKey: mods.ctrlKey ?? false,
      metaKey: mods.metaKey ?? false,
      altKey: mods.altKey ?? false,
      preventDefault: jest.fn(),
    }) as unknown as KeyboardEvent;

  it("Shift+Arrow は false を返す（CellSelection に委譲）", () => {
    const view = createMockView();
    const event = createMockEvent("ArrowRight", { shiftKey: true });
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(false);
  });

  it("Escape はテーブルモードを終了する", () => {
    const view = createMockView();
    const event = createMockEvent("Escape");
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("Ctrl+C は false を返す（クリップボードに委譲）", () => {
    const view = createMockView();
    const event = createMockEvent("c", { ctrlKey: true });
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(false);
  });

  it("Ctrl+V は false を返す", () => {
    const view = createMockView();
    const event = createMockEvent("v", { ctrlKey: true });
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(false);
  });

  it("Ctrl+X は false を返す", () => {
    const view = createMockView();
    const event = createMockEvent("x", { ctrlKey: true });
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(false);
  });

  it("Meta+C は false を返す（macOS クリップボード）", () => {
    const view = createMockView();
    const event = createMockEvent("c", { metaKey: true });
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(false);
  });

  it("修飾キー単体は false を返す", () => {
    const view = createMockView();
    const event = createMockEvent("Shift");
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(false);
  });

  it("Enter は editing モードに遷移する", () => {
    const view = createMockView();
    const event = createMockEvent("Enter");
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("F2 は editing モードに遷移する", () => {
    const view = createMockView();
    const event = createMockEvent("F2");
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("Delete はセル内容をクリアする", () => {
    const view = createMockView();
    const event = createMockEvent("Delete");
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(true);
  });

  it("Backspace はセル内容をクリアする", () => {
    const view = createMockView();
    const event = createMockEvent("Backspace");
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(true);
  });

  it("印字可能キーは editing モードに遷移し false を返す", () => {
    const view = createMockView();
    const event = createMockEvent("a");
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(false);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("その他のキーは preventDefault して true を返す", () => {
    const view = createMockView();
    const event = createMockEvent("F5");
    const result = handleNavigationKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// Editing mode handler tests
// ----------------------------------------------------------------

describe("handleEditingKeyDown", () => {
  const createMockView = () =>
    ({
      state: {
        doc: {
          nodeAt: jest.fn().mockReturnValue({
            type: { name: "tableCell" },
            nodeSize: 10,
          }),
        },
        tr: {
          setMeta: jest.fn().mockReturnThis(),
          setSelection: jest.fn().mockReturnThis(),
        },
        schema: {
          nodes: {
            paragraph: {
              create: jest.fn().mockReturnValue({}),
            },
          },
        },
      },
      dispatch: jest.fn(),
    }) as unknown as EditorView;

  const createMockEvent = (
    key: string,
    mods: Partial<{ shiftKey: boolean }> = {},
  ) =>
    ({
      key,
      shiftKey: mods.shiftKey ?? false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: jest.fn(),
    }) as unknown as KeyboardEvent;

  it("Enter（Shift なし）は navigation モードに遷移する", () => {
    const view = createMockView();
    const event = createMockEvent("Enter");
    const result = handleEditingKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("Shift+Enter は false を返す（改行を許可）", () => {
    const view = createMockView();
    const event = createMockEvent("Enter", { shiftKey: true });
    const result = handleEditingKeyDown(view, event, 5);
    expect(result).toBe(false);
  });

  it("Tab は navigation モードに遷移する", () => {
    const view = createMockView();
    const event = createMockEvent("Tab");
    const result = handleEditingKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("Shift+Tab は navigation モードに遷移する", () => {
    const view = createMockView();
    const event = createMockEvent("Tab", { shiftKey: true });
    const result = handleEditingKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("Escape は navigation モードに戻る", () => {
    const view = createMockView();
    const event = createMockEvent("Escape");
    const result = handleEditingKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("F2 は navigation モードに戻る", () => {
    const view = createMockView();
    const event = createMockEvent("F2");
    const result = handleEditingKeyDown(view, event, 5);
    expect(result).toBe(true);
    expect(view.dispatch).toHaveBeenCalled();
  });

  it("通常のキーは false を返す（ProseMirror に委譲）", () => {
    const view = createMockView();
    const event = createMockEvent("a");
    const result = handleEditingKeyDown(view, event, 5);
    expect(result).toBe(false);
  });
});

// ----------------------------------------------------------------
// handleKeyDown (unified entry point)
// ----------------------------------------------------------------

describe("handleKeyDown", () => {
  it("プラグイン状態がない場合は false を返す", () => {
    // tableCellModePluginKey.getState が undefined を返すケース
    const view = {
      state: {
        doc: { nodeAt: jest.fn() },
        tr: { setMeta: jest.fn().mockReturnThis() },
      },
      dispatch: jest.fn(),
    } as unknown as EditorView;
    const event = {
      key: "a",
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: jest.fn(),
    } as unknown as KeyboardEvent;

    // handleKeyDown reads from pluginKey.getState which returns undefined
    // when plugin is not registered. We test this indirectly.
    const result = handleKeyDown(view, event);
    expect(result).toBe(false);
  });
});

// ----------------------------------------------------------------
// getAdjacentCellPos
// ----------------------------------------------------------------

describe("getAdjacentCellPos", () => {
  it("テーブルノードが見つからない場合は null を返す", () => {
    const mockResolve = {
      depth: 1,
      node: jest.fn().mockReturnValue({ type: { name: "paragraph" } }),
    };
    const view = {
      state: {
        doc: {
          resolve: jest.fn().mockReturnValue(mockResolve),
        },
      },
    } as unknown as EditorView;

    const result = getAdjacentCellPos(view, 5, "right");
    expect(result).toBeNull();
  });
});

// ----------------------------------------------------------------
// clearCellContent
// ----------------------------------------------------------------

describe("clearCellContent", () => {
  it("セルが見つからない場合は何もしない", () => {
    const dispatch = jest.fn();
    const view = {
      state: {
        doc: { nodeAt: jest.fn().mockReturnValue(null) },
        tr: {},
        schema: { nodes: { paragraph: { create: jest.fn() } } },
      },
      dispatch,
    } as unknown as EditorView;

    clearCellContent(view, 5);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("セル内容がある場合は paragraph で置換する", () => {
    const mockParagraph = {};
    const replaceWith = jest.fn().mockReturnThis();
    const dispatch = jest.fn();
    const view = {
      state: {
        doc: {
          nodeAt: jest.fn().mockReturnValue({
            type: { name: "tableCell" },
            nodeSize: 10,
          }),
        },
        tr: { replaceWith },
        schema: {
          nodes: {
            paragraph: { create: jest.fn().mockReturnValue(mockParagraph) },
          },
        },
      },
      dispatch,
    } as unknown as EditorView;

    clearCellContent(view, 5);
    expect(replaceWith).toHaveBeenCalledWith(6, 14, mockParagraph);
    expect(dispatch).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------
// placeCursorAtCellEnd
// ----------------------------------------------------------------

describe("placeCursorAtCellEnd", () => {
  it("セルが見つからない場合は何もしない", () => {
    const dispatch = jest.fn();
    const view = {
      state: {
        doc: { nodeAt: jest.fn().mockReturnValue(null) },
        tr: {},
      },
      dispatch,
    } as unknown as EditorView;

    placeCursorAtCellEnd(view, 5);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
