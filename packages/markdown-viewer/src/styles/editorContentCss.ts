import {
  ACCENT_COLOR,
  ADMONITION_CAUTION, ADMONITION_IMPORTANT, ADMONITION_NOTE, ADMONITION_TIP, ADMONITION_WARNING,
  alpha,
  COMMON_WHITE,
  DEFAULT_DARK_BG, DEFAULT_DARK_CODE_BG, DEFAULT_DARK_H1_GRADIENT, DEFAULT_DARK_H2_BORDER,
  DEFAULT_DARK_H2_GRADIENT, DEFAULT_DARK_H3_BORDER, DEFAULT_DARK_HEADING_LINK,
  DEFAULT_DARK_TABLE_CELL_BG, DEFAULT_DARK_TABLE_HEADER_BG,
  DEFAULT_LIGHT_BG, DEFAULT_LIGHT_CODE_BG, DEFAULT_LIGHT_H1_GRADIENT, DEFAULT_LIGHT_H2_BORDER,
  DEFAULT_LIGHT_H2_GRADIENT, DEFAULT_LIGHT_H3_BORDER, DEFAULT_LIGHT_HEADING_LINK,
  DEFAULT_LIGHT_INLINE_CODE, DEFAULT_LIGHT_TABLE_CELL_BG, DEFAULT_LIGHT_TABLE_HEADER_BG,
  getActionHover, getActionSelected, getDivider, getEditorBg, getEditorText, getGrey,
  getPrimaryMain, getTextDisabled, getTextPrimary, getTextSecondary, getWarningLight, getWarningMain,
  HLJS_DARK, HLJS_LIGHT,
} from "../constants/colors";
import {
  BLOCK_STYLE_FONT_SIZE,
  HEADING_ANCHOR_FONT_SIZE,
  HEADING_BADGE_FONT_SIZE,
  TOOLTIP_FONT_SIZE,
} from "../constants/dimensions";
import { Z_LINK_TOOLTIP } from "../constants/zIndex";

/**
 * vanilla エディタの `.tiptap` コンテンツ装飾 CSS（旧 React GlobalStyle 注入の置換）。
 *
 * 旧 `getEditorPaperSx`（styles/editorStyles + base/heading/code/block/inline/imageRow の合成）を
 * 素の CSS 文字列へ移植したもの。G4（React 排除）で旧注入経路（EditorContentArea + ui/GlobalStyle）が
 * 削除された際に vanilla 経路へ未移植だったため、見出し・hover ラベル等の装飾が消失した回帰の修正。
 *
 * 設計:
 * - すべてのルールを `[data-am-editor-root]`（host/vanillaMarkdownEditor の buildLayout root）配下に
 *   スコープし、グローバル汚染を避ける。
 * - 設定依存値（fontSize / lineHeight / wordBreak / tableWidth / 背景色 / 文字色 / 用紙幅）は
 *   `applyEditorSettings` が root へ設定する CSS 変数（`--am-editor-*`）と data 属性で受ける。
 *   設定変更時に CSS の再構築は不要。
 * - テーマ（ダーク/ライト）依存色は isDark 引数で文字列へ直接埋め込み、テーマ変更時に
 *   {@link injectEditorContentCss} で `<style>` の内容を差し替える。
 * - プリセット依存値（handwritten の角丸・ハッチング等）は旧実装と同じく `--editor-*` 変数
 *   （utils/applyEditorThemeCssVars がホスト側で設定）への参照のままとする。
 */

const SCOPE = "[data-am-editor-root]";

/** hover ブロックラベルを持つ `.tiptap` 配下のセレクタ（readonly 時の一括非表示と対）。 */
const HOVER_LABEL_TARGETS = [
  "h1", "h2", "h3", "h4", "h5",
  "> p", "> blockquote > p", "li",
] as const;

/** `.tiptap` の readonly / review 状態セレクタ。 */
const READONLY_STATES = [
  '[contenteditable="false"]',
  '[data-review-mode="true"]',
  '[data-readonly-mode="true"]',
] as const;

function tiptap(selector: string): string {
  return `${SCOPE} .tiptap ${selector}`;
}

/** 状態 × ターゲットの直積セレクタリストを生成する（hover ラベル等の一括制御用）。 */
function readonlyMatrix(suffix: string): string {
  return READONLY_STATES.flatMap((state) =>
    HOVER_LABEL_TARGETS.map((target) => `${SCOPE} .tiptap${state} ${target}${suffix}`),
  ).join(",\n");
}

function hljsTokenCss(h: typeof HLJS_DARK | typeof HLJS_LIGHT): string {
  const pre = (sel: string): string =>
    sel.split(", ").map((s) => tiptap(`pre ${s}`)).join(", ");
  return `
${pre(".hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-type")} { color: ${h.keyword}; }
${pre(".hljs-string, .hljs-attr, .hljs-template-tag, .hljs-template-variable")} { color: ${h.string}; }
${pre(".hljs-comment, .hljs-doctag")} { color: ${h.comment}; }
${pre(".hljs-number, .hljs-literal, .hljs-variable, .hljs-regexp")} { color: ${h.number}; }
${pre(".hljs-title, .hljs-title\\.class_, .hljs-title\\.function_")} { color: ${h.title}; }
${pre(".hljs-params")} { color: ${h.params}; }
${pre(".hljs-meta, .hljs-meta keyword, .hljs-symbol, .hljs-bullet")} { color: ${h.meta}; }
${pre(".hljs-addition")} { color: ${h.addition}; background-color: ${h.additionBg}; }
${pre(".hljs-addition")}::before { content: '+ '; font-weight: 700; }
${pre(".hljs-deletion")} { color: ${h.deletion}; background-color: ${h.deletionBg}; }
${pre(".hljs-deletion")}::before { content: '- '; font-weight: 700; }
`;
}

/**
 * admonition のラベルアイコン（Material Symbols 由来の単色 SVG）を CSS mask 用 data URI へ。
 * 仕様8章「絵文字は使用しない」に従い、Unicode 絵文字様記号を SVG アイコンへ置換する。
 * fill は mask のアルファのみ利用するため任意。`background-color` でテーマ色に着色する。
 */
function admonitionIcon(path: string): string {
  const svg =
    `%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E` +
    `%3Cpath d='${path}'/%3E%3C/svg%3E`;
  return `url("data:image/svg+xml,${svg}") no-repeat center / contain`;
}

/** admonition 種別ごとのアイコンパス（24x24 viewBox）。 */
const ADMONITION_ICON_PATHS: Record<string, string> = {
  // info（ⓘ の置換）
  note: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8",
  // lightbulb（☘ の置換）
  tip: "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7",
  // priority_high（✉ の置換 — 感嘆符）
  important: "M14 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0M14 5v8a2 2 0 1 1-4 0V5a2 2 0 1 1 4 0",
  // warning triangle
  warning: "M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z",
  // block（⊙ の置換 — 進入禁止）
  caution: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2M4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.9 7.9 0 0 1 4 12m8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.9 7.9 0 0 1 20 12c0 4.42-3.58 8-8 8",
};

/** admonition 1 種ぶんの CSS（border 色 + 背景 + アイコン + ラベル）。 */
function admonitionCss(type: string, color: string, label: string): string {
  const sel = tiptap(`blockquote[data-admonition-type='${type}']`);
  const icon = admonitionIcon(ADMONITION_ICON_PATHS[type]);
  return `
${sel} { border-left-color: ${color}; background: var(--editor-admonition-bg-${type}, ${alpha(color, 0.06)}); }
${sel}::before { background-color: ${color}; -webkit-mask: ${icon}; mask: ${icon}; }
${sel}::after { content: "${label}"; color: ${color}; }
`;
}

/**
 * `.tiptap` コンテンツ装飾 CSS を生成する（純粋関数）。
 */
export function buildEditorContentCss(isDark: boolean): string {
  const headingLink = isDark ? DEFAULT_DARK_HEADING_LINK : DEFAULT_LIGHT_HEADING_LINK;
  const h1Gradient = isDark ? DEFAULT_DARK_H1_GRADIENT : DEFAULT_LIGHT_H1_GRADIENT;
  const h2Gradient = isDark ? DEFAULT_DARK_H2_GRADIENT : DEFAULT_LIGHT_H2_GRADIENT;
  const h2Border = isDark ? DEFAULT_DARK_H2_BORDER : DEFAULT_LIGHT_H2_BORDER;
  const h3Border = isDark ? DEFAULT_DARK_H3_BORDER : DEFAULT_LIGHT_H3_BORDER;
  const actionHover = getActionHover(isDark);
  const actionSelected = getActionSelected(isDark);
  const divider = getDivider(isDark);
  const textPrimary = getTextPrimary(isDark);
  const textSecondary = getTextSecondary(isDark);
  const textDisabled = getTextDisabled(isDark);
  const primaryMain = getPrimaryMain(isDark);
  // スクロールバー: 仕様6章。ダーク=アンバーレール / ライト=墨線（border-radius 0）。
  const scrollThumb = isDark ? alpha(ACCENT_COLOR, 0.5) : "rgba(31,30,28,0.40)";
  const scrollThumbHover = isDark ? alpha(ACCENT_COLOR, 0.8) : "rgba(31,30,28,0.60)";
  const scrollThumbActive = isDark ? ACCENT_COLOR : "rgba(31,30,28,0.80)";
  const scrollRadius = isDark ? "2px" : "0";

  const hoverShowSelectors = HOVER_LABEL_TARGETS.flatMap((target) => [
    `${SCOPE} .tiptap ${target}:hover::before`,
    `${SCOPE} .tiptap ${target}:focus-within::before`,
  ]).join(",\n");

  return `
/* === 基本（旧 editorStyles.getEditorPaperSx） =================================== */
${SCOPE} [data-am-content] {
  background: var(--am-editor-outer-bg, ${getEditorBg(isDark)});
}
/* スクロールバー（仕様6章）: 外側コンテナ [data-am-content] と .tiptap 配下の全スクロール容器
   （コードブロック pre・図/数式プレビュー・テーブル等）で幅 4px に統一し、箇所により不揃いに
   しない。.tiptap 外の意図的非表示（MergeEditor 等）には影響させない。 */
${SCOPE} [data-am-content],
${SCOPE} .tiptap * {
  scrollbar-width: thin;
  scrollbar-color: ${scrollThumb} transparent;
}
${SCOPE} [data-am-content]::-webkit-scrollbar,
${SCOPE} .tiptap *::-webkit-scrollbar { width: 4px; height: 4px; }
${SCOPE} [data-am-content]::-webkit-scrollbar-track,
${SCOPE} .tiptap *::-webkit-scrollbar-track { background: transparent; }
${SCOPE} [data-am-content]::-webkit-scrollbar-thumb,
${SCOPE} .tiptap *::-webkit-scrollbar-thumb { background: ${scrollThumb}; border-radius: ${scrollRadius}; }
${SCOPE} [data-am-content]::-webkit-scrollbar-thumb:hover,
${SCOPE} .tiptap *::-webkit-scrollbar-thumb:hover { background: ${scrollThumbHover};${isDark ? " box-shadow: 0 0 6px rgba(232,160,18,0.35);" : ""} }
${SCOPE} [data-am-content]::-webkit-scrollbar-thumb:active,
${SCOPE} .tiptap *::-webkit-scrollbar-thumb:active { background: ${scrollThumbActive}; }
${SCOPE} .tiptap {
  position: relative;
  max-width: var(--am-editor-measure, 46em);
  margin-left: auto;
  margin-right: auto;
  padding: 24px clamp(16px, 4vw, 48px);
  outline: none;
  font-family: var(--editor-content-font-family, sans-serif);
  font-size: var(--am-editor-font-size, 16px);
  line-height: var(--am-editor-line-height, 1.7);
  color: var(--am-editor-text, ${getEditorText(isDark)});
  -webkit-font-smoothing: ${isDark ? "antialiased" : "auto"};
  -moz-osx-font-smoothing: ${isDark ? "grayscale" : "auto"};
  word-break: var(--am-editor-word-break, normal);
  overflow-wrap: break-word;
}
${SCOPE} .tiptap:focus-visible { outline: none; }
@media print {
  ${SCOPE} .tiptap { background-image: none !important; }
}

/* 用紙サイズ有効時: 本文を用紙幅に制限し中央寄せ（外側は --am-editor-outer-bg で暗く/明るく） */
${SCOPE}[data-paper-size]:not([data-paper-size="off"]) .tiptap {
  max-width: var(--am-paper-max-width, 760px);
  margin-left: auto;
  margin-right: auto;
  background: var(--am-editor-bg, ${getEditorBg(isDark)});
}

/* blockAlign: ブロック要素の中央/右寄せ（wrapper に text-align、直下子を inline-block 化） */
${SCOPE}[data-block-align="center"] .tiptap .image-node-wrapper,
${SCOPE}[data-block-align="center"] .tiptap .block-node-wrapper { text-align: center; }
${SCOPE}[data-block-align="right"] .tiptap .image-node-wrapper,
${SCOPE}[data-block-align="right"] .tiptap .block-node-wrapper { text-align: right; }
${SCOPE}[data-block-align="center"] .tiptap .image-node-wrapper > *,
${SCOPE}[data-block-align="center"] .tiptap .block-node-wrapper > *,
${SCOPE}[data-block-align="right"] .tiptap .image-node-wrapper > *,
${SCOPE}[data-block-align="right"] .tiptap .block-node-wrapper > * {
  display: inline-block;
  text-align: left;
}

/* === readonly / review / placeholder（旧 baseStyles） ============================ */
${readonlyMatrix("::before")} { display: none !important; }
${READONLY_STATES.map((s) => `${SCOPE} .tiptap${s} [data-block-toolbar]`).join(", ")} { display: none !important; }
${READONLY_STATES.map((s) => `${SCOPE} .tiptap${s} [data-resize-handle]`).join(", ")} { display: none !important; }
${SCOPE} .tiptap[contenteditable="false"] input[type="checkbox"] {
  pointer-events: none;
  opacity: 0.7;
}
${SCOPE} .tiptap p.is-editor-empty:first-of-type::before {
  content: attr(data-placeholder);
  color: ${textDisabled};
  float: left;
  height: 0;
  pointer-events: none;
}

/* === 見出し・ブロックラベル（旧 headingStyles） ================================== */
${tiptap(".heading-number")} {
  color: ${headingLink};
  font-weight: 400;
  margin-right: 0.25em;
  user-select: none;
}
${tiptap(".heading-folded")}::after {
  content: ' ...';
  font-size: ${HEADING_ANCHOR_FONT_SIZE};
  color: ${textDisabled};
  font-weight: 400;
  font-style: italic;
}
${tiptap("h1")}, ${tiptap("h2")}, ${tiptap("h3")}, ${tiptap("h4")}, ${tiptap("h5")},
${tiptap("> p")}, ${tiptap("> blockquote > p")}, ${tiptap("li")} {
  position: relative;
}
${tiptap("h1")}, ${tiptap("h2")}, ${tiptap("h3")}, ${tiptap("h4")}, ${tiptap("h5")} {
  font-family: var(--editor-heading-font-family, monospace);
  letter-spacing: -0.01em;
}

/* hover ブロックラベル共通（::before バッジ） */
${HOVER_LABEL_TARGETS.map((target) => `${SCOPE} .tiptap ${target}::before`).join(",\n")} {
  position: absolute;
  right: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  font-size: ${HEADING_BADGE_FONT_SIZE};
  font-weight: 700;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 2px;
  background-color: ${actionHover};
  color: ${textSecondary};
  font-family: monospace;
  white-space: nowrap;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
/* Quote / UL / OL / Task は top 基準（複数行ブロックの先頭に揃える） */
${tiptap("> blockquote > p")}::before {
  top: 2px;
  transform: none;
  right: calc(100% + 30px);
}
${tiptap("li")}::before {
  top: 2px;
  transform: none;
  right: calc(100% + 32px);
}
${hoverShowSelectors} { opacity: 1; }
${tiptap("h1")}::before { content: 'H1'; }
${tiptap("h2")}::before { content: 'H2'; }
${tiptap("h3")}::before { content: 'H3'; }
${tiptap("h4")}::before { content: 'H4'; }
${tiptap("h5")}::before { content: 'H5'; }
${tiptap("> p")}::before { content: 'P'; }
${tiptap("> blockquote > p")}::before { content: 'Quote'; }
${tiptap("> ul:not([data-type='taskList']) > li")}::before { content: 'UL'; }
${tiptap("> ol > li")}::before { content: 'OL'; }
${tiptap("> ul[data-type='taskList'] > li")}::before { content: 'Task'; right: calc(100% + 8px); }

${tiptap("h1")} {
  font-size: 2em;
  font-weight: 700;
  margin-top: 16px;
  margin-bottom: 8px;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-left: 12px;
  border-radius: var(--editor-heading-radius-h1, 8px);
  border-left: 4px solid var(--editor-heading-border-h1, ${headingLink});
  background: var(--editor-heading-hatch, linear-gradient(90deg, ${h1Gradient}, transparent 70%));
  filter: var(--editor-heading-filter, none);
}
${tiptap("h2")} {
  font-size: 1.5em;
  font-weight: 700;
  margin-top: 12px;
  margin-bottom: 8px;
  padding-top: 4px;
  padding-bottom: 4px;
  padding-left: 12px;
  border-radius: var(--editor-heading-radius-h2, 8px);
  border-left: 3px solid var(--editor-heading-border-h2, ${h2Border});
  background: var(--editor-heading-hatch, linear-gradient(90deg, ${h2Gradient}, transparent 60%));
  filter: var(--editor-heading-filter, none);
}
${tiptap("h3")} {
  font-size: 1.25em;
  font-weight: 700;
  margin-top: 8px;
  margin-bottom: 4px;
  padding-left: 8px;
  border-radius: var(--editor-heading-radius-h3, 0);
  border-left: 2px solid var(--editor-heading-border-h3, ${h3Border});
  background: var(--editor-heading-hatch, none);
  filter: var(--editor-heading-filter, none);
}
${tiptap("h4")} {
  font-size: 1.1em;
  font-weight: 700;
  margin-top: 8px;
  margin-bottom: 4px;
}
${tiptap("h5")} {
  font-size: 1em;
  font-weight: 700;
  margin-top: 6px;
  margin-bottom: 4px;
}
${tiptap("p")} { margin-bottom: 12px; }
${tiptap("li")} { margin-bottom: 2px; }
/* モバイル: 見出しスケールを縮小（仕様3.2）。本文左右余白は .tiptap の clamp で自動追従 */
@media (max-width: 600px) {
  ${tiptap("h1")} { font-size: 1.6em; }
  ${tiptap("h2")} { font-size: 1.3em; }
  ${tiptap("h3")} { font-size: 1.15em; }
}

/* === コード（旧 codeStyles） ===================================================== */
${tiptap("code")} {
  background-color: ${isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG};
  color: ${isDark ? getGrey(isDark, 300) : DEFAULT_LIGHT_INLINE_CODE};
  padding: 2px 4px;
  border-radius: 2px;
  font-family: monospace;
  font-size: 0.875em;
}
${tiptap("pre")} {
  background-color: ${isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG};
  border: 1px solid ${isDark ? actionHover : "transparent"};
  border-radius: 4px;
  padding: 16px;
  margin-top: 8px;
  margin-bottom: 8px;
  overflow: auto;
}
${tiptap("pre code")} {
  background-color: transparent;
  color: ${isDark ? getGrey(isDark, 300) : "inherit"};
  padding: 0;
  border-radius: 0;
}
${hljsTokenCss(isDark ? HLJS_DARK : HLJS_LIGHT)}

/* === ブロック要素（旧 blockStyles） ============================================== */
${tiptap("ul")}, ${tiptap("ol")} {
  padding-left: 24px;
  margin-bottom: 8px;
}
@media (max-width: 900px) {
  ${tiptap("ul ul")}, ${tiptap("ul ol")}, ${tiptap("ol ul")}, ${tiptap("ol ol")} {
    padding-left: 12px;
  }
}
${tiptap("blockquote")} {
  border-left: 3px solid ${divider};
  padding-left: 16px;
  margin-left: 0;
  margin-top: 8px;
  margin-bottom: 8px;
  color: ${textSecondary};
}
${tiptap("blockquote[data-admonition-type]")} {
  border-left-width: 4px;
  padding-left: 16px;
  padding-top: 32px;
  padding-bottom: 8px;
  margin-top: 12px;
  margin-bottom: 12px;
  border-radius: var(--editor-admonition-radius, 8px);
  color: ${textPrimary};
  position: relative;
  filter: var(--editor-heading-filter, none);
}
/* ラベルアイコン（::before = SVG マスク箱） */
${tiptap("blockquote[data-admonition-type]")}::before {
  content: "";
  position: absolute;
  top: 8px;
  left: 16px;
  width: 16px;
  height: 16px;
}
/* ラベルテキスト（::after） */
${tiptap("blockquote[data-admonition-type]")}::after {
  position: absolute;
  top: 8px;
  left: 38px;
  font-size: ${BLOCK_STYLE_FONT_SIZE};
  font-weight: 700;
  line-height: 16px;
}
${admonitionCss("note", ADMONITION_NOTE, "Note")}
${admonitionCss("tip", ADMONITION_TIP, "Tip")}
${admonitionCss("important", ADMONITION_IMPORTANT, "Important")}
${admonitionCss("warning", ADMONITION_WARNING, "Warning")}
${admonitionCss("caution", ADMONITION_CAUTION, "Caution")}
/* div.tableWrapper を横スクロール容器にする（狭幅で列数の多い表が本文をはみ出さないように）。
   wrapper は resizable:true 時に native TableView が、resizable:false 時に renderWrapper:true（renderHTML）が生成する。 */
${tiptap(".tableWrapper")} {
  overflow-x: auto;
  max-width: 100%;
}
${tiptap("table")} {
  border-collapse: collapse;
  width: var(--am-editor-table-width, auto);
}
${tiptap("table th")}, ${tiptap("table td")} {
  border: 1px solid ${divider};
  padding: 0 8px;
  text-align: left;
  min-width: 80px;
  font-size: inherit;
  line-height: 1.2;
  background-color: ${isDark ? DEFAULT_DARK_TABLE_CELL_BG : DEFAULT_LIGHT_TABLE_CELL_BG};
}
${tiptap("table th")} {
  background-color: ${isDark ? DEFAULT_DARK_TABLE_HEADER_BG : DEFAULT_LIGHT_TABLE_HEADER_BG};
  font-weight: 600;
}
${tiptap("table .selectedCell")} { background-color: ${actionSelected}; }
${SCOPE}:not([data-table-width="auto"]) .tiptap table .cell-nav-selected {
  outline: 2px solid ${primaryMain};
  outline-offset: -2px;
  caret-color: transparent;
  position: relative;
}
${SCOPE}:not([data-table-width="auto"]) .tiptap table .cell-editing {
  outline: 1px solid ${primaryMain};
  outline-offset: -1px;
  background-color: ${alpha(primaryMain, isDark ? 0.08 : 0.04)};
}
${tiptap("img")} {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin-top: 8px;
  margin-bottom: 8px;
}
${tiptap("ul[data-type='taskList']")} {
  list-style: none;
  padding-left: 0;
}
${tiptap("ul[data-type='taskList'] li")} {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
}
${tiptap("ul[data-type='taskList'] li label")} {
  display: flex;
  align-items: center;
}
${tiptap("ul[data-type='taskList'] li label input[type='checkbox']")} {
  width: calc(var(--am-editor-font-size, 16px) - 2px);
  height: calc(var(--am-editor-font-size, 16px) - 2px);
  cursor: pointer;
  accent-color: ${primaryMain};
}
${tiptap("ul[data-type='taskList'] li > div")} { flex: 1; }
${tiptap("ul[data-type='taskList'] li > div p")} {
  margin-top: 8px;
  margin-bottom: 8px;
}
${tiptap("hr")} {
  border: none;
  border-top: 1px solid ${divider};
  margin-top: 16px;
  margin-bottom: 16px;
}
${tiptap("hr.ProseMirror-selectednode")} {
  border-left: 1.5px solid ${textPrimary};
  padding-top: 0.5em;
  padding-bottom: 0.5em;
  animation: am-blink-caret 1s step-end infinite;
}
@keyframes am-blink-caret {
  0%, 100% { border-left-color: ${textPrimary}; }
  50% { border-left-color: transparent; }
}
/* ProseMirror GapCursor — ブロック要素の前後に縦線カーソルを表示 */
${tiptap(".ProseMirror-gapcursor")} {
  display: none !important;
  pointer-events: none;
  position: relative;
}
${tiptap(".ProseMirror-gapcursor")}::after {
  content: "";
  display: block;
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  height: 100%;
  border-top: none;
  background-color: ${primaryMain};
  animation: am-blink-gap-cursor 1s step-end infinite;
}
${SCOPE} .tiptap.ProseMirror-focused .ProseMirror-gapcursor { display: block !important; }
@keyframes am-blink-gap-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* === imageRow（連続画像の横並び・旧 imageRowStyles） ============================= */
${tiptap("[data-image-row]")} {
  display: flex !important;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
  margin-top: 8px;
  margin-bottom: 8px;
}
${tiptap("[data-image-row] > *")} {
  min-width: 0 !important;
  max-width: 100%;
  overflow: hidden;
}
${tiptap("[data-image-row] .image-node-wrapper")} {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  min-width: 0 !important;
}
${tiptap("[data-image-row] img")} {
  max-width: 100%;
  height: auto;
}
${tiptap("[data-image-row] .image-node-wrapper > *")} {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
${tiptap(".image-node-wrapper[data-inside-image-row='false']")} {
  width: fit-content;
  max-width: 100%;
}
${tiptap(".image-row[data-selected='true']")}, ${tiptap("[data-image-row][data-selected='true']")} {
  outline: 2px solid ${primaryMain};
  outline-offset: 2px;
  border-radius: 4px;
}
${tiptap(".image-row-drop-cursor-vertical")} {
  position: absolute;
  width: 2px;
  background-color: ${primaryMain};
  pointer-events: none;
  z-index: 10;
}

/* === インライン（旧 inlineStyles） =============================================== */
${tiptap("a")} {
  color: ${primaryMain};
  text-decoration: underline;
  position: relative;
  cursor: pointer;
}
${tiptap('a[href^="#"]')} { cursor: text; }
${SCOPE} .tiptap.ctrl-held a[href^="#"] { cursor: pointer; }
${tiptap("a")}:hover::after {
  content: attr(href);
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  background-color: ${getGrey(isDark, 900)};
  color: ${COMMON_WHITE};
  padding: 2px 8px;
  border-radius: 4px;
  font-size: ${TOOLTIP_FONT_SIZE};
  white-space: nowrap;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: ${Z_LINK_TOOLTIP};
  pointer-events: none;
}
${tiptap('a[href^="#"]')}:hover::after { content: none; }
${SCOPE} .tiptap.ctrl-held a[href^="#"]:hover::after { content: attr(href); }
${tiptap("mark")} {
  background-color: ${alpha(ACCENT_COLOR, isDark ? 0.45 : 0.4)};
  border-radius: 2px;
  color: inherit;
  padding-left: 2px;
  padding-right: 2px;
}
${tiptap(".comment-highlight")} {
  background-color: rgba(255, 200, 0, 0.25);
  border-bottom: 2px solid rgba(255, 200, 0, 0.6);
  cursor: pointer;
  border-radius: 2px;
}
${tiptap(".comment-highlight")}:hover { background-color: rgba(255, 200, 0, 0.4); }
${tiptap(".comment-point-marker")} {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: rgba(255, 200, 0, 0.8);
  vertical-align: middle;
  margin-left: 2px;
  margin-right: 2px;
  cursor: pointer;
  user-select: none;
}
${tiptap(".search-match")} {
  background-color: ${alpha(getWarningLight(isDark), isDark ? 0.3 : 0.5)};
  border-radius: 2px;
}
${tiptap(".search-match-current")} {
  background-color: ${alpha(getWarningMain(isDark), isDark ? 0.5 : 0.4)};
  border-radius: 2px;
  outline: 2px solid ${primaryMain};
}
${tiptap("p:has(> sup[data-footnote-ref]) sup[data-footnote-ref]")} {
  color: ${primaryMain};
  font-weight: 600;
  cursor: default;
}
`;
}

const STYLE_ID = "am-editor-content-css";

/**
 * コンテンツ CSS を `document.head` へ注入する。同一テーマなら no-op、
 * テーマが変わった場合は既存 `<style>` の内容を差し替える（要素は増やさない）。
 */
export function injectEditorContentCss(isDark: boolean): void {
  if (typeof document === "undefined") return;
  const mode = isDark ? "dark" : "light";
  const existing = document.getElementById(STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    if (existing.dataset.mode !== mode) {
      existing.dataset.mode = mode;
      existing.textContent = buildEditorContentCss(isDark);
    }
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.dataset.mode = mode;
  style.textContent = buildEditorContentCss(isDark);
  document.head.appendChild(style);
}
