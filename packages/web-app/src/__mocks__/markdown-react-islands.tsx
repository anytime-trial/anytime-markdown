/**
 * @anytime-markdown/markdown-react-islands の共有 jest モック。
 *
 * islands バレルは VanillaMarkdownEditorMount 経由でエディタ本体（lowlight ESM 等）を
 * 静的に引き込むため、provider 利用のみのテストでは本モックで遮断する。
 * 使い方: `jest.mock("@anytime-markdown/markdown-react-islands", () => require("../__mocks__/markdown-react-islands"));`
 */
import type { ReactNode } from "react";

const passthrough = ({ children }: { children: ReactNode }) => children;

export const ConfirmProvider = passthrough;
export const ThemeModeProvider = passthrough;
export const MarkdownCoreI18nProvider = passthrough;
export const VanillaMarkdownEditorMount = (): null => null;
export const FullPageLoader = (): null => null;
export const installPreviewIslands = jest.fn();
