import type { SxProps,Theme } from "@mui/material/styles";

import { getEditorBg, getEditorText } from "../constants/colors";
import type { PaperSize } from "../constants/dimensions";
import { calcPaperContentWidth } from "../constants/dimensions";
import { EDITOR_PADDING_BORDER,EDITOR_PADDING_TOP } from "../constants/dimensions";
import type { EditorSettings } from "../useEditorSettings";
import { getBaseStyles } from "./baseStyles";
import { getBlockStyles } from "./blockStyles";
import { getCodeStyles } from "./codeStyles";
import { getHeadingStyles } from "./headingStyles";
import { getInlineStyles } from "./inlineStyles";

/**
 * WYSIWYG エディタ Paper の sx スタイルを生成する。
 * MarkdownEditorPage から切り出し（M-09 リファクタリング）。
 */
export function getEditorPaperSx(
  theme: Theme,
  settings: EditorSettings,
  editorHeight: number,
  options?: { readonlyMode?: boolean; noScroll?: boolean },
): SxProps<Theme> {
  const isDark = theme.palette.mode === "dark";
  const editorBg = getEditorBg(isDark, settings);
  const hasPaper = settings.paperSize !== "off";
  // 用紙サイズ有効時: 外側を少し暗く/明るくして用紙境界を示す
  const outerBg = hasPaper
    ? (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)")
    : editorBg;

  return {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: "hidden",
    bgcolor: outerBg,
    "& .tiptap": {
      position: "relative",
      minHeight: options?.noScroll ? undefined : editorHeight - EDITOR_PADDING_TOP,
      maxHeight: options?.noScroll ? undefined : editorHeight - EDITOR_PADDING_BORDER,
      overflowY: options?.noScroll ? "visible" : "auto",
      scrollbarWidth: "thin",
      scrollbarColor: isDark ? "rgba(255,255,255,0.45) transparent" : "rgba(0,0,0,0.4) transparent",
      "&::-webkit-scrollbar": { width: 6 },
      "&::-webkit-scrollbar-track": { background: "transparent" },
      "&::-webkit-scrollbar-thumb": {
        background: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)",
        borderRadius: 3,
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
      },
      py: 2,
      pr: 2,
      pl: 5,
      outline: "none",
      fontFamily: "sans-serif",
      fontSize: `${settings.fontSize}px`,
      lineHeight: settings.lineHeight,
      color: getEditorText(theme.palette.mode === "dark", settings),
      ...(settings.blockAlign !== "left" && {
        // テキスト・インライン要素（img 等）の配置
        textAlign: settings.blockAlign,
        // ブロック要素の配置（display: block なので margin で制御）
        "& blockquote, & blockquote[data-admonition-type], & .code-block-wrapper, & [data-type='gifBlock']": {
          ...(settings.blockAlign === "center"
            ? { marginLeft: "auto", marginRight: "auto", maxWidth: "90%" }
            : { marginLeft: "auto", marginRight: 0, maxWidth: "90%" }),
        },
        "& .tableWrapper": {
          display: "flex",
          justifyContent: settings.blockAlign === "center" ? "center" : "flex-end",
        },
        "& hr": {
          ...(settings.blockAlign === "center"
            ? { marginLeft: "auto", marginRight: "auto", width: "80%" }
            : { marginLeft: "auto", marginRight: 0, width: "80%" }),
        },
      }),
      ...(getBaseStyles(theme, options) as Record<string, unknown>),
      ...(getHeadingStyles(theme) as Record<string, unknown>),
      ...(getCodeStyles(theme) as Record<string, unknown>),
      ...(getBlockStyles(theme, settings) as Record<string, unknown>),
      ...(getInlineStyles(theme) as Record<string, unknown>),
      // 用紙サイズ制限
      ...(hasPaper && {
        maxWidth: calcPaperContentWidth(settings.paperSize as Exclude<PaperSize, "off">, settings.paperMargin),
        mx: "auto",
        bgcolor: editorBg,
        wordBreak: "break-word",
        overflowWrap: "break-word",
      }),
    },
  };
}
