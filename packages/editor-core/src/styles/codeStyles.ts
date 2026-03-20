import type { SxProps,Theme } from "@mui/material/styles";

import { DEFAULT_DARK_BG, DEFAULT_DARK_CODE_BG, DEFAULT_LIGHT_BG, DEFAULT_LIGHT_CODE_BG, getActionHover, getGrey } from "../constants/colors";

/** シンタックスハイライト（hljs）カラー定義 */
const hljsDark = {
  "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in, & .hljs-type": { color: "#ff7b72" },
  "& .hljs-string, & .hljs-attr, & .hljs-template-tag, & .hljs-template-variable": { color: "#a5d6ff" },
  "& .hljs-comment, & .hljs-doctag": { color: "#8b949e" },
  "& .hljs-number, & .hljs-literal, & .hljs-variable, & .hljs-regexp": { color: "#79c0ff" },
  "& .hljs-title, & .hljs-title\\.class_, & .hljs-title\\.function_": { color: "#d2a8ff" },
  "& .hljs-params": { color: "#c9d1d9" },
  "& .hljs-meta, & .hljs-meta keyword": { color: "#ffa657" },
  "& .hljs-symbol, & .hljs-bullet": { color: "#ffa657" },
  "& .hljs-addition": { color: "#aff5b4", bgcolor: "rgba(46,160,67,0.15)", "&::before": { content: "'+ '", fontWeight: 700 } },
  "& .hljs-deletion": { color: "#ffdcd7", bgcolor: "rgba(248,81,73,0.15)", "&::before": { content: "'- '", fontWeight: 700 } },
} as const;

const hljsLight = {
  "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in, & .hljs-type": { color: "#cf222e" },
  "& .hljs-string, & .hljs-attr, & .hljs-template-tag, & .hljs-template-variable": { color: "#0a3069" },
  "& .hljs-comment, & .hljs-doctag": { color: "#6e7781" },
  "& .hljs-number, & .hljs-literal, & .hljs-variable, & .hljs-regexp": { color: "#0550ae" },
  "& .hljs-title, & .hljs-title\\.class_, & .hljs-title\\.function_": { color: "#8250df" },
  "& .hljs-params": { color: "#24292f" },
  "& .hljs-meta, & .hljs-meta keyword": { color: "#953800" },
  "& .hljs-symbol, & .hljs-bullet": { color: "#953800" },
  "& .hljs-addition": { color: "#116329", bgcolor: "rgba(46,160,67,0.15)", "&::before": { content: "'+ '", fontWeight: 700 } },
  "& .hljs-deletion": { color: "#82071e", bgcolor: "rgba(248,81,73,0.15)", "&::before": { content: "'- '", fontWeight: 700 } },
} as const;

/** インラインコード・コードブロック・シンタックスハイライトスタイル */
export function getCodeStyles(theme: Theme): SxProps<Theme> {
  const isDark = theme.palette.mode === "dark";
  return {
    "& code": {
      bgcolor: isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG,
      color: isDark ? getGrey(isDark, 300) : "#c62828",
      px: 0.5,
      py: 0.25,
      borderRadius: 0.5,
      fontFamily: "monospace",
      fontSize: "0.875em",
    },
    "& pre": {
      bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      border: 1,
      borderColor: isDark ? getActionHover(isDark) : "transparent",
      borderRadius: 1,
      p: 2,
      my: 1,
      overflow: "auto",
      "& code": { bgcolor: "transparent", color: isDark ? getGrey(isDark, 300) : "inherit", p: 0, borderRadius: 0 },
      ...(isDark ? hljsDark : hljsLight),
    },
  };
}
