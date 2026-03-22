import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ArticleIcon from "@mui/icons-material/Article";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CodeIcon from "@mui/icons-material/Code";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import FunctionsIcon from "@mui/icons-material/Functions";
import GifBoxIcon from "@mui/icons-material/GifBox";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import ImageIcon from "@mui/icons-material/Image";
import InfoIcon from "@mui/icons-material/Info";
import IntegrationInstructionsIcon from "@mui/icons-material/IntegrationInstructions";
import Looks3Icon from "@mui/icons-material/Looks3";
import Looks4Icon from "@mui/icons-material/Looks4";
import Looks5Icon from "@mui/icons-material/Looks5";
import LooksOneIcon from "@mui/icons-material/LooksOne";
import LooksTwoIcon from "@mui/icons-material/LooksTwo";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import SchemaIcon from "@mui/icons-material/Schema";
import ScreenshotMonitorIcon from "@mui/icons-material/ScreenshotMonitor";
import SuperscriptIcon from "@mui/icons-material/Superscript";
import TableChartIcon from "@mui/icons-material/TableChart";
import TipsAndUpdatesIcon from "@mui/icons-material/TipsAndUpdates";
import TocIcon from "@mui/icons-material/Toc";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import WebIcon from "@mui/icons-material/Web";
import type { Editor } from "@tiptap/core";
import React from "react";

import apiSpec from "../constants/templates/apiSpec.md";
import basicDesign from "../constants/templates/basicDesign.md";
import markdownAllJa from "../constants/templates/markdownAll.ja.md";
import markdownAllEn from "../constants/templates/markdownAll.en.md";
import welcomeJa from "../constants/templates/welcome.md";
import welcomeEn from "../constants/templates/welcome-en.md";
import type { TranslationFn } from "../types";
import { extractHeadings, getEditorStorage } from "../types";
import { preprocessMarkdown } from "../utils/frontmatterHelpers";
import { preserveBlankLines, sanitizeMarkdown } from "../utils/sanitizeMarkdown";
import { generateTocMarkdown } from "../utils/tocHelpers";

/** テンプレート Markdown をエディタのカーソル位置に挿入する。
 *  sanitizeMarkdown + preserveBlankLines を通した上で、
 *  一度 setContent でパースし ProseMirror Fragment として直接挿入する。 */
function insertTemplate(editor: Editor, md: string): void {
  const processed = preserveBlankLines(sanitizeMarkdown(md));
  // 現在のドキュメントとカーソル位置を退避
  const savedDoc = editor.state.doc.toJSON();
  const savedFrom = editor.state.selection.from;
  // 一時的に setContent でパース（Markdown 拡張 + Admonition が正しく動作する）
  editor.commands.setContent(processed);
  const parsedFragment = editor.state.doc.content;
  // 退避したドキュメントを復元
  editor.commands.setContent(savedDoc);
  // ProseMirror トランザクションでフラグメントを直接挿入（ノード構造を保持）
  const insertPos = Math.min(savedFrom, editor.state.doc.content.size);
  const { tr } = editor.state;
  tr.insert(insertPos, parsedFragment);
  editor.view.dispatch(tr);
  editor.commands.focus();
}

export interface SlashCommandItem {
  id: string;
  labelKey: string;
  icon: React.ReactElement;
  keywords: string[];
  action: (editor: Editor) => void;
}

export const slashCommandItems: SlashCommandItem[] = [
  {
    id: "heading1",
    labelKey: "slashH1",
    icon: React.createElement(LooksOneIcon, { fontSize: "small" }),
    keywords: ["h1", "heading", "title", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 1 }).run();
    },
  },
  {
    id: "heading2",
    labelKey: "slashH2",
    icon: React.createElement(LooksTwoIcon, { fontSize: "small" }),
    keywords: ["h2", "heading", "subtitle", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 2 }).run();
    },
  },
  {
    id: "heading3",
    labelKey: "slashH3",
    icon: React.createElement(Looks3Icon, { fontSize: "small" }),
    keywords: ["h3", "heading", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 3 }).run();
    },
  },
  {
    id: "heading4",
    labelKey: "slashH4",
    icon: React.createElement(Looks4Icon, { fontSize: "small" }),
    keywords: ["h4", "heading", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 4 }).run();
    },
  },
  {
    id: "heading5",
    labelKey: "slashH5",
    icon: React.createElement(Looks5Icon, { fontSize: "small" }),
    keywords: ["h5", "heading", "見出し"],
    action: (editor) => {
      editor.chain().focus().setHeading({ level: 5 }).run();
    },
  },
  {
    id: "bulletList",
    labelKey: "slashBulletList",
    icon: React.createElement(FormatListBulletedIcon, { fontSize: "small" }),
    keywords: ["bullet", "list", "unordered", "箇条書き", "リスト"],
    action: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "orderedList",
    labelKey: "slashOrderedList",
    icon: React.createElement(FormatListNumberedIcon, { fontSize: "small" }),
    keywords: ["ordered", "numbered", "list", "番号", "リスト"],
    action: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "taskList",
    labelKey: "slashTaskList",
    icon: React.createElement(CheckBoxIcon, { fontSize: "small" }),
    keywords: ["task", "todo", "checkbox", "check", "タスク"],
    action: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
  {
    id: "blockquote",
    labelKey: "slashBlockquote",
    icon: React.createElement(FormatQuoteIcon, { fontSize: "small" }),
    keywords: ["quote", "blockquote", "引用"],
    action: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  {
    id: "codeBlock",
    labelKey: "slashCodeBlock",
    icon: React.createElement(CodeIcon, { fontSize: "small" }),
    keywords: ["code", "codeblock", "コード"],
    action: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
  },
  {
    id: "table",
    labelKey: "slashTable",
    icon: React.createElement(TableChartIcon, { fontSize: "small" }),
    keywords: ["table", "テーブル", "表"],
    action: (editor) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    id: "horizontalRule",
    labelKey: "slashHorizontalRule",
    icon: React.createElement(HorizontalRuleIcon, { fontSize: "small" }),
    keywords: ["hr", "divider", "horizontal", "rule", "区切り", "水平線"],
    action: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
  {
    id: "mermaid",
    labelKey: "slashMermaid",
    icon: React.createElement(AccountTreeIcon, { fontSize: "small" }),
    keywords: ["mermaid", "diagram", "chart", "図"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "mermaid" }).run();
    },
  },
  {
    id: "plantuml",
    labelKey: "slashPlantUml",
    icon: React.createElement(SchemaIcon, { fontSize: "small" }),
    keywords: ["plantuml", "uml", "diagram", "図"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "plantuml" }).run();
    },
  },
  {
    id: "math",
    labelKey: "slashMath",
    icon: React.createElement(FunctionsIcon, { fontSize: "small" }),
    keywords: ["math", "equation", "formula", "latex", "katex", "数式", "すうしき"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "math" }).run();
    },
  },
  {
    id: "toc",
    labelKey: "slashToc",
    icon: React.createElement(TocIcon, { fontSize: "small" }),
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
    icon: React.createElement(CalendarTodayIcon, { fontSize: "small" }),
    keywords: ["date", "today", "日付", "きょう", "今日"],
    action: (editor) => {
      const today = new Date().toISOString().slice(0, 10);
      editor.chain().focus().insertContent(today).run();
    },
  },
  {
    id: "footnote",
    labelKey: "slashFootnote",
    icon: React.createElement(SuperscriptIcon, { fontSize: "small" }),
    keywords: ["footnote", "note", "reference", "脚注", "きゃくちゅう"],
    action: (editor) => {
      const noteId = String(Date.now()).slice(-4);
      const node = editor.state.schema.nodes.footnoteRef?.create({ noteId });
      if (node) {
        editor.chain().focus().insertContent(node.toJSON()).run();
      }
    },
  },
  {
    id: "admonitionNote",
    labelKey: "slashNote",
    icon: React.createElement(InfoIcon, { fontSize: "small" }),
    keywords: ["note", "info", "callout", "admonition", "注記", "ノート"],
    action: (editor) => {
      editor.chain().focus().setBlockquote().command(({ tr, state }) => {
        const { $from } = state.selection;
        const bqPos = $from.before($from.depth);
        tr.setNodeAttribute(bqPos, "admonitionType", "note");
        return true;
      }).run();
    },
  },
  {
    id: "admonitionTip",
    labelKey: "slashTip",
    icon: React.createElement(TipsAndUpdatesIcon, { fontSize: "small" }),
    keywords: ["tip", "hint", "ヒント"],
    action: (editor) => {
      editor.chain().focus().setBlockquote().command(({ tr, state }) => {
        const { $from } = state.selection;
        const bqPos = $from.before($from.depth);
        tr.setNodeAttribute(bqPos, "admonitionType", "tip");
        return true;
      }).run();
    },
  },
  {
    id: "admonitionImportant",
    labelKey: "slashImportant",
    icon: React.createElement(PriorityHighIcon, { fontSize: "small" }),
    keywords: ["important", "重要"],
    action: (editor) => {
      editor.chain().focus().setBlockquote().command(({ tr, state }) => {
        const { $from } = state.selection;
        const bqPos = $from.before($from.depth);
        tr.setNodeAttribute(bqPos, "admonitionType", "important");
        return true;
      }).run();
    },
  },
  {
    id: "admonitionWarning",
    labelKey: "slashWarning",
    icon: React.createElement(WarningAmberIcon, { fontSize: "small" }),
    keywords: ["warning", "warn", "警告"],
    action: (editor) => {
      editor.chain().focus().setBlockquote().command(({ tr, state }) => {
        const { $from } = state.selection;
        const bqPos = $from.before($from.depth);
        tr.setNodeAttribute(bqPos, "admonitionType", "warning");
        return true;
      }).run();
    },
  },
  {
    id: "admonitionCaution",
    labelKey: "slashCaution",
    icon: React.createElement(ErrorOutlineIcon, { fontSize: "small" }),
    keywords: ["caution", "danger", "注意", "危険"],
    action: (editor) => {
      editor.chain().focus().setBlockquote().command(({ tr, state }) => {
        const { $from } = state.selection;
        const bqPos = $from.before($from.depth);
        tr.setNodeAttribute(bqPos, "admonitionType", "caution");
        return true;
      }).run();
    },
  },
  {
    id: "html",
    labelKey: "slashHtml",
    icon: React.createElement(WebIcon, { fontSize: "small" }),
    keywords: ["html", "web", "markup", "ウェブ"],
    action: (editor) => {
      editor.chain().focus().setCodeBlock({ language: "html" }).run();
    },
  },
  {
    id: "comment",
    labelKey: "slashComment",
    icon: React.createElement(ChatBubbleOutlineIcon, { fontSize: "small" }),
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
    icon: React.createElement(ImageIcon, { fontSize: "small" }),
    keywords: ["image", "picture", "photo", "画像", "写真", "イメージ"],
    action: (editor) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            editor.chain().focus().setImage({ src: reader.result, alt: file.name }).run();
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
    },
  },
  {
    id: "screenshot",
    labelKey: "slashScreenshot",
    icon: React.createElement(ScreenshotMonitorIcon, { fontSize: "small" }),
    keywords: ["screenshot", "screen", "capture", "スクリーンショット", "スクリーンキャプチャ", "画面"],
    action: (editor) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return;
      globalThis.dispatchEvent(new CustomEvent("open-screen-capture", { detail: { editor } }));
    },
  },
  {
    id: "frontmatter",
    labelKey: "slashFrontmatter",
    icon: React.createElement(IntegrationInstructionsIcon, { fontSize: "small" }),
    keywords: ["frontmatter", "yaml", "metadata", "メタデータ", "フロントマター"],
    action: (editor) => {
      // フロントマターが既に存在するか確認
      const doc = editor.state.doc;
      const firstNode = doc.firstChild;
      if (firstNode?.type.name === "codeBlock" && firstNode.attrs.language === "yaml") {
        // 既存のフロントマターにフォーカス
        editor.chain().focus().setTextSelection(1).run();
        return;
      }
      // 先頭に空のフロントマターブロックを挿入
      const { tr } = editor.state;
      const yamlBlock = editor.schema.nodes.codeBlock.create(
        { language: "yaml" },
        editor.schema.text("title: "),
      );
      tr.insert(0, yamlBlock);
      editor.view.dispatch(tr);
      editor.chain().focus().setTextSelection(1).run();
    },
  },
  {
    id: "gif",
    labelKey: "slashGif",
    icon: React.createElement(GifBoxIcon, { fontSize: "small" }),
    keywords: ["gif", "record", "screen", "capture", "録画", "キャプチャ", "アニメーション"],
    action: (editor) => {
      editor.chain().focus().insertContent({ type: "gifBlock" }).run();
    },
  },
  {
    id: "template-welcome",
    labelKey: "slashTemplateWelcome",
    icon: React.createElement(ArticleIcon, { fontSize: "small" }),
    keywords: ["template", "welcome", "テンプレート", "ウェルカム", "操作", "ガイド"],
    action: (editor) => {
      const locale = /NEXT_LOCALE=(\w+)/.exec(document.cookie)?.[1] ?? "ja";
      const content = locale === "ja" ? welcomeJa : welcomeEn;
      const { body } = preprocessMarkdown(content);
      insertTemplate(editor, body);
    },
  },
  {
    id: "template-markdown-all",
    labelKey: "slashTemplateMarkdownAll",
    icon: React.createElement(ArticleIcon, { fontSize: "small" }),
    keywords: ["template", "markdown", "all", "テンプレート", "マークダウン"],
    action: (editor) => {
      const locale = /NEXT_LOCALE=(\w+)/.exec(document.cookie)?.[1] ?? "ja";
      const content = locale === "ja" ? markdownAllJa : markdownAllEn;
      const { body } = preprocessMarkdown(content);
      insertTemplate(editor, body);
    },
  },
  {
    id: "template-basic-design",
    labelKey: "slashTemplateBasicDesign",
    icon: React.createElement(ArticleIcon, { fontSize: "small" }),
    keywords: ["template", "design", "テンプレート", "設計", "設計書"],
    action: (editor) => {
      const { body } = preprocessMarkdown(basicDesign);
      insertTemplate(editor, body);
    },
  },
  {
    id: "template-api-spec",
    labelKey: "slashTemplateApiSpec",
    icon: React.createElement(ArticleIcon, { fontSize: "small" }),
    keywords: ["template", "api", "spec", "テンプレート", "API", "仕様", "仕様書"],
    action: (editor) => {
      const { body } = preprocessMarkdown(apiSpec);
      insertTemplate(editor, body);
    },
  },
];

export function filterSlashItems(
  items: SlashCommandItem[],
  query: string,
  t: TranslationFn,
): SlashCommandItem[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter((item) => {
    const label = t(item.labelKey).toLowerCase();
    if (label.includes(lower)) return true;
    return item.keywords.some((kw) => kw.toLowerCase().includes(lower));
  });
}
