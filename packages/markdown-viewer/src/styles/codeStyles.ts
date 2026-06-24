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
 * hljs トークン色を CSS 変数（`--hljs-*`）の形で返す。テーマ依存色を要素の inline style で受け、
 * {@link getHljsTokenCss} が生成する `var(--hljs-*)` 参照ルールと対で着色する。`getHljsStyles` の
 * CSS 変数版。
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

/**
 * hljs トークンを `var(--hljs-*)` 参照で着色する CSS ルール文字列を返す（{@link getHljsCssVars} が
 * 要素 inline style に供給する変数を消費する対）。`scope` 配下の `.hljs-*` を着色する。
 *
 * vanilla プレビュー（素 DOM で lowlight 出力を描画する CodeBlockEditDialog 等）の
 * シンタックスハイライト着色の single source of truth。CSS Module を持てない素 DOM 経路で
 * 各所がアドホックに hljs ルールを書かないよう、本ヘルパに集約する。
 */
export function getHljsTokenCss(scope: string): string {
  return [
    `${scope} .hljs-keyword,${scope} .hljs-selector-tag,${scope} .hljs-built_in,${scope} .hljs-type{color:var(--hljs-keyword);}`,
    `${scope} .hljs-string,${scope} .hljs-attr,${scope} .hljs-template-tag,${scope} .hljs-template-variable{color:var(--hljs-string);}`,
    `${scope} .hljs-comment,${scope} .hljs-doctag{color:var(--hljs-comment);}`,
    `${scope} .hljs-number,${scope} .hljs-literal,${scope} .hljs-variable,${scope} .hljs-regexp{color:var(--hljs-number);}`,
    `${scope} .hljs-title,${scope} .hljs-title\\.class_,${scope} .hljs-title\\.function_{color:var(--hljs-title);}`,
    `${scope} .hljs-params{color:var(--hljs-params);}`,
    `${scope} .hljs-meta,${scope} .hljs-meta keyword,${scope} .hljs-symbol,${scope} .hljs-bullet{color:var(--hljs-meta);}`,
    `${scope} .hljs-addition{color:var(--hljs-addition);background:var(--hljs-addition-bg);}`,
    `${scope} .hljs-addition::before{content:'+ ';font-weight:700;}`,
    `${scope} .hljs-deletion{color:var(--hljs-deletion);background:var(--hljs-deletion-bg);}`,
    `${scope} .hljs-deletion::before{content:'- ';font-weight:700;}`,
  ].join("\n");
}
