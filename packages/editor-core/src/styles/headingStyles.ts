import type { SxProps,Theme } from "@mui/material/styles";

import { DEFAULT_DARK_HEADING_LINK, DEFAULT_LIGHT_HEADING_LINK } from "../constants/colors";

/** ブロックラベル共通スタイル（::before 擬似要素） */
function blockLabel(theme: Theme, right = "calc(100% + 8px)") {
  return {
    position: "absolute",
    right,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "0.6rem",
    fontWeight: 700,
    lineHeight: 1,
    px: 0.5,
    py: 0.25,
    borderRadius: 0.5,
    bgcolor: theme.palette.action.hover,
    color: theme.palette.text.secondary,
    fontFamily: "monospace",
    whiteSpace: "nowrap",
    cursor: "pointer",
    opacity: 0,
    transition: "opacity 0.15s",
  } as const;
}

/** ブロックラベル（top 基準版、Quote/UL/OL 用） */
function blockLabelTop(theme: Theme, right = "calc(100% + 30px)") {
  return {
    ...blockLabel(theme, right),
    top: 2,
    transform: undefined,
    "&:hover": { bgcolor: theme.palette.action.selected },
  } as const;
}

const hoverShow = {
  "&:hover::before, &:focus-within::before": { opacity: 1 },
} as const;

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
      fontSize: "0.75rem",
      color: theme.palette.text.disabled,
      fontWeight: 400,
      fontStyle: "italic",
    },
    "& h1, & h2, & h3, & h4, & h5": {
      position: "relative",
      fontFamily: "monospace",
      letterSpacing: "-0.01em",
      "&::before": blockLabel(theme),
      ...hoverShow,
    },
    "& h1": {
      fontSize: "2em", fontWeight: 700, mt: 2, mb: 1,
      py: 0.5, borderRadius: 1,
      borderLeft: `4px solid ${isDark ? DEFAULT_DARK_HEADING_LINK : DEFAULT_LIGHT_HEADING_LINK}`,
      pl: 1.5,
      background: `linear-gradient(90deg, ${isDark ? "rgba(99,179,237,0.12)" : "rgba(49,130,206,0.08)"}, transparent 70%)`,
      "&::before": { content: "'H1'" },
    },
    "& h2": {
      fontSize: "1.5em", fontWeight: 700, mt: 1.5, mb: 1,
      py: 0.5, borderRadius: 1,
      borderLeft: `3px solid ${isDark ? "rgba(99,179,237,0.6)" : "rgba(49,130,206,0.5)"}`,
      pl: 1.5,
      background: `linear-gradient(90deg, ${isDark ? "rgba(99,179,237,0.08)" : "rgba(49,130,206,0.05)"}, transparent 60%)`,
      "&::before": { content: "'H2'" },
    },
    "& h3": {
      fontSize: "1.25em", fontWeight: 700, mt: 1, mb: 0.5,
      borderLeft: `2px solid ${isDark ? "rgba(99,179,237,0.35)" : "rgba(49,130,206,0.3)"}`,
      pl: 1,
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
