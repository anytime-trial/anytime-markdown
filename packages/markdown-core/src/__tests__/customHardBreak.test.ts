/**
 * customHardBreak.ts のテスト
 */
import { CustomHardBreak } from "../extensions/customHardBreak";

describe("CustomHardBreak", () => {
  it("has name 'hardBreak'", () => {
    expect(CustomHardBreak.name).toBe("hardBreak");
  });

  it("defines addKeyboardShortcuts", () => {
    expect(CustomHardBreak.config.addKeyboardShortcuts).toBeDefined();
  });

  it("defines addStorage with markdown serializer", () => {
    expect(CustomHardBreak.config.addStorage).toBeDefined();
    const addStorage = CustomHardBreak.config.addStorage as () => any;
    const storage = addStorage();
    expect(storage.markdown).toBeDefined();
    expect(storage.markdown.serialize).toBeDefined();
  });

  it("addKeyboardShortcuts returns Shift-Enter handler", () => {
    const addShortcuts = CustomHardBreak.config.addKeyboardShortcuts as Function;
    const mockEditor = {
      isActive: jest.fn().mockReturnValue(false),
      commands: { setHardBreak: jest.fn().mockReturnValue(true) },
    };
    const shortcuts = addShortcuts.call({ editor: mockEditor });
    expect(shortcuts["Shift-Enter"]).toBeDefined();
  });

  it("Shift-Enter returns false in codeBlock", () => {
    const addShortcuts = CustomHardBreak.config.addKeyboardShortcuts as Function;
    const mockEditor = {
      isActive: jest.fn().mockImplementation((name: string) => name === "codeBlock"),
      commands: { setHardBreak: jest.fn() },
    };
    const shortcuts = addShortcuts.call({ editor: mockEditor });
    const result = shortcuts["Shift-Enter"]();
    expect(result).toBe(false);
  });
});
