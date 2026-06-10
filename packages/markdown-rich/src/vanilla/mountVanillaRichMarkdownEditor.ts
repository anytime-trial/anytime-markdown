/**
 * rich 注入済みの vanilla markdown editor（React `RichMarkdownEditorPage` の vanilla 対応）。
 *
 * `mountVanillaMarkdownEditor`（markdown-viewer）に rich の codeblock 描画拡張
 * （`CodeBlockWithMermaid` + 共有 `appLowlight`）と codeBlock overlay（vanilla の
 * `installCodeBlockOverlay`）を注入する薄ラッパー。重量モジュール（mermaid/katex/plantuml 等）を
 * 使う描画は本関数経由でのみ読み込まれる。
 *
 * React 版との差分: `prepareDarkDiagrams`（ダークモード PDF 図ライト化）は vanilla orchestrator が
 * PDF export を consumer 委譲（`fileHandlers.onExportPdf`）するため注入対象が無く未配線。
 */

import { appLowlight } from "@anytime-markdown/markdown-viewer";
import {
  mountVanillaMarkdownEditor,
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
} from "@anytime-markdown/markdown-viewer";

import { CodeBlockWithMermaid } from "../codeBlockWithMermaid";
import { installCodeBlockOverlay } from "./installCodeBlockOverlay";

/** rich の codeblock 描画拡張（RichMarkdownEditorPage と同一構成・インスタンス共有）。 */
const richCodeBlockExtension = CodeBlockWithMermaid.configure({
  lowlight: appLowlight,
  defaultLanguage: "plaintext",
});

/** {@link mountVanillaRichMarkdownEditor} のオプション。 */
export interface MountVanillaRichMarkdownEditorOptions
  extends MountVanillaMarkdownEditorOptions {
  /** graph 機能を隠す（jsxgraph/plotly 未バンドル環境向け・React hideGraph 相当）。 */
  hideGraph?: boolean;
}

/**
 * rich codeblock（mermaid/plantuml/math/html/embed）対応の vanilla markdown editor を mount する。
 */
export function mountVanillaRichMarkdownEditor(
  container: HTMLElement,
  options: MountVanillaRichMarkdownEditorOptions,
): VanillaMarkdownEditorHandle {
  // live 値（themeMode / settings）は handle.update で書き換わるため getter で参照する。
  const current: MountVanillaRichMarkdownEditorOptions = { ...options };
  const handle = mountVanillaMarkdownEditor(container, {
    ...options,
    codeBlockExtension: options.codeBlockExtension ?? richCodeBlockExtension,
    codeBlockOverlayInstaller: (editor) =>
      installCodeBlockOverlay(editor, {
        t: options.t,
        getIsDark: () => current.themeMode === "dark",
        getHideGraph: () => current.hideGraph ?? false,
        getStyle: () => ({
          editorBg: current.settings?.editorBg ?? "white",
          fontSize: current.settings?.fontSize ?? 16,
          lineHeight: current.settings?.lineHeight ?? 1.6,
        }),
        confirm: options.confirm,
      }),
  });
  return {
    editor: handle.editor,
    root: handle.root,
    update(patch) {
      Object.assign(current, patch);
      handle.update(patch);
    },
    destroy: () => handle.destroy(),
  };
}
