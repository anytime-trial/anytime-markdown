import type { SxProps,Theme } from "@mui/material/styles";

import {
  DEFAULT_DARK_BG, DEFAULT_DARK_CODE_BG, DEFAULT_LIGHT_BG, DEFAULT_LIGHT_CODE_BG,
  DEFAULT_LIGHT_INLINE_CODE,
  HLJS_DARK, HLJS_LIGHT,
  getActionHover, getGrey,
} from "../constants/colors";

/** シンタックスハイライト（hljs）カラー定義 */
function hljsStyles(h: typeof HLJS_DARK | typeof HLJS_LIGHT) {
  return {
    "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in, & .hljs-type": { color: h.keyword },
    "& .hljs-string, & .hljs-attr, & .hljs-template-tag, & .hljs-template-variable": { color: h.string },
    "& .hljs-comment, & .hljs-doctag": { color: h.comment },
    "& .hljs-number, & .hljs-literal, & .hljs-variable, & .hljs-regexp": { color: h.number },
    "& .hljs-title, & .hljs-title\\.class_, & .hljs-title\\.function_": { color: h.title },
    "& .hljs-params": { color: h.params },
    "& .hljs-meta, & .hljs-meta keyword": { color: h.meta },
    "& .hljs-symbol, & .hljs-bullet": { color: h.meta },
    "& .hljs-addition": { color: h.addition, bgcolor: h.additionBg, "&::before": { content: "'+ '", fontWeight: 700 } },
    "& .hljs-deletion": { color: h.deletion, bgcolor: h.deletionBg, "&::before": { content: "'- '", fontWeight: 700 } },
  } as const;
}

/** シンタックスハイライトスタイルを取得（CodeBlockEditDialog 等から利用可能） */
export function getHljsStyles(isDark: boolean) {
  return hljsStyles(isDark ? HLJS_DARK : HLJS_LIGHT);
}

/** インラインコード・コードブロック・シンタックスハイライトスタイル */
export function getCodeStyles(theme: Theme): SxProps<Theme> {
  const isDark = theme.palette.mode === "dark";
  return {
    "& code": {
      bgcolor: isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG,
      color: isDark ? getGrey(isDark, 300) : DEFAULT_LIGHT_INLINE_CODE,
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
      ...hljsStyles(isDark ? HLJS_DARK : HLJS_LIGHT),
    },
  };
}
