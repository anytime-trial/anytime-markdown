/**
 * codeBlockNavigationExtension.ts - カバレッジテスト
 * Escape keyboard shortcut handler
 */
import { CodeBlockNavigation } from "../extensions/codeBlockNavigationExtension";

// Mock @tiptap/core Extension.create
jest.mock("@tiptap/core", () => ({
  Extension: {
    create: jest.fn().mockImplementation((config) => config),
  },
}));

jest.mock("@tiptap/pm/state", () => ({
  TextSelection: {
    near: jest.fn().mockImplementation((resolved, bias) => ({ resolved, bias })),
  },
}));

describe("codeBlockNavigationExtension coverage", () => {
  it("exports CodeBlockNavigation with name", () => {
    expect(CodeBlockNavigation.name).toBe("codeBlockNavigation");
  });

  it("Escape handler returns false when not inside codeBlock", () => {
    const shortcuts = (CodeBlockNavigation as any).addKeyboardShortcuts!.call({});
    const mockEditor = {
      state: {
        selection: {
          $from: {
            parent: { type: { name: "paragraph" } },
            after: jest.fn().mockReturnValue(10),
            depth: 1,
          },
        },
        doc: {
          content: { size: 100 },
          resolve: jest.fn().mockReturnValue({}),
        },
        tr: {
          setSelection: jest.fn().mockReturnThis(),
          scrollIntoView: jest.fn().mockReturnThis(),
        },
      },
      view: {
        dispatch: jest.fn(),
      },
    };

    const result = shortcuts.Escape({ editor: mockEditor as any });
    expect(result).toBe(false);
  });

  it("Escape handler moves cursor after codeBlock", () => {
    const shortcuts = (CodeBlockNavigation as any).addKeyboardShortcuts!.call({});
    const setSelection = jest.fn().mockReturnThis();
    const scrollIntoView = jest.fn().mockReturnThis();
    const dispatch = jest.fn();
    const resolved = { type: "resolved" };

    const mockEditor = {
      state: {
        selection: {
          $from: {
            parent: { type: { name: "codeBlock" } },
            after: jest.fn().mockReturnValue(20),
            depth: 1,
          },
        },
        doc: {
          content: { size: 100 },
          resolve: jest.fn().mockReturnValue(resolved),
        },
        tr: {
          setSelection,
          scrollIntoView,
        },
      },
      view: {
        dispatch,
      },
    };

    const result = shortcuts.Escape({ editor: mockEditor as any });
    expect(result).toBe(true);
    expect(mockEditor.state.doc.resolve).toHaveBeenCalledWith(20);
    expect(dispatch).toHaveBeenCalled();
  });

  it("Escape handler clamps afterPos to doc size", () => {
    const shortcuts = (CodeBlockNavigation as any).addKeyboardShortcuts!.call({});
    const setSelection = jest.fn().mockReturnThis();
    const scrollIntoView = jest.fn().mockReturnThis();
    const dispatch = jest.fn();

    const mockEditor = {
      state: {
        selection: {
          $from: {
            parent: { type: { name: "codeBlock" } },
            after: jest.fn().mockReturnValue(200), // beyond doc size
            depth: 1,
          },
        },
        doc: {
          content: { size: 50 },
          resolve: jest.fn().mockReturnValue({}),
        },
        tr: {
          setSelection,
          scrollIntoView,
        },
      },
      view: {
        dispatch,
      },
    };

    const result = shortcuts.Escape({ editor: mockEditor as any });
    expect(result).toBe(true);
    // Should clamp to doc size (50)
    expect(mockEditor.state.doc.resolve).toHaveBeenCalledWith(50);
  });
});
