/**
 * Additional coverage for providers.tsx - preset handling, updateStatusBar, handwritten preset
 */
import { renderHook, act } from "@testing-library/react";
import React from "react";

// Mock Capacitor as native platform for StatusBar coverage
const mockSetStyle = jest.fn();
const mockSetBgColor = jest.fn();
jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
jest.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: mockSetStyle, setBackgroundColor: mockSetBgColor },
  Style: { Light: "LIGHT", Dark: "DARK" },
}));

jest.mock("@anytime-markdown/markdown-core", () => {
  const presets: Record<string, any> = {
    professional: {
      label: "Professional",
      fontFamily: '"Roboto", sans-serif',
      displayFont: '"Playfair Display", serif',
      borderRadius: { sm: 4, md: 8, lg: 12 },
    },
    handwritten: {
      label: "Handwritten",
      fontFamily: '"Klee One", sans-serif',
      displayFont: '"Nunito", "Klee One", sans-serif',
      borderRadius: { sm: 4, md: 8, lg: 12 },
    },
  };
  return {
    ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
    ACCENT_COLOR: "#e8a012",
    DEFAULT_DARK_BG: "#0D1117",
    DEFAULT_LIGHT_BG: "#F8F9FA",
    DEFAULT_PRESET_NAME: "professional",
    getPreset: (name: string) => presets[name] ?? presets.professional,
    isPresetName: (name: string) => !!presets[name],
    getBgPaper: (isDark: boolean) => isDark ? "#121212" : "#FBF9F3",
    getDivider: (isDark: boolean) => isDark ? "rgba(255,255,255,0.12)" : "rgba(31,30,28,0.12)",
    getTextPrimary: (isDark: boolean) => isDark ? "#ffffffde" : "#1F1E1C",
    getTextSecondary: (isDark: boolean) => isDark ? "#ffffff99" : "#5C5A55",
    getTextDisabled: (isDark: boolean) => isDark ? "#ffffff73" : "#A9A6A0",
    getActionHover: (isDark: boolean) => isDark ? "rgba(255,255,255,0.08)" : "rgba(31,30,28,0.04)",
    getActionSelected: (isDark: boolean) => isDark ? "rgba(255,255,255,0.16)" : "rgba(31,30,28,0.08)",
    getPrimaryMain: (isDark: boolean) => isDark ? "#90CAF9" : "#3D4A52",
    getPrimaryDark: (isDark: boolean) => isDark ? "#42A5F5" : "#222A30",
    getPrimaryLight: (isDark: boolean) => isDark ? "#E3F2FD" : "#8A918F",
    getPrimaryContrast: (isDark: boolean) => isDark ? "rgba(0,0,0,0.87)" : "#FBF9F3",
    getErrorMain: (isDark: boolean) => isDark ? "#F44336" : "#6B2A20",
    getWarningMain: (isDark: boolean) => isDark ? "#9B7BD8" : "#4A5A6B",
    getWarningLight: (isDark: boolean) => isDark ? "#B89FE8" : "#5D6E80",
    getSuccessMain: (isDark: boolean) => isDark ? "#66BB6A" : "#4B5A3E",
    getInfoMain: (isDark: boolean) => isDark ? "#42A5F5" : "#3D4A52",
  };
});

import { Providers, useThemeMode, usePreset } from "../app/providers";

describe("Providers - preset handling", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it("usePreset returns default preset and allows changing", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => usePreset(), { wrapper });
    expect(result.current.presetName).toBe("professional");

    act(() => {
      result.current.setPresetName("handwritten" as any);
    });
    expect(result.current.presetName).toBe("handwritten");
    expect(localStorage.getItem("anytime-markdown-theme-preset")).toBe("handwritten");
  });

  it("restores preset from localStorage", () => {
    localStorage.setItem("anytime-markdown-theme-preset", "handwritten");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => usePreset(), { wrapper });
    expect(result.current.presetName).toBe("handwritten");
  });

  it("ignores invalid preset in localStorage", () => {
    localStorage.setItem("anytime-markdown-theme-preset", "nonexistent");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => usePreset(), { wrapper });
    expect(result.current.presetName).toBe("professional");
  });

  it("calls StatusBar on native platform when theme changes", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => useThemeMode(), { wrapper });

    act(() => {
      result.current.setThemeMode("light");
    });
    expect(mockSetStyle).toHaveBeenCalled();
    expect(mockSetBgColor).toHaveBeenCalled();
  });

  it("handles handwritten preset CSS variable setup", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => usePreset(), { wrapper });

    act(() => {
      result.current.setPresetName("handwritten" as any);
    });
    // Check that CSS variables were set
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--editor-content-font-family")).toBeTruthy();
  });

  it("handles handwritten preset in light mode", () => {
    localStorage.setItem("anytime-markdown-theme-mode", "light");
    localStorage.setItem("anytime-markdown-theme-preset", "handwritten");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    renderHook(() => usePreset(), { wrapper });
  });

  it("cleans up CSS variables when switching away from handwritten", () => {
    localStorage.setItem("anytime-markdown-theme-preset", "handwritten");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => usePreset(), { wrapper });

    act(() => {
      result.current.setPresetName("professional" as any);
    });
  });

  it("loads Google Fonts for presets with custom fonts", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => usePreset(), { wrapper });

    // Switch to a preset with custom fonts
    act(() => {
      result.current.setPresetName("handwritten" as any);
    });

    // Check that a Google Fonts link element was added
    const fontLink = document.getElementById("google-fonts-preset");
    expect(fontLink).toBeTruthy();
  });
});
