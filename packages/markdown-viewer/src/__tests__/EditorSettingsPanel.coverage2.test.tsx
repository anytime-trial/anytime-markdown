/**
 * EditorSettingsPanel.tsx coverage2 tests
 * Targets: handleReset cancel, handleLocaleChange, dark mode switch,
 *   table width, block align, paper size, spell check onChange
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mockConfirm = jest.fn();

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "ja",
}));

jest.mock("@/hooks/useConfirm", () => ({
  __esModule: true,
  default: () => mockConfirm,
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
  const result = render(<EditorSettingsPanel {...(props as any)} />);
  return { ...result, ...props };
}

describe("EditorSettingsPanel - coverage2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not call resetSettings when user cancels confirm", async () => {
    mockConfirm.mockRejectedValue(new Error("cancelled"));
    const { resetSettings } = renderPanel();
    await act(async () => { fireEvent.click(screen.getByText("settingReset")); });
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(resetSettings).not.toHaveBeenCalled();
  });

  it("calls resetSettings when user confirms", async () => {
    mockConfirm.mockResolvedValue(undefined);
    const { resetSettings } = renderPanel();
    await act(async () => { fireEvent.click(screen.getByText("settingReset")); });
    await waitFor(() => expect(resetSettings).toHaveBeenCalled());
  });

  it("does nothing when same locale is selected", () => {
    const onLocaleChange = jest.fn();
    renderPanel({ themeMode: "light", onThemeModeChange: jest.fn(), onLocaleChange });
    const buttons = screen.getAllByRole("button");
    const jaBtn = buttons.find(b => b.textContent === "\u65E5\u672C\u8A9E");
    if (jaBtn) fireEvent.click(jaBtn);
    expect(onLocaleChange).not.toHaveBeenCalled();
  });

  it("calls onThemeModeChange with dark when toggled on", () => {
    const onThemeModeChange = jest.fn();
    renderPanel({ themeMode: "light", onThemeModeChange });
    const switchSection = screen.getByText("settingDarkMode").closest("[class]")!.parentElement!;
    const checkbox = switchSection.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);
    expect(onThemeModeChange).toHaveBeenCalledWith("dark");
  });

  it("calls onThemeModeChange with light when toggled off", () => {
    const onThemeModeChange = jest.fn();
    renderPanel({ themeMode: "dark", onThemeModeChange });
    const switchSection = screen.getByText("settingDarkMode").closest("[class]")!.parentElement!;
    const checkbox = switchSection.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);
    expect(onThemeModeChange).toHaveBeenCalledWith("light");
  });

  it("updates tableWidth to 100%", () => {
    const updateSettings = jest.fn();
    renderPanel({ updateSettings });
    fireEvent.click(screen.getByText("settingTableFull"));
    expect(updateSettings).toHaveBeenCalledWith({ tableWidth: "100%" });
  });

  it("updates blockAlign to center", () => {
    const updateSettings = jest.fn();
    renderPanel({ updateSettings });
    fireEvent.click(screen.getByText("settingAlignCenter"));
    expect(updateSettings).toHaveBeenCalledWith({ blockAlign: "center" });
  });

  it("updates blockAlign to right", () => {
    const updateSettings = jest.fn();
    renderPanel({ updateSettings });
    fireEvent.click(screen.getByText("settingAlignRight"));
    expect(updateSettings).toHaveBeenCalledWith({ blockAlign: "right" });
  });

  it("updates paperSize via select", () => {
    const updateSettings = jest.fn();
    renderPanel({ updateSettings });
    const paperLabel = screen.getByText("settingPaperSize");
    const section = paperLabel.closest("[class]")!.parentElement!;
    const selectButton = section.querySelector('[role="combobox"]');
    expect(selectButton).toBeTruthy();
    fireEvent.mouseDown(selectButton!);
    fireEvent.click(screen.getByText("A4"));
    expect(updateSettings).toHaveBeenCalledWith({ paperSize: "A4" });
  });

  it("toggles spell check on", () => {
    const updateSettings = jest.fn();
    renderPanel({ updateSettings });
    const spellLabel = screen.getByText("settingSpellCheck");
    const section = spellLabel.closest("[class]")!.parentElement!;
    const checkbox = section.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);
    expect(updateSettings).toHaveBeenCalledWith({ spellCheck: true });
  });

  it("toggles spell check off", () => {
    const updateSettings = jest.fn();
    renderPanel({ updateSettings, settings: { ...DEFAULT_SETTINGS, spellCheck: true } });
    const spellLabel = screen.getByText("settingSpellCheck");
    const section = spellLabel.closest("[class]")!.parentElement!;
    const checkbox = section.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);
    expect(updateSettings).toHaveBeenCalledWith({ spellCheck: false });
  });

  it("calls onLocaleChange when English is selected", () => {
    const onLocaleChange = jest.fn();
    renderPanel({ themeMode: "light", onThemeModeChange: jest.fn(), onLocaleChange });
    fireEvent.click(screen.getByText("English"));
    expect(onLocaleChange).toHaveBeenCalledWith("en");
  });
});
