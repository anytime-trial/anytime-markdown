import React from "react";
import type { Editor } from "@tiptap/core";
import type { TranslationFn } from "../types";
import { extractHeadings } from "../types";
import { generateTocMarkdown } from "../utils/tocHelpers";

import LooksOneIcon from "@mui/icons-material/LooksOne";
import LooksTwoIcon from "@mui/icons-material/LooksTwo";
import Looks3Icon from "@mui/icons-material/Looks3";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import CodeIcon from "@mui/icons-material/Code";
import TableChartIcon from "@mui/icons-material/TableChart";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import SchemaIcon from "@mui/icons-material/Schema";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import FunctionsIcon from "@mui/icons-material/Functions";
import TocIcon from "@mui/icons-material/Toc";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

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
