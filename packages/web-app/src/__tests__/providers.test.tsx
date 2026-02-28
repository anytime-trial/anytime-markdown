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
}));

import { Providers, useThemeMode } from "../app/providers";

const THEME_STORAGE_KEY = "anytime-markdown-theme-mode";

describe("useThemeMode (via Providers)", () => {
  beforeEach(() => {
    localStorage.clear();
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
