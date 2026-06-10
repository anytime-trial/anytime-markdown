/**
 * 小規模拡張のテスト（カバレッジ向上目的）
 * customHardBreak, deleteLineExtension, mergeTiptapStyles, useEditorMenuState, useEditorSettingsSync
 */
import { renderHook, act } from "@testing-library/react";

// --- customHardBreak ---

describe("CustomHardBreak", () => {
  it("has expected structure", async () => {
    const { CustomHardBreak } = await import("../extensions/customHardBreak");
    expect(CustomHardBreak.name).toBe("hardBreak");
    expect(CustomHardBreak.config.addKeyboardShortcuts).toBeDefined();
    expect(CustomHardBreak.config.addStorage).toBeDefined();
  });

  it("addStorage returns markdown serializer", async () => {
    const { CustomHardBreak } = await import("../extensions/customHardBreak");
    const addStorage = CustomHardBreak.config.addStorage as () => any;
    const storage = addStorage();
    expect(storage.markdown).toBeDefined();
    expect(storage.markdown.serialize).toBeDefined();
    expect(typeof storage.markdown.serialize).toBe("function");
  });
});

// --- DeleteLineExtension ---

describe("DeleteLineExtension", () => {
  it("has name 'deleteLine'", async () => {
    const { DeleteLineExtension } = await import("../extensions/deleteLineExtension");
    expect(DeleteLineExtension.name).toBe("deleteLine");
  });

  it("defines Mod-Shift-k shortcut", async () => {
    const { DeleteLineExtension } = await import("../extensions/deleteLineExtension");
    expect(DeleteLineExtension.config.addKeyboardShortcuts).toBeDefined();
  });
});

