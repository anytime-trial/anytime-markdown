import type { Editor } from "@anytime-markdown/markdown-core";

import { getDefaultContent } from "../constants/defaultContent";
import { getBuiltinTemplates } from "../constants/templates";
import { insertImagesFromFiles } from "../extensions/slashCommandImageInsert";
import { setContentBypassingSectionLock } from "../extensions/sectionLockPlugin";
import { extractHeadings, getEditorStorage } from "../types";
import { preprocessMarkdown } from "../utils/frontmatterHelpers";
import { preserveBlankLines, sanitizeMarkdown } from "../utils/sanitizeMarkdown";
import { generateTocMarkdown } from "../utils/tocHelpers";
import type { VanillaSlashCommandItem } from "./SlashCommandMenu";

/**
 * スラッシュコマンドの既定 items（vanilla 版）。
 *
 * 旧 React 版 extensions/slashCommandItems.ts（G4-B で削除）の移植。action ロジックは
 * 同一で、アイコンのみ React コンポーネント → SVG path 文字列（vendored Material Icons,
 * Apache-2.0, 出典 https://fonts.google.com/icons）へ置換している。
 * host（vanillaMarkdownEditor）が slashItems 未注入時の既定としてこの配列を使う。
 */

/** vendored Material Icons の SVG path（24x24 viewBox）。circle は arc path へ変換済み。 */
const PATH = {
  accountTree: "M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z",
  barChart: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
  article:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-5 14H7v-2h7zm3-4H7v-2h10zm0-4H7V7h10z",
  calendarToday:
    "M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 18H4V8h16z",
  chatBubbleOutline:
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H6l-2 2V4h16z",
  checkBox:
    "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2m-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z",
  code: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z",
  errorOutline:
    "M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2M12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8",
  formatListBulleted:
    "M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5m0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5m0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5M7 19h14v-2H7zm0-6h14v-2H7zm0-8v2h14V5z",
  formatListNumbered:
    "M2 17h2v.5H3v1h1v.5H2v1h3v-4H2zm1-9h1V4H2v1h1zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2zm5-6v2h14V5zm0 14h14v-2H7zm0-6h14v-2H7z",
  formatQuote: "M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z",
  functions: "M18 4H6v2l6.5 6L6 18v2h12v-3h-7l5-5-5-5h7z",
  gifBox:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9.5 13v-1h1v1c0 .55-.45 1-1 1h-1c-.55 0-1-.45-1-1v-2c0-.55.45-1 1-1h1c.55 0 1 .45 1 1h-2v2zm3 1h-1v-4h1zm4-3h-2v.5H16v1h-1.5V14h-1v-4h3z",
  horizontalRule: "M4 11h16v2H4z",
  image:
    "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5z",
  info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m1 15h-2v-6h2zm0-8h-2V7h2z",
  integrationInstructions:
    "M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-.14 0-.27.01-.4.04-.39.08-.74.28-1.01.55-.18.18-.33.4-.43.64-.1.23-.16.49-.16.77v14c0 .27.06.54.16.78s.25.45.43.64c.27.27.62.47 1.01.55.13.02.26.03.4.03h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-8 11.17-1.41 1.42L6 12l3.59-3.59L11 9.83 8.83 12zm1-9.92c-.41 0-.75-.34-.75-.75s.34-.75.75-.75.75.34.75.75-.34.75-.75.75m2.41 11.34L13 14.17 15.17 12 13 9.83l1.41-1.42L18 12z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1M8 13h8v-2H8zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5",
  looks3:
    "M19.01 3h-14c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-4 7.5c0 .83-.67 1.5-1.5 1.5.83 0 1.5.67 1.5 1.5V15c0 1.11-.9 2-2 2h-4v-2h4v-2h-2v-2h2V9h-4V7h4c1.1 0 2 .89 2 2z",
  looks4:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-4 14h-2v-4H9V7h2v4h2V7h2z",
  looks5:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-4 6h-4v2h2c1.1 0 2 .89 2 2v2c0 1.11-.9 2-2 2H9v-2h4v-2H9V7h6z",
  looksOne:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-5 14h-2V9h-2V7h4z",
  looksTwo:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-4 8c0 1.11-.9 2-2 2h-2v2h4v2H9v-4c0-1.11.9-2 2-2h2V9H9V7h4c1.1 0 2 .89 2 2z",
  priorityHigh: ["M10 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z", "M10 3h4v12h-4z"],
  schema:
    "M14 9v2h-3V9H8.5V7H11V1H4v6h2.5v2H4v6h2.5v2H4v6h7v-6H8.5v-2H11v-2h3v2h7V9z",
  screenshotMonitor: [
    "M20 3H4c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h4v2h8v-2h4c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2m0 14H4V5h16z",
    "M6.5 7.5H9V6H5v4h1.5zM19 12h-1.5v2.5H15V16h4z",
  ],
  superscript:
    "M22 7h-2v1h3v1h-4V7c0-.55.45-1 1-1h2V5h-3V4h3c.55 0 1 .45 1 1v1c0 .55-.45 1-1 1M5.88 20h2.66l3.4-5.42h.12l3.4 5.42h2.66l-4.65-7.27L17.81 6h-2.68l-3.07 4.99h-.12L8.85 6H6.19l4.32 6.73z",
  tableChart:
    "M10 10.02h5V21h-5zM17 21h3c1.1 0 2-.9 2-2v-9h-5zm3-18H5c-1.1 0-2 .9-2 2v3h19V5c0-1.1-.9-2-2-2M3 19c0 1.1.9 2 2 2h3V10H3z",
  tipsAndUpdates:
    "M7 20h4c0 1.1-.9 2-2 2s-2-.9-2-2m-2-1h8v-2H5zm11.5-9.5c0 3.82-2.66 5.86-3.77 6.5H5.27c-1.11-.64-3.77-2.68-3.77-6.5C1.5 5.36 4.86 2 9 2s7.5 3.36 7.5 7.5m4.87-2.13L20 8l1.37.63L22 10l.63-1.37L24 8l-1.37-.63L22 6zM19 6l.94-2.06L22 3l-2.06-.94L19 0l-.94 2.06L16 3l2.06.94z",
  toc: "M3 9h14V7H3zm0 4h14v-2H3zm0 4h14v-2H3zm16 0h2v-2h-2zm0-10v2h2V7zm0 6h2v-2h-2z",
  warningAmber: ["M12 5.99 19.53 19H4.47zM12 2 1 21h22z", "M13 16h-2v2h2zm0-6h-2v5h2z"],
  web: "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m-5 14H4v-4h11zm0-5H4V9h11zm5 5h-4V9h4z",
} as const;

/** blockquote を作成し admonitionType を設定する */
function setAdmonition(editor: Editor, type: string): void {
  editor.chain().focus().setBlockquote().command(({ tr }) => {
    const { $from } = tr.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === "blockquote") {
        tr.setNodeAttribute($from.before(d), "admonitionType", type);
        return true;
      }
    }
    return true;
  }).run();
}

/** テンプレート Markdown をエディタのカーソル位置に挿入する。
 *  sanitizeMarkdown + preserveBlankLines を通した上で、
 *  一度 setContent でパースし ProseMirror Fragment として直接挿入する。 */
function insertTemplate(editor: Editor, md: string): void {
  const processed = preserveBlankLines(sanitizeMarkdown(md));
  // 現在のドキュメントとカーソル位置を退避
  const savedDoc = editor.state.doc.toJSON();
  const savedFrom = editor.state.selection.from;
  // 一時的に setContent でパース（Markdown 拡張 + Admonition が正しく動作する）。
  // パース退避 / 復元はロック検査の対象外（meta 付き）。素の setContent はロック存在時に
  // 黙って破棄され、復元失敗 → フラグメント誤挿入につながる（cross-review 合意 #1）。
  setContentBypassingSectionLock(editor, processed);
  const parsedFragment = editor.state.doc.content;
  // 退避したドキュメントを復元
  setContentBypassingSectionLock(editor, savedDoc);
  // ProseMirror トランザクションでフラグメントを直接挿入（ノード構造を保持）
  const insertPos = Math.min(savedFrom, editor.state.doc.content.size);
  const { tr } = editor.state;
  tr.insert(insertPos, parsedFragment);
  editor.view.dispatch(tr);
  editor.commands.focus();
}

/** NEXT_LOCALE cookie からロケールを解決する（旧 React 版と同一の判定）。 */
function resolveLocale(): string {
  return /NEXT_LOCALE=(\w+)/.exec(document.cookie)?.[1] ?? "ja";
}

/** ビルトインテンプレートを id で引く。見つからない場合は null（mock 環境等）。 */
function builtinTemplate(id: string): string | null {
  const locale = resolveLocale();
  const tpl = getBuiltinTemplates(locale).find((x) => x.id === id);
  if (!tpl) {
    console.warn(
      `[${new Date().toISOString()}] [WARN] slashCommandItems: builtin template not found: ${id}`,
    );
    return null;
  }
  return tpl.content;
}

/** テンプレート本文を前処理して挿入する共通 action。 */
function insertTemplateContent(editor: Editor, content: string | null): void {
  if (content === null) return;
  const { body } = preprocessMarkdown(content);
  insertTemplate(editor, body);
}

/** anytime-graph フェンス（思考法ダイアグラム）を DSL テンプレートつきで挿入する。 */
function insertThinkingDiagram(editor: Editor, template: string): void {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "codeBlock",
      attrs: { language: "anytime-thinking-model", autoEditOpen: true },
      content: [{ type: "text", text: template }],
    })
    .run();
}

// 思考法ダイアグラムは総称1項目に集約する。図種のバリエーションは挿入後の編集
// ダイアログ「サンプル」パネルから選択する（mermaid と同じ流儀）。
// 挿入直後は型未指定スケルトンを置き、autoEditOpen で編集ダイアログが自動で開く。
// builtinTemplate() と同様、呼び出し時点の resolveLocale() でロケール別に切り替える
// （指摘40: 旧固定文字列は英語ロケールでも日本語コメントが挿入されていた）。
function thinkingDiagramSkeleton(): string {
  return resolveLocale() === "ja"
    ? "# 思考法ダイアグラム — 右のサンプルから図種を選んでください（例: type: fishbone）"
    : "# Thinking diagram — pick a diagram type from the samples on the right (e.g. type: fishbone)";
}

/** anytime-chart フェンス（チャート）をスケルトンつきで挿入する。 */
function insertChart(editor: Editor, template: string): void {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "codeBlock",
      attrs: { language: "anytime-chart", autoEditOpen: true },
      content: [{ type: "text", text: template }],
    })
    .run();
}

// チャートも総称1項目に集約する。種別（line/bar/scatter）は挿入後の編集ダイアログ
// 「サンプル」パネルから選択する（思考法ダイアグラム・mermaid と同じ流儀）。
// 挿入直後はコメントのみのスケルトンを置き、autoEditOpen で編集ダイアログが自動で開く。
// thinkingDiagramSkeleton() と同様にロケール別へ切り替える（指摘40）。
function chartSkeleton(): string {
  return resolveLocale() === "ja"
    ? "# チャート — 右のサンプルから種別を選んでください（例: line / bar / scatter）"
    : "# Chart — pick a chart type from the samples on the right (e.g. line / bar / scatter)";
}

const CHART_ITEMS: readonly VanillaSlashCommandItem[] = [
  {
    id: "anytime-chart",
    labelKey: "anytimeChart",
    iconPath: PATH.barChart,
    keywords: [
      "anytime-chart",
      "chart",
      "チャート",
      "グラフ",
      "graph",
      "line",
      "折れ線",
      "bar",
      "棒",
      "scatter",
      "散布図",
      "可視化",
    ],
    action: (editor) => {
      insertChart(editor, chartSkeleton());
    },
  },
];

const THINKING_DIAGRAM_ITEMS: readonly VanillaSlashCommandItem[] = [
  {
    id: "anytime-graph",
    labelKey: "anytimeGraph",
    iconPath: PATH.accountTree,
    keywords: [
      "anytime-graph",
      "思考法",
      "ダイアグラム",
      "diagram",
      "thinking",
      "fishbone",
      "ishikawa",
      "特性要因図",
      "causal",
      "loop",
      "因果ループ",
      "pyramid",
      "ピラミッド",
      "mindmap",
      "マインドマップ",
      "double-diamond",
      "logic-tree",
      "ロジックツリー",
      "論点",
      "why",
      "なぜなぜ",
      "swot",
      "morph",
      "形態分析",
      "affinity",
      "親和図",
      "kj",
      "structure-map",
      "構造マップ",
      "構造化",
    ],
    action: (editor) => {
      insertThinkingDiagram(editor, thinkingDiagramSkeleton());
    },
  },
];

export const DEFAULT_SLASH_ITEMS: readonly VanillaSlashCommandItem[] = [
  {
    id: "heading1",
    labelKey: "slashH1",
    iconPath: PATH.looksOne,
    keywords: ["h1", "heading", "title", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 1 }).run();
    },
  },
  {
    id: "heading2",
    labelKey: "slashH2",
    iconPath: PATH.looksTwo,
    keywords: ["h2", "heading", "subtitle", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 2 }).run();
    },
  },
  {
    id: "heading3",
    labelKey: "slashH3",
    iconPath: PATH.looks3,
    keywords: ["h3", "heading", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 3 }).run();
    },
  },
  {
    id: "heading4",
    labelKey: "slashH4",
    iconPath: PATH.looks4,
    keywords: ["h4", "heading", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 4 }).run();
    },
  },
  {
    id: "heading5",
    labelKey: "slashH5",
    iconPath: PATH.looks5,
    keywords: ["h5", "heading", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 5 }).run();
    },
  },
  {
    id: "bulletList",
    labelKey: "slashBulletList",
    iconPath: PATH.formatListBulleted,
    keywords: ["bullet", "list", "unordered", "箇条書き", "リスト"],
    action: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "orderedList",
    labelKey: "slashOrderedList",
    iconPath: PATH.formatListNumbered,
    keywords: ["ordered", "numbered", "list", "番号", "リスト"],
    action: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "taskList",
    labelKey: "slashTaskList",
    iconPath: PATH.checkBox,
    keywords: ["task", "todo", "checkbox", "check", "タスク"],
    action: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: "blockquote",
    labelKey: "slashBlockquote",
    iconPath: PATH.formatQuote,
    keywords: ["quote", "blockquote", "引用"],
    action: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: "codeBlock",
    labelKey: "slashCodeBlock",
    iconPath: PATH.code,
    keywords: ["code", "codeblock", "コード"],
    action: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    id: "table",
    labelKey: "slashTable",
    iconPath: PATH.tableChart,
    keywords: ["table", "テーブル", "表"],
    action: (editor) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    id: "horizontalRule",
    labelKey: "slashHorizontalRule",
    iconPath: PATH.horizontalRule,
    keywords: ["hr", "divider", "horizontal", "rule", "区切り", "水平線"],
    action: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    id: "link",
    labelKey: "slashLink",
    iconPath: PATH.link,
    keywords: ["link", "url", "anchor", "hyperlink", "md", "リンク", "ハイパーリンク"],
    action: (editor) => {
      const storage = getEditorStorage(editor);
      const openDialog = storage.linkDialog?.open as (() => void) | undefined;
      if (openDialog) {
        openDialog();
      }
    },
  },
  {
    id: "webImport",
    labelKey: "slashWebImport",
    iconPath: PATH.link,
    keywords: ["web", "url", "import", "html", "記事", "取り込み", "ウェブ"],
    action: (editor) => {
      const storage = getEditorStorage(editor);
      const openDialog = storage.webImportDialog?.open as (() => void) | undefined;
      if (openDialog) {
        openDialog();
      }
    },
  },
  {
    id: "embed",
    labelKey: "slashEmbed",
    iconPath: PATH.link,
    keywords: ["embed", "ogp", "url", "link", "bookmark", "カード", "埋め込み"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "embed" }).updateAttributes("codeBlock", { autoEditOpen: true }).run();
    },
  },
  {
    id: "mermaid",
    labelKey: "slashMermaid",
    iconPath: PATH.accountTree,
    keywords: ["mermaid", "diagram", "chart", "図"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "mermaid" }).updateAttributes("codeBlock", { autoEditOpen: true }).run();
    },
  },
  {
    id: "plantuml",
    labelKey: "slashPlantUml",
    iconPath: PATH.schema,
    keywords: ["plantuml", "uml", "diagram", "図"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "plantuml" }).updateAttributes("codeBlock", { autoEditOpen: true }).run();
    },
  },
  {
    id: "screenmock",
    labelKey: "slashScreenmock",
    iconPath: PATH.screenshotMonitor,
    keywords: ["screenmock", "mock", "screen", "ui", "wireframe", "画面", "モック", "がめん"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "screenmock" }).updateAttributes("codeBlock", { autoEditOpen: true }).run();
    },
  },
  ...THINKING_DIAGRAM_ITEMS,
  ...CHART_ITEMS,
  {
    id: "math",
    labelKey: "slashMath",
    iconPath: PATH.functions,
    keywords: ["math", "equation", "formula", "latex", "katex", "数式", "すうしき"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "math" }).updateAttributes("codeBlock", { autoEditOpen: true }).run();
    },
  },
  {
    id: "toc",
    labelKey: "slashToc",
    iconPath: PATH.toc,
    keywords: ["toc", "table of contents", "目次", "もくじ"],
    action: (editor) => {
      const headings = extractHeadings(editor);
      const tocMd = generateTocMarkdown(headings);
      if (tocMd) {
        editor.chain().focus().insertContent(tocMd).run();
      }
    },
  },
  {
    id: "date",
    labelKey: "slashDate",
    iconPath: PATH.calendarToday,
    keywords: ["date", "today", "日付", "きょう", "今日"],
    action: (editor) => {
      const today = new Date().toISOString().slice(0, 10);
      editor.chain().focus().insertContent(today).run();
    },
  },
  {
    id: "footnote",
    labelKey: "slashFootnote",
    iconPath: PATH.superscript,
    keywords: ["footnote", "note", "reference", "脚注", "きゃくちゅう"],
    action: (editor) => {
      let maxId = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") {
          const n = Number.parseInt(node.attrs.noteId, 10);
          if (!Number.isNaN(n) && n > maxId) maxId = n;
        }
      });
      const noteId = String(maxId + 1);
      const refNode = editor.state.schema.nodes.footnoteRef?.create({ noteId });
      if (!refNode) return;
      // カーソル位置に脚注参照を挿入
      editor.chain().focus().insertContent(refNode.toJSON()).run();
      // ドキュメント末尾に脚注定義を追加
      // footnoteRef ノード + ": " テキストで構成し、シリアライザが [^id]: を正しく出力する
      const { state } = editor;
      const endPos = state.doc.content.size;
      const defRef = state.schema.nodes.footnoteRef.create({ noteId });
      const defParagraph = state.schema.nodes.paragraph.create(null, [defRef, state.schema.text(": ")]);
      editor.view.dispatch(state.tr.insert(endPos, defParagraph));
    },
  },
  {
    id: "admonitionNote",
    labelKey: "slashNote",
    iconPath: PATH.info,
    keywords: ["note", "info", "callout", "admonition", "注記", "ノート"],
    action: (editor) => { setAdmonition(editor, "note"); },
  },
  {
    id: "admonitionTip",
    labelKey: "slashTip",
    iconPath: PATH.tipsAndUpdates,
    keywords: ["tip", "hint", "ヒント"],
    action: (editor) => { setAdmonition(editor, "tip"); },
  },
  {
    id: "admonitionImportant",
    labelKey: "slashImportant",
    iconPath: PATH.priorityHigh,
    keywords: ["important", "重要"],
    action: (editor) => { setAdmonition(editor, "important"); },
  },
  {
    id: "admonitionWarning",
    labelKey: "slashWarning",
    iconPath: PATH.warningAmber,
    keywords: ["warning", "warn", "警告"],
    action: (editor) => { setAdmonition(editor, "warning"); },
  },
  {
    id: "admonitionCaution",
    labelKey: "slashCaution",
    iconPath: PATH.errorOutline,
    keywords: ["caution", "danger", "注意", "危険"],
    action: (editor) => { setAdmonition(editor, "caution"); },
  },
  {
    id: "html",
    labelKey: "slashHtml",
    iconPath: PATH.web,
    keywords: ["html", "web", "markup", "ウェブ"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "html" }).updateAttributes("codeBlock", { autoEditOpen: true }).run();
    },
  },
  {
    id: "comment",
    labelKey: "slashComment",
    iconPath: PATH.chatBubbleOutline,
    keywords: ["comment", "annotation", "note", "コメント", "注釈", "メモ"],
    action: (editor) => {
      const storage = getEditorStorage(editor);
      const openDialog = storage.commentDialog?.open as (() => void) | undefined;
      if (openDialog) {
        openDialog();
      }
    },
  },
  {
    id: "image",
    labelKey: "slashImage",
    iconPath: PATH.image,
    keywords: ["image", "picture", "photo", "画像", "写真", "イメージ"],
    action: (editor) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        void insertImagesFromFiles(editor, files);
      };
      input.click();
    },
  },
  {
    id: "screenshot",
    labelKey: "slashScreenshot",
    iconPath: PATH.screenshotMonitor,
    keywords: ["screenshot", "screen", "capture", "スクリーンショット", "スクリーンキャプチャ", "画面"],
    action: (editor) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return;
      globalThis.dispatchEvent(new CustomEvent("open-screen-capture", { detail: { editor } }));
    },
  },
  {
    id: "frontmatter",
    labelKey: "slashFrontmatter",
    iconPath: PATH.integrationInstructions,
    keywords: ["frontmatter", "yaml", "metadata", "メタデータ", "フロントマター"],
    action: (editor) => {
      const storage = getEditorStorage(editor);
      const fm = storage.frontmatter as
        | {
            get: () => string | null;
            set: (v: string | null) => void;
            focusEditor?: () => void;
          }
        | null;
      if (!fm) return;
      // focusEditor は FrontmatterBlock を展開してから textarea へフォーカスする
      // （折りたたみ時は textarea が DOM に存在しないため document 直 query では効かない）。
      const focusEditor = (): void => {
        if (fm.focusEditor) {
          fm.focusEditor();
          return;
        }
        document.querySelector<HTMLTextAreaElement>("[data-frontmatter-editor]")?.focus();
      };
      const current = fm.get();
      if (current !== null) {
        // 既存のフロントマターがある場合は FrontmatterBlock を展開してフォーカス
        focusEditor();
        return;
      }
      // 空のフロントマターを作成し、テキストエリアにフォーカス
      fm.set("title: ");
      requestAnimationFrame(focusEditor);
    },
  },
  {
    id: "gif",
    labelKey: "slashGif",
    iconPath: PATH.gifBox,
    keywords: ["gif", "record", "screen", "capture", "録画", "キャプチャ", "アニメーション"],
    action: (editor) => {
      editor.chain().focus().insertContent({ type: "gifBlock", attrs: { autoEditOpen: true } }).run();
    },
  },
  {
    id: "template-welcome",
    labelKey: "slashTemplateWelcome",
    iconPath: PATH.article,
    keywords: ["template", "welcome", "テンプレート", "ウェルカム", "操作", "ガイド"],
    action: (editor) => {
      insertTemplateContent(editor, getDefaultContent(resolveLocale()));
    },
  },
  {
    id: "template-markdown-all",
    labelKey: "slashTemplateMarkdownAll",
    iconPath: PATH.article,
    keywords: ["template", "markdown", "all", "テンプレート", "マークダウン"],
    action: (editor) => {
      insertTemplateContent(editor, builtinTemplate("markdown-all"));
    },
  },
  {
    id: "template-basic-design",
    labelKey: "slashTemplateBasicDesign",
    iconPath: PATH.article,
    keywords: ["template", "design", "テンプレート", "設計", "設計書"],
    action: (editor) => {
      insertTemplateContent(editor, builtinTemplate("basic-design"));
    },
  },
  {
    id: "template-api-spec",
    labelKey: "slashTemplateApiSpec",
    iconPath: PATH.article,
    keywords: ["template", "api", "spec", "テンプレート", "API", "仕様", "仕様書"],
    action: (editor) => {
      insertTemplateContent(editor, builtinTemplate("api-spec"));
    },
  },
];
