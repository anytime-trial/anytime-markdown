import type { Theme, SxProps } from "@mui/material/styles";
import type { EditorSettings } from "../useEditorSettings";
import { getHeadingStyles } from "./headingStyles";
import { getCodeStyles } from "./codeStyles";
import { getBlockStyles } from "./blockStyles";
import { getInlineStyles } from "./inlineStyles";
import { getBaseStyles } from "./baseStyles";

/**
 * WYSIWYG エディタ Paper の sx スタイルを生成する。
 * MarkdownEditorPage から切り出し（M-09 リファクタリング）。
 */
export function getEditorPaperSx(
  theme: Theme,
  settings: EditorSettings,
  editorHeight: number,
  options?: { readonlyMode?: boolean },
): SxProps<Theme> {
  return {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: "hidden",
    bgcolor: theme.palette.mode === "dark"
      ? (settings.darkBgColor || "#0D1117")
      : (settings.lightBgColor || "#F8F9FA"),
    "& .tiptap": {
      minHeight: editorHeight - 36,
      maxHeight: editorHeight - 4,
      overflowY: "auto",
      py: 2,
      pr: 2,
      pl: 5,
      outline: "none",
      fontFamily: "sans-serif",
      fontSize: `${settings.fontSize}px`,
      lineHeight: settings.lineHeight,
      color: theme.palette.mode === "dark"
        ? (settings.darkTextColor || "#E2E8F0")
        : (settings.lightTextColor || "#2D3748"),
      ...(getBaseStyles(theme, options) as Record<string, unknown>),
      ...(getHeadingStyles(theme) as Record<string, unknown>),
      ...(getCodeStyles(theme) as Record<string, unknown>),
      ...(getBlockStyles(theme, settings) as Record<string, unknown>),
      ...(getInlineStyles(theme) as Record<string, unknown>),
    },
  };
}
