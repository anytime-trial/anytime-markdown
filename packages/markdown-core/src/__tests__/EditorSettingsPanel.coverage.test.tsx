/**
 * EditorSettingsPanel.tsx のカバレッジテスト
 * 未カバレッジ: handleReset, handleLocaleChange, dark mode switch, theme preset, table width, block align, paper size/margin, spell check
 */
import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ja",
}));

jest.mock("@/hooks/useConfirm", () => ({
  __esModule: true,
  default: () => jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../constants/colors", () => ({
  getTextSecondary: () => "#666",
}));

jest.mock("../constants/dimensions", () => ({
  PAPER_MARGIN_MAX: 100,
  PAPER_MARGIN_MIN: 0,
  PAPER_MARGIN_STEP: 10,
  PAPER_SIZE_OPTIONS: ["A4", "Letter", "off"],
}));

jest.mock("../constants/themePresets", () => ({
  PRESET_NAMES: ["default", "sepia"],
  THEME_PRESETS: {
    default: { label: "Default" },
    sepia: { label: "Sepia" },
  },
}));

import { EditorSettingsPanel } from "../components/EditorSettingsPanel";
import { DEFAULT_SETTINGS } from "../useEditorSettings";

const t = (key: string) => key;

function renderPanel(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true,
    onClose: jest.fn(),
    settings: { ...DEFAULT_SETTINGS },
    updateSettings: jest.fn(),
    resetSettings: jest.fn(),
    t,
    ...overrides,
  };
  return { ...render(<EditorSettingsPanel {...(props as any)} />), ...props };
}

describe("EditorSettingsPanel coverage", () => {
  it("renders dark mode section when themeMode provided", () => {
    renderPanel({
      themeMode: "light",
      onThemeModeChange: jest.fn(),
    });
    expect(screen.getByText("settingDarkMode")).toBeTruthy();
    expect(screen.getByText("settingLanguage")).toBeTruthy();
  });

  it("renders language toggle and calls onLocaleChange", () => {
    const onLocaleChange = jest.fn();
    renderPanel({
      themeMode: "light",
      onThemeModeChange: jest.fn(),
      onLocaleChange,
    });
    const enBtn = screen.getByText("English");
    fireEvent.click(enBtn);
    expect(onLocaleChange).toHaveBeenCalledWith("en");
  });

  it("renders theme preset buttons when provided", () => {
    const onPresetChange = jest.fn();
    renderPanel({
      themeMode: "light",
      onThemeModeChange: jest.fn(),
      presetName: "default",
      onPresetChange,
    });
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByText("Sepia")).toBeTruthy();
  });

  it("calls onPresetChange when preset clicked", () => {
    const onPresetChange = jest.fn();
    renderPanel({
      themeMode: "light",
      onThemeModeChange: jest.fn(),
      presetName: "default",
      onPresetChange,
    });
    fireEvent.click(screen.getByText("Sepia"));
    expect(onPresetChange).toHaveBeenCalledWith("sepia");
  });

  it("renders font size slider", () => {
    renderPanel();
    expect(screen.getByLabelText("settingFontSize")).toBeTruthy();
  });

  it("renders table width toggle", () => {
    renderPanel();
    expect(screen.getByLabelText("tableWidthSelect")).toBeTruthy();
  });

  it("renders block align toggle", () => {
    renderPanel();
    expect(screen.getByLabelText("settingBlockAlign")).toBeTruthy();
  });

  it("renders paper size select", () => {
    renderPanel();
    expect(screen.getByLabelText("settingPaperSize")).toBeTruthy();
  });

  it("renders spell check section", () => {
    renderPanel();
    expect(screen.getByText("settingSpellCheck")).toBeTruthy();
  });

  it("calls resetSettings on reset button click", async () => {
    const resetSettings = jest.fn();
    renderPanel({ resetSettings });
    await act(async () => {
      fireEvent.click(screen.getByText("settingReset"));
    });
    await waitFor(() => {
      expect(resetSettings).toHaveBeenCalled();
    });
  });

  it("renders close button", () => {
    const onClose = jest.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByLabelText("close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders paper margin when paperSize is not off", () => {
    renderPanel({
      settings: { ...DEFAULT_SETTINGS, paperSize: "A4", paperMargin: 40 },
    });
    expect(screen.getByLabelText("settingPaperMargin")).toBeTruthy();
  });

  it("hides paper margin when paperSize is off", () => {
    renderPanel({
      settings: { ...DEFAULT_SETTINGS, paperSize: "off" },
    });
    expect(screen.queryByLabelText("settingPaperMargin")).toBeNull();
  });
});
