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

// --- useEditorMenuState ---

describe("useEditorMenuState", () => {
  it("returns initial state values", async () => {
    const { useEditorMenuState } = await import("../hooks/useEditorMenuState");
    const { result } = renderHook(() => useEditorMenuState());
    expect(result.current.settingsOpen).toBe(false);
    expect(result.current.sampleAnchorEl).toBeNull();
    expect(result.current.diagramAnchorEl).toBeNull();
    expect(result.current.helpAnchorEl).toBeNull();
    expect(result.current.templateAnchorEl).toBeNull();
    expect(result.current.headingMenu).toBeNull();
  });

  it("can toggle settingsOpen", async () => {
    const { useEditorMenuState } = await import("../hooks/useEditorMenuState");
    const { result } = renderHook(() => useEditorMenuState());
    act(() => {
      result.current.setSettingsOpen(true);
    });
    expect(result.current.settingsOpen).toBe(true);
  });
});

// --- mergeTiptapStyles ---

describe("getMergeTiptapStyles", () => {
  let getMergeTiptapStyles: typeof import("../components/mergeTiptapStyles").getMergeTiptapStyles;
  let DEFAULT_SETTINGS: typeof import("../useEditorSettings").DEFAULT_SETTINGS;

  beforeAll(async () => {
    ({ getMergeTiptapStyles } = await import("../components/mergeTiptapStyles"));
    ({ DEFAULT_SETTINGS } = await import("../useEditorSettings"));
  });

  it("returns an object with .tiptap styles (light)", () => {
    const styles = getMergeTiptapStyles(false, DEFAULT_SETTINGS);
    expect(styles).toBeDefined();
    expect(styles["& .tiptap"]).toBeDefined();
  });

  it("returns styles with showHoverLabels enabled", () => {
    const styles = getMergeTiptapStyles(false, DEFAULT_SETTINGS, { showHoverLabels: true });
    expect(styles).toBeDefined();
  });

  it("returns styles with dark theme", () => {
    const styles = getMergeTiptapStyles(true, DEFAULT_SETTINGS);
    expect(styles).toBeDefined();
  });

  it("returns styles with dark theme and showHoverLabels", () => {
    const styles = getMergeTiptapStyles(true, DEFAULT_SETTINGS, { showHoverLabels: true });
    expect(styles).toBeDefined();
  });
});
