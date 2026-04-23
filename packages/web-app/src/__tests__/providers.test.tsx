import { renderHook, act } from "@testing-library/react";
import React from "react";

// Capacitor / StatusBar をモック
jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));
jest.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: jest.fn(), setBackgroundColor: jest.fn() },
  Style: { Light: "LIGHT", Dark: "DARK" },
}));

// markdown-core の ConfirmProvider をモック（next-intl ESM 依存チェーンを回避）
jest.mock("@anytime-markdown/markdown-core", () => ({
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => children,
  ACCENT_COLOR: "#e8a012",
  DEFAULT_DARK_BG: "#0D1117",
  DEFAULT_LIGHT_BG: "#F8F9FA",
  DEFAULT_PRESET_NAME: "professional",
  getPreset: () => ({
    label: "Professional",
    fontFamily: '"Roboto", sans-serif',
    displayFont: '"Playfair Display", serif',
    borderRadius: { sm: 4, md: 8, lg: 12 },
    easing: { enter: "ease-in", standard: "ease", exit: "ease-out" },
  }),
  isPresetName: () => true,
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
}));

import { Providers, useThemeMode } from "../app/providers";

const THEME_STORAGE_KEY = "anytime-markdown-theme-mode";

describe("useThemeMode (via Providers)", () => {
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

  test("デフォルトは dark", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => useThemeMode(), { wrapper });
    expect(result.current.themeMode).toBe("dark");
  });

  test("localStorage に保存された値を復元する", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => useThemeMode(), { wrapper });
    expect(result.current.themeMode).toBe("light");
  });

  test("setThemeMode で切替し localStorage に永続化する", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => useThemeMode(), { wrapper });

    act(() => {
      result.current.setThemeMode("light");
    });

    expect(result.current.themeMode).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  test("localStorage に不正値がある場合は dark にフォールバック", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "invalid");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(() => useThemeMode(), { wrapper });
    expect(result.current.themeMode).toBe("dark");
  });
});
