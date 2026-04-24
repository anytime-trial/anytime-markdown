import type { SxProps,Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

import {
  ADMONITION_CAUTION, ADMONITION_IMPORTANT, ADMONITION_NOTE, ADMONITION_TIP, ADMONITION_WARNING,
  DEFAULT_DARK_TABLE_CELL_BG, DEFAULT_DARK_TABLE_HEADER_BG, DEFAULT_LIGHT_TABLE_CELL_BG, DEFAULT_LIGHT_TABLE_HEADER_BG,
  getActionSelected, getDivider, getPrimaryMain, getTextPrimary, getTextSecondary,
} from "../constants/colors";
import { BLOCK_STYLE_FONT_SIZE } from "../constants/dimensions";
import type { EditorSettings } from "../useEditorSettings";

/** blockquote・admonition・table・list・taskList・hr・img スタイル */
export function getBlockStyles(theme: Theme, settings: EditorSettings): SxProps<Theme> {
  const isDark = theme.palette.mode === "dark";
  return {
    "& ul, & ol": { pl: 3, mb: 1 },
    "@media (max-width: 900px)": {
      "& ul ul, & ul ol, & ol ul, & ol ol": { pl: 1.5 },
    },
    "& blockquote": {
      borderLeft: `3px solid ${getDivider(isDark)}`,
      pl: 2,
      ml: 0,
      my: 1,
      color: getTextSecondary(isDark),
    },
    "& blockquote[data-admonition-type]": {
      borderLeftWidth: 4,
      pl: 2,
      pt: 4,
      pb: 1,
      my: 1.5,
      borderRadius: "var(--editor-admonition-radius, 8px)",
      color: getTextPrimary(isDark),
      position: "relative",
      filter: "var(--editor-heading-filter, none)",
      "&::before": {
        position: "absolute",
        top: 8,
        left: 16,
        fontSize: BLOCK_STYLE_FONT_SIZE,
        fontWeight: 700,
        lineHeight: 1,
      },
    },
    "& blockquote[data-admonition-type='note']": {
      borderLeftColor: ADMONITION_NOTE,
      background: `var(--editor-admonition-bg-note, ${alpha(ADMONITION_NOTE, 0.06)})`,
      "&::before": { content: String.raw`"\24D8  Note"`, color: ADMONITION_NOTE },
    },
    "& blockquote[data-admonition-type='tip']": {
      borderLeftColor: ADMONITION_TIP,
      background: `var(--editor-admonition-bg-tip, ${alpha(ADMONITION_TIP, 0.06)})`,
      "&::before": { content: String.raw`"\2618  Tip"`, color: ADMONITION_TIP },
    },
    "& blockquote[data-admonition-type='important']": {
      borderLeftColor: ADMONITION_IMPORTANT,
      background: `var(--editor-admonition-bg-important, ${alpha(ADMONITION_IMPORTANT, 0.06)})`,
      "&::before": { content: String.raw`"\2709  Important"`, color: ADMONITION_IMPORTANT },
    },
    "& blockquote[data-admonition-type='warning']": {
      borderLeftColor: ADMONITION_WARNING,
      background: `var(--editor-admonition-bg-warning, ${alpha(ADMONITION_WARNING, 0.06)})`,
      "&::before": { content: String.raw`"\26A0  Warning"`, color: ADMONITION_WARNING },
    },
    "& blockquote[data-admonition-type='caution']": {
      borderLeftColor: ADMONITION_CAUTION,
      background: `var(--editor-admonition-bg-caution, ${alpha(ADMONITION_CAUTION, 0.06)})`,
      "&::before": { content: String.raw`"\2299  Caution"`, color: ADMONITION_CAUTION },
    },
    "& table": {
      borderCollapse: "collapse",
      width: settings.tableWidth,
      "& th, & td": {
        border: `1px solid ${getDivider(isDark)}`,
        px: 1,
        py: 0,
        textAlign: "left",
        minWidth: 80,
        fontSize: "inherit",
        lineHeight: 1.2,
        bgcolor: isDark ? DEFAULT_DARK_TABLE_CELL_BG : DEFAULT_LIGHT_TABLE_CELL_BG,
      },
      "& th": {
        bgcolor: isDark ? DEFAULT_DARK_TABLE_HEADER_BG : DEFAULT_LIGHT_TABLE_HEADER_BG,
        fontWeight: 600,
      },
      "& .selectedCell": {
        bgcolor: getActionSelected(isDark),
      },
      "& .cell-nav-selected": settings.tableWidth === "auto" ? {} : {
        outline: `2px solid ${getPrimaryMain(isDark)}`,
        outlineOffset: "-2px",
        caretColor: "transparent",
        position: "relative",
      },
      "& .cell-editing": settings.tableWidth === "auto" ? {} : {
        outline: `1px solid ${getPrimaryMain(isDark)}`,
        outlineOffset: "-1px",
        bgcolor: alpha(getPrimaryMain(isDark), isDark ? 0.08 : 0.04),
      },
      "& .cell-range-selected": {
        bgcolor: getActionSelected(isDark),
      },
    },
    "& img": {
      maxWidth: "100%",
      height: "auto",
      borderRadius: 1,
      my: 1,
    },
    "& ul[data-type='taskList']": {
      listStyle: "none",
      pl: 0,
      "& li": {
        display: "flex",
        alignItems: "center",
        gap: 1,
        mb: 0.25,
        "& label": {
          display: "flex",
          alignItems: "center",
          "& input[type='checkbox']": {
            width: settings.fontSize - 2,
            height: settings.fontSize - 2,
            cursor: "pointer",
            accentColor: getPrimaryMain(isDark),
          },
        },
        "& > div": {
          flex: 1,
          "& p": { my: 1 },
        },
      },
    },
    "& hr": {
      border: "none",
      borderTop: `1px solid ${getDivider(isDark)}`,
      my: 2,
    },
    "& hr.ProseMirror-selectednode": {
      borderLeft: `1.5px solid ${getTextPrimary(isDark)}`,
      py: "0.5em",
      animation: "blink-caret 1s step-end infinite",
      "@keyframes blink-caret": {
        "0%, 100%": { borderLeftColor: getTextPrimary(isDark) },
        "50%": { borderLeftColor: "transparent" },
      },
    },
    /* ProseMirror GapCursor — ブロック要素の前後に縦線カーソルを表示 */
    "& .ProseMirror-gapcursor": {
      display: "none !important",
      pointerEvents: "none",
      position: "relative",
    },
    "& .ProseMirror-gapcursor::after": {
      content: '""',
      display: "block",
      position: "absolute",
      top: 0,
      left: 0,
      width: "2px",
      height: "100%",
      borderTop: "none",
      backgroundColor: getPrimaryMain(isDark),
      animation: "blink-gap-cursor 1s step-end infinite",
    },
    "&.ProseMirror-focused .ProseMirror-gapcursor": {
      display: "block !important",
    },
    "@keyframes blink-gap-cursor": {
      "0%, 100%": { opacity: 1 },
      "50%": { opacity: 0 },
    },
    // imageRow: React NodeView を使わず renderHTML 直出力。
    // DOM: [data-image-row] > .react-renderer.node-image+
    // 画像は横並びに詰め、空きがあるときは折り返し。flex を使う。
    "& [data-image-row]": {
      display: "flex !important" as unknown as string,
      flexWrap: "wrap",
      gap: "8px",
      alignItems: "flex-start",
      my: 1,
    },
    "& [data-image-row] > *": {
      minWidth: "0 !important" as unknown as string,
      maxWidth: "100%",
      overflow: "hidden",
    },
    "& [data-image-row] .image-node-wrapper": {
      marginTop: "0 !important",
      marginBottom: "0 !important",
      minWidth: "0 !important" as unknown as string,
    },
    "& [data-image-row] img": {
      maxWidth: "100%",
      height: "auto",
    },
    "& [data-image-row] .image-node-wrapper > .MuiBox-root": {
      marginTop: "0 !important",
      marginBottom: "0 !important",
    },
    // 単独画像ブロック（imageRow 外）は画像サイズに合わせて幅を縮める
    "& .image-node-wrapper[data-inside-image-row='false']": {
      width: "fit-content",
      maxWidth: "100%",
    },
    "& .image-row[data-selected='true'], & [data-image-row][data-selected='true']": {
      outline: `2px solid ${getPrimaryMain(isDark)}`,
      outlineOffset: "2px",
      borderRadius: "4px",
    },
    "& .image-row-drop-cursor-vertical": {
      position: "absolute",
      width: "2px",
      backgroundColor: getPrimaryMain(isDark),
      pointerEvents: "none",
      zIndex: 10,
    },
  };
}
