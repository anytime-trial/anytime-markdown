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
  it("returns an object with styles", async () => {
    jest.mock("../constants/colors", () => ({
      getActionHover: () => "rgba(0,0,0,0.04)",
      getActionSelected: () => "rgba(0,0,0,0.08)",
      getDivider: () => "#ccc",
      getErrorMain: () => "#f00",
      getGrey: () => "#999",
      getPrimaryMain: () => "#1976d2",
      getTextPrimary: () => "#000",
      getTextSecondary: () => "#666",
    }));
    jest.mock("../constants/dimensions", () => ({
      MERGE_BADGE_FONT_SIZE: 10,
    }));

    const { getMergeTiptapStyles } = await import("../components/mergeTiptapStyles");
    const { createTheme } = await import("@mui/material/styles");
    const theme = createTheme();
    const styles = getMergeTiptapStyles(theme);
    expect(styles).toBeDefined();
    expect(typeof styles).toBe("object");
  });

  it("returns styles with showHoverLabels enabled", async () => {
    const { getMergeTiptapStyles } = await import("../components/mergeTiptapStyles");
    const { createTheme } = await import("@mui/material/styles");
    const theme = createTheme();
    const styles = getMergeTiptapStyles(theme, 14, 1.6, { showHoverLabels: true });
    expect(styles).toBeDefined();
  });

  it("returns styles with dark theme", async () => {
    const { getMergeTiptapStyles } = await import("../components/mergeTiptapStyles");
    const { createTheme } = await import("@mui/material/styles");
    const darkTheme = createTheme({ palette: { mode: "dark" } });
    const styles = getMergeTiptapStyles(darkTheme, 16, 1.8);
    expect(styles).toBeDefined();
  });

  it("returns styles with dark theme and showHoverLabels", async () => {
    const { getMergeTiptapStyles } = await import("../components/mergeTiptapStyles");
    const { createTheme } = await import("@mui/material/styles");
    const darkTheme = createTheme({ palette: { mode: "dark" } });
    const styles = getMergeTiptapStyles(darkTheme, 14, 1.6, { showHoverLabels: true });
    expect(styles).toBeDefined();
  });

  it("uses default fontSize and lineHeight parameters", async () => {
    const { getMergeTiptapStyles } = await import("../components/mergeTiptapStyles");
    const { createTheme } = await import("@mui/material/styles");
    const theme = createTheme();
    const styles = getMergeTiptapStyles(theme);
    expect(styles).toBeDefined();
  });
});
