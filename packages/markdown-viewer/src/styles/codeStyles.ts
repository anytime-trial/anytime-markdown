import { HLJS_DARK, HLJS_LIGHT } from "../constants/colors";

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

/**
 * hljs トークン色を CSS 変数（`--hljs-*`）の形で返す。CSS Module 側で `.x :global(.hljs-*)`
 * を CSS 変数参照にして、テーマ依存色を inline style で受けるための対。`getHljsStyles` の
 * CSS-Module 版。
 */
export function getHljsCssVars(isDark: boolean): Record<string, string> {
  const h = isDark ? HLJS_DARK : HLJS_LIGHT;
  return {
    "--hljs-keyword": h.keyword,
    "--hljs-string": h.string,
    "--hljs-comment": h.comment,
    "--hljs-number": h.number,
    "--hljs-title": h.title,
    "--hljs-params": h.params,
    "--hljs-meta": h.meta,
    "--hljs-addition": h.addition,
    "--hljs-addition-bg": h.additionBg,
    "--hljs-deletion": h.deletion,
    "--hljs-deletion-bg": h.deletionBg,
  };
}
