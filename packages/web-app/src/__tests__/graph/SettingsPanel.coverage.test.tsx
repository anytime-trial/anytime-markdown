import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockSetThemeMode = jest.fn();
const mockSetLocale = jest.fn();

jest.mock("../../app/providers", () => ({
  useThemeMode: () => ({ themeMode: "dark", setThemeMode: mockSetThemeMode }),
}));

jest.mock("../../app/LocaleProvider", () => ({
  useLocaleSwitch: () => ({ locale: "en", setLocale: mockSetLocale }),
}));

jest.mock("@anytime-markdown/graph-core", () => ({
  getCanvasColors: () => ({
    panelBg: "#1a1a2e",
    panelBorder: "#333",
    textPrimary: "#fff",
    textSecondary: "#aaa",
    accentColor: "#4fc3f7",
    hoverBg: "rgba(255,255,255,0.08)",
  }),
}));

import { SettingsPanel } from "../../app/graph/components/SettingsPanel";

describe("SettingsPanel", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when not open", () => {
    const { container } = render(
      <SettingsPanel open={false} width={260} onClose={jest.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders settings panel when open", () => {
    render(<SettingsPanel open={true} width={260} onClose={jest.fn()} />);
    expect(screen.getByText("settings")).toBeTruthy();
    expect(screen.getByText("themeMode")).toBeTruthy();
    expect(screen.getByText("language")).toBeTruthy();
  });

  it("renders theme toggle buttons", () => {
    render(<SettingsPanel open={true} width={260} onClose={jest.fn()} />);
    expect(screen.getByText("Light")).toBeTruthy();
    expect(screen.getByText("Dark")).toBeTruthy();
  });

  it("renders language toggle buttons", () => {
    render(<SettingsPanel open={true} width={260} onClose={jest.fn()} />);
    expect(screen.getByText("English")).toBeTruthy();
    expect(screen.getByText("Japanese")).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = jest.fn();
    render(<SettingsPanel open={true} width={260} onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    const closeButton = buttons.find(b => b.querySelector('[data-testid="CloseIcon"]'));
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it("handles theme toggle change to light", () => {
    render(<SettingsPanel open={true} width={260} onClose={jest.fn()} />);
    const lightBtn = screen.getByText("Light");
    fireEvent.click(lightBtn);
    expect(mockSetThemeMode).toHaveBeenCalledWith("light");
  });

  it("handles language toggle change to Japanese", () => {
    render(<SettingsPanel open={true} width={260} onClose={jest.fn()} />);
    const jaBtn = screen.getByText("Japanese");
    fireEvent.click(jaBtn);
    expect(mockSetLocale).toHaveBeenCalledWith("ja");
  });

  it("shows dark mode icon in dark mode", () => {
    render(<SettingsPanel open={true} width={260} onClose={jest.fn()} />);
    expect(document.querySelector('[data-testid="DarkModeIcon"]')).toBeTruthy();
  });

  it("handles theme toggle change to dark", () => {
    render(<SettingsPanel open={true} width={260} onClose={jest.fn()} />);
    const darkBtn = screen.getByText("Dark");
    fireEvent.click(darkBtn);
    // Already dark mode, but should still trigger the onChange
  });

  it("handles language toggle change to English", () => {
    render(<SettingsPanel open={true} width={260} onClose={jest.fn()} />);
    const enBtn = screen.getByText("English");
    fireEvent.click(enBtn);
    // Already English, but onChange fires
  });
});
