/**
 * deleteLineExtension.ts のテスト
 */
import { DeleteLineExtension } from "../extensions/deleteLineExtension";

describe("DeleteLineExtension", () => {
  it("has name 'deleteLine'", () => {
    expect(DeleteLineExtension.name).toBe("deleteLine");
  });

  it("defines addKeyboardShortcuts with Mod-Shift-k", () => {
    expect(DeleteLineExtension.config.addKeyboardShortcuts).toBeDefined();
    const addShortcuts = DeleteLineExtension.config.addKeyboardShortcuts as Function;
    const shortcuts = addShortcuts.call({});
    expect(shortcuts["Mod-Shift-k"]).toBeDefined();
  });

  it("Mod-Shift-k deletes current line", () => {
    const addShortcuts = DeleteLineExtension.config.addKeyboardShortcuts as Function;
    const shortcuts = addShortcuts.call({});
    const deleteFn = jest.fn().mockReturnThis();
    const dispatch = jest.fn();
    const mockEditor = {
      state: {
        selection: {
          $from: {
            depth: 1,
            before: () => 0,
            after: () => 10,
          },
        },
        tr: { delete: deleteFn },
      },
      view: { dispatch },
    };
    const result = shortcuts["Mod-Shift-k"]({ editor: mockEditor });
    expect(result).toBe(true);
    expect(deleteFn).toHaveBeenCalledWith(0, 10);
    expect(dispatch).toHaveBeenCalled();
  });
});
