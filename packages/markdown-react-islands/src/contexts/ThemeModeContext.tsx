"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "light" | "dark";

/**
 * chrome のライト/ダークモードを配る context。MUI `useTheme().palette.mode` への依存を
 * 排除するための seam。両ホスト（web-app / 拡張 webview）が themeMode を Provider で配り、
 * chrome コンポーネントは useIsDark / useThemeMode で取得する。既定は light。
 */
const ThemeModeContext = createContext<ThemeMode>("light");

export function ThemeModeProvider({
  mode,
  children,
}: Readonly<{ mode: ThemeMode; children: ReactNode }>) {
  return <ThemeModeContext.Provider value={mode}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeMode {
  return useContext(ThemeModeContext);
}

/** `useThemeMode() === "dark"` のショートハンド。旧 `useTheme().palette.mode === "dark"` の置換。 */
export function useIsDark(): boolean {
  return useThemeMode() === "dark";
}
