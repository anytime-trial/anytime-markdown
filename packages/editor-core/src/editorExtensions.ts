/**
 * TipTap Extension の共通設定
 *
 * メインエディタと比較エディタで共有する Extension リストを一元管理する。
 * エディタ固有の Extension（検索、削除行ショートカット等）は各エディタで追加する。
 */
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "tiptap-markdown";
import { TableKit } from "@tiptap/extension-table";
import { CodeBlockWithMermaid } from "./codeBlockWithMermaid";
import { CustomImage } from "./imageExtension";
import { CustomTable } from "./tableExtension";
import { CustomTableCell, CustomTableHeader } from "./extensions/customTableCells";
import { DiffHighlight } from "./extensions/diffHighlight";
import { HeadingFoldExtension } from "./extensions/headingFoldExtension";
import { CodeBlockNavigation } from "./extensions/codeBlockNavigationExtension";
import { MathInline } from "./extensions/mathInlineExtension";
import { AdmonitionBlockquote } from "./extensions/admonitionExtension";
import { FootnoteRef } from "./extensions/footnoteExtension";
import type { Extensions } from "@tiptap/react";

/** 共通 Extension（メインエディタ / 比較エディタで共有） */
export function getBaseExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5] },
      codeBlock: false,
      hardBreak: false,
      blockquote: false, // AdmonitionBlockquote で置換
    }),
    AdmonitionBlockquote,
    CodeBlockWithMermaid,
    Highlight,
    Underline,
    LinkExtension.configure({ openOnClick: false, validate: () => true }),
    CustomImage.configure({ inline: false, allowBase64: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({
      table: false,
      tableCell: false,
      tableHeader: false,
    }),
    CustomTable.configure({ resizable: false }),
    CustomTableCell,
    CustomTableHeader,
    Markdown.configure({
      html: true,
      transformPastedText: true,
      transformCopiedText: false,
    }),
    DiffHighlight,
    HeadingFoldExtension,
    CodeBlockNavigation,
    MathInline,
    FootnoteRef,
  ];
}
