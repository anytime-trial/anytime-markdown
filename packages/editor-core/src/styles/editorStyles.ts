import type { SxProps,Theme } from "@mui/material/styles";

import { getEditorBg, getEditorText } from "../constants/colors";
import type { PaperSize } from "../constants/dimensions";
import { calcPaperContentWidth, EDITOR_PADDING_BORDER,EDITOR_PADDING_TOP } from "../constants/dimensions";
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
  const paperBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
  const outerBg = hasPaper ? paperBg : editorBg;

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
      ...(getBaseStyles(theme, options) as Record<string, unknown>),
      ...(getHeadingStyles(theme) as Record<string, unknown>),
      ...(getCodeStyles(theme) as Record<string, unknown>),
      ...(getBlockStyles(theme, settings) as Record<string, unknown>),
      ...(getInlineStyles(theme) as Record<string, unknown>),
      // blockAlign: 全ブロック要素を統一パターンで配置
      // NodeViewWrapper に text-align を設定し、直下の子要素を inline-block にして幅をコンテンツに合わせる
      ...(settings.blockAlign !== "left" && {
        "& .image-node-wrapper, & .block-node-wrapper": {
          textAlign: settings.blockAlign,
          "& > .MuiBox-root, & > .MuiPaper-root": {
            display: "inline-block",
            textAlign: "left",
          },
        },
      }),
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
