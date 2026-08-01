"use client";

/**
 * markdown-react-islands — markdown エディタの意図的 React island。
 *
 * markdown-viewer / markdown-rich 本体は React-free（vanilla）であり、React に依存する
 * 部分（エディタ mount の React ラッパ・provider 群・ローダー）だけを本パッケージへ隔離する。
 * 目的は再利用ではなく隔離。consumer は増減するのでここに列挙しない
 * （`grep -rn '@anytime-markdown/markdown-react-islands' packages` で調べる）。
 */

// エディタ mount の React ラッパ
export {
  VanillaMarkdownEditorMount,
  type VanillaMarkdownEditorMountProps,
} from "./VanillaMarkdownEditorMount";

// React provider 群（consumer の App shell が使用）
export { ConfirmContext, ConfirmProvider } from "./providers/ConfirmProvider";
export type { ThemeMode } from "./contexts/ThemeModeContext";
export { ThemeModeProvider, useIsDark, useThemeMode } from "./contexts/ThemeModeContext";
export { MarkdownCoreI18nProvider, useMarkdownLocale, useMarkdownT } from "./i18n/context";

// ローディング画面（web-app の loading.tsx が使用）
export { default as FullPageLoader } from "./components/loader/FullPageLoader";
