import type { SxProps,Theme } from "@mui/material/styles";

import {
  DEFAULT_DARK_H1_BORDER, DEFAULT_DARK_H1_GRADIENT, DEFAULT_DARK_H2_BORDER, DEFAULT_DARK_H2_GRADIENT, DEFAULT_DARK_H3_BORDER,
  DEFAULT_DARK_HEADING_LINK,
  DEFAULT_LIGHT_H1_BORDER, DEFAULT_LIGHT_H1_GRADIENT, DEFAULT_LIGHT_H2_BORDER, DEFAULT_LIGHT_H2_GRADIENT, DEFAULT_LIGHT_H3_BORDER,
  DEFAULT_LIGHT_HEADING_LINK,
  getActionHover, getActionSelected, getTextDisabled, getTextSecondary,
} from "../constants/colors";
import { HEADING_ANCHOR_FONT_SIZE, HEADING_BADGE_FONT_SIZE } from "../constants/dimensions";

/** ブロックラベル共通スタイル（::before 擬似要素） */
function blockLabel(theme: Theme, right = "calc(100% + 8px)") {
  const isDark = theme.palette.mode === "dark";
  return {
    position: "absolute",
    right,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: HEADING_BADGE_FONT_SIZE,
    fontWeight: 700,
    lineHeight: 1,
    px: 0.5,
    py: 0.25,
    borderRadius: 0.5,
    bgcolor: getActionHover(isDark),
    color: getTextSecondary(isDark),
    fontFamily: "monospace",
    whiteSpace: "nowrap",
    cursor: "pointer",
    opacity: 0,
    transition: "opacity 0.15s",
  } as const;
}

/** ブロックラベル（top 基準版、Quote/UL/OL 用） */
function blockLabelTop(theme: Theme, right = "calc(100% + 30px)") {
  const isDark = theme.palette.mode === "dark";
  return {
    ...blockLabel(theme, right),
    top: 2,
    transform: undefined,
    "&:hover": { bgcolor: getActionSelected(isDark) },
  } as const;
}

const hoverShow = {
  "&:hover::before, &:focus-within::before": { opacity: 1 },
} as const;

/**
 * 手書き風の不規則な角丸（Handwrittenプリセット用）。
 * CSS変数 --editor-heading-hatch が設定されている場合に適用される。
 */
const HANDWRITTEN_H1_RADIUS = "var(--editor-heading-radius-h1, 8px)";
const HANDWRITTEN_H2_RADIUS = "var(--editor-heading-radius-h2, 8px)";
const HANDWRITTEN_H3_RADIUS = "var(--editor-heading-radius-h3, 0)";

/** 見出し・ブロックラベルスタイル */
export function getHeadingStyles(theme: Theme): SxProps<Theme> {
  const isDark = theme.palette.mode === "dark";
  return {
    "& .heading-number": {
      color: isDark ? DEFAULT_DARK_HEADING_LINK : DEFAULT_LIGHT_HEADING_LINK,
      fontWeight: 400,
      marginRight: "0.25em",
      userSelect: "none" as const,
    },
    "& .heading-folded::after": {
      content: "' ...'",
      fontSize: HEADING_ANCHOR_FONT_SIZE,
      color: getTextDisabled(isDark),
      fontWeight: 400,
      fontStyle: "italic",
    },
    "& h1, & h2, & h3, & h4, & h5": {
      position: "relative",
      fontFamily: "var(--editor-heading-font-family, monospace)",
      letterSpacing: "-0.01em",
      "&::before": blockLabel(theme),
      ...hoverShow,
    },
    "& h1": {
      fontSize: "2em", fontWeight: 700, mt: 2, mb: 1,
      py: 0.5,
      borderRadius: HANDWRITTEN_H1_RADIUS,
      borderLeft: `4px solid var(--editor-heading-border-h1, ${isDark ? DEFAULT_DARK_HEADING_LINK : DEFAULT_LIGHT_HEADING_LINK})`,
      pl: 1.5,
      background: `var(--editor-heading-hatch, linear-gradient(90deg, ${isDark ? DEFAULT_DARK_H1_GRADIENT : DEFAULT_LIGHT_H1_GRADIENT}, transparent 70%))`,
      filter: "var(--editor-heading-filter, none)",
      "&::before": { content: "'H1'" },
    },
    "& h2": {
      fontSize: "1.5em", fontWeight: 700, mt: 1.5, mb: 1,
      py: 0.5,
      borderRadius: HANDWRITTEN_H2_RADIUS,
      borderLeft: `3px solid var(--editor-heading-border-h2, ${isDark ? DEFAULT_DARK_H2_BORDER : DEFAULT_LIGHT_H2_BORDER})`,
      pl: 1.5,
      background: `var(--editor-heading-hatch, linear-gradient(90deg, ${isDark ? DEFAULT_DARK_H2_GRADIENT : DEFAULT_LIGHT_H2_GRADIENT}, transparent 60%))`,
      filter: "var(--editor-heading-filter, none)",
      "&::before": { content: "'H2'" },
    },
    "& h3": {
      fontSize: "1.25em", fontWeight: 700, mt: 1, mb: 0.5,
      borderRadius: HANDWRITTEN_H3_RADIUS,
      borderLeft: `2px solid var(--editor-heading-border-h3, ${isDark ? DEFAULT_DARK_H3_BORDER : DEFAULT_LIGHT_H3_BORDER})`,
      pl: 1,
      background: "var(--editor-heading-hatch, none)",
      filter: "var(--editor-heading-filter, none)",
      "&::before": { content: "'H3'" },
    },
    "& h4": {
      fontSize: "1.1em", fontWeight: 700, mt: 1, mb: 0.5,
      "&::before": { content: "'H4'" },
    },
    "& h5": {
      fontSize: "1em", fontWeight: 700, mt: 0.75, mb: 0.5,
      "&::before": { content: "'H5'" },
    },
    "& > p": {
      position: "relative",
      "&::before": { content: "'P'", ...blockLabel(theme) },
      ...hoverShow,
    },
    "& p": { mb: 1 },
    "& > blockquote > p": {
      position: "relative",
      "&::before": { content: "'Quote'", ...blockLabelTop(theme, "calc(100% + 30px)") },
      ...hoverShow,
    },
    "& li": {
      mb: 0.25,
      position: "relative",
      "&::before": blockLabelTop(theme, "calc(100% + 32px)"),
      ...hoverShow,
    },
    "& > ul:not([data-type='taskList']) > li": {
      "&::before": { content: "'UL'" },
    },
    "& > ol > li": {
      "&::before": { content: "'OL'" },
    },
    "& > ul[data-type='taskList'] > li": {
      "&::before": { content: "'Task'", right: "calc(100% + 8px)" },
    },
  };
}
