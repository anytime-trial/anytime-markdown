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

// editor-core の ConfirmProvider をモック（next-intl ESM 依存チェーンを回避）
jest.mock("@anytime-markdown/editor-core", () => ({
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
