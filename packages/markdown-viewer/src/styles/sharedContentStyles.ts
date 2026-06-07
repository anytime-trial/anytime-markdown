import type { EditorSettings } from "../useEditorSettings";
import { getBaseStyles } from "./baseStyles";
import { getBlockStyles } from "./blockStyles";
import { getCodeStyles } from "./codeStyles";
import { getHeadingStyles } from "./headingStyles";
import { getInlineStyles } from "./inlineStyles";

/**
 * 通常エディタと比較（マージ）ビューで共通の `.tiptap` コンテンツ装飾。
 *
 * baseStyles / headingStyles / codeStyles / blockStyles / inlineStyles を一定順で合成する。
 * `getEditorPaperSx`（通常）と `getMergeTiptapStyles`（比較）の双方から spread して使い、
 * 片方にだけスタイルが追加される drift を防ぐ単一の合成点とする。
 */
export function getSharedContentStyles(
  isDark: boolean,
  settings: EditorSettings,
  options?: { readonlyMode?: boolean },
): Record<string, unknown> {
  return {
    ...(getBaseStyles(isDark, options) as Record<string, unknown>),
    ...(getHeadingStyles(isDark) as Record<string, unknown>),
    ...(getCodeStyles(isDark) as Record<string, unknown>),
    ...(getBlockStyles(isDark, settings) as Record<string, unknown>),
    ...(getInlineStyles(isDark) as Record<string, unknown>),
  };
}
