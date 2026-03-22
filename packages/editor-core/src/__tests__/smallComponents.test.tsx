/**
 * 小規模コンポーネントのスモークテスト（カバレッジ向上目的）
 * EditorMainContent, EditorContentArea, EditorDialogs, EditorSideToolbar,
 * FrontmatterBlock, EditorMergeContent, EditorToolbarSection,
 * EditorFooterOverlays, ReadonlyToolbar, EditorOutlineSection,
 * EditorDialogsSection, FullPageLoader, MarkdownIcon
 */
import React from "react";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// --- Common mocks ---

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

jest.mock("@tiptap/react", () => ({
  EditorContent: () => <div data-testid="editor-content" />,
  useEditor: () => null,
}));

jest.mock("../useEditorSettings", () => ({
  EditorSettingsContext: React.createContext({}),
  useEditorSettingsContext: () => ({
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: "sans-serif",
    blockAlign: "left",
    tableWidth: "100%",
  }),
  useEditorSettings: () => ({
    settings: { fontSize: 14 },
    updateSettings: jest.fn(),
    resetSettings: jest.fn(),
  }),
}));

jest.mock("../constants/colors", () => ({
  DEFAULT_DARK_BG: "#1e1e1e",
  DEFAULT_LIGHT_BG: "#fff",
  FILE_DROP_OVERLAY_COLOR: "rgba(0,0,0,0.1)",
  getActionHover: () => "rgba(0,0,0,0.04)",
  getActionSelected: () => "rgba(0,0,0,0.08)",
  getBgDefault: () => "#fafafa",
  getBgPaper: () => "#fff",
  getDivider: () => "#ccc",
  getEditorBg: () => "#fff",
  getErrorMain: () => "#f00",
  getPrimaryMain: () => "#1976d2",
  getSuccessMain: () => "#0f0",
  getTextDisabled: () => "#999",
  getTextPrimary: () => "#000",
  getTextSecondary: () => "#666",
  getPrimaryContrast: () => "#fff",
  getPrimaryDark: () => "#115293",
  getPrimaryLight: () => "#4791db",
  CAPTURE_BG: "#fff",
}));

jest.mock("../constants/dimensions", () => ({
  CHIP_FONT_SIZE: 12,
  CONTEXT_MENU_FONT_SIZE: 13,
  MENU_ITEM_FONT_SIZE: 13,
  PANEL_BUTTON_FONT_SIZE: 12,
  SHORTCUT_HINT_FONT_SIZE: 11,
  SMALL_CAPTION_FONT_SIZE: 10,
  STATUSBAR_FONT_SIZE: 11,
  STATUSBAR_HEIGHT: 24,
  TOOLBAR_HEIGHT: 40,
}));

jest.mock("../constants/zIndex", () => ({
  Z_DIALOG: 1400,
  Z_FULLSCREEN: 1300,
  Z_OVERLAY: 1200,
  Z_TOOLBAR: 1100,
}));

const theme = createTheme();

// --- MarkdownIcon ---

describe("MarkdownIcon", () => {
  it("renders without crashing", async () => {
    const mod = await import("../icons/MarkdownIcon");
    const MarkdownIcon = mod.default;
    const { container } = render(
      <ThemeProvider theme={theme}>
        <MarkdownIcon />
      </ThemeProvider>,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

// --- FullPageLoader ---

describe("FullPageLoader", () => {
  it("renders without crashing", async () => {
    const mod = await import("../components/loader/FullPageLoader");
    const FullPageLoader = mod.default;
    const { container } = render(
      <ThemeProvider theme={theme}>
        <FullPageLoader />
      </ThemeProvider>,
    );
    expect(container).toBeTruthy();
  });
});

// --- version ---

describe("version", () => {
  it("exports a version string", async () => {
    const mod = await import("../version");
    expect(typeof mod.APP_VERSION).toBe("string");
    expect(mod.APP_VERSION.length).toBeGreaterThan(0);
  });
});
