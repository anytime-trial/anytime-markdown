"use client";

/**
 * markdown-react-islands — markdown エディタの意図的 React island。
 *
 * markdown-viewer / markdown-rich 本体は React-free（vanilla）であり、React に依存する
 * 部分（エディタ mount の React ラッパ・provider 群・embed / graph プレビュー）だけを
 * 本パッケージへ隔離している。consumer（web-app / vscode webview）はここから import する。
 */

// エディタ mount の React ラッパ（mount 前に PreviewIslands を自動登録する）
export {
  VanillaMarkdownEditorMount,
  type VanillaMarkdownEditorMountProps,
} from "./VanillaMarkdownEditorMount";

// React provider 群（consumer の App shell が使用）
export { ConfirmContext, ConfirmProvider } from "./providers/ConfirmProvider";
export type { ThemeMode } from "./contexts/ThemeModeContext";
export { ThemeModeProvider, useIsDark, useThemeMode } from "./contexts/ThemeModeContext";
export {
  EmbedProvidersProvider,
  useOptionalEmbedProviders,
} from "./contexts/EmbedProvidersContext";
export { MarkdownCoreI18nProvider, useMarkdownLocale, useMarkdownT } from "./i18n/context";

// ローディング画面（web-app の loading.tsx が使用）
export { default as FullPageLoader } from "./components/loader/FullPageLoader";

// embed / graph プレビュー island の手動登録（orchestrator 直接 mount の consumer 用）
export { installPreviewIslands } from "./installPreviewIslands";
