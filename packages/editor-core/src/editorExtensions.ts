/**
 * TipTap Extension の共通設定
 *
 * メインエディタと比較エディタで共有する Extension リストを一元管理する。
 * エディタ固有の Extension（検索、削除行ショートカット等）は各エディタで追加する。
 */
import Highlight from "@tiptap/extension-highlight";
import LinkExtension from "@tiptap/extension-link";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { Markdown } from "tiptap-markdown";

import { CodeBlockWithMermaid } from "./codeBlockWithMermaid";

/** lowlight インスタンス（シンタックスハイライト用） */
const lowlight = createLowlight(common);

// NodeView 専用言語を no-op 登録し、highlightAuto の誤検出を防止
const noopGrammar = () => ({ name: "noop", contains: [] as never[] });
for (const lang of ["math", "mermaid", "plantuml"]) {
  lowlight.register(lang, noopGrammar);
}
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Extension, type Extensions } from "@tiptap/react";

import { AdmonitionBlockquote } from "./extensions/admonitionExtension";
import { CodeBlockNavigation } from "./extensions/codeBlockNavigationExtension";
import { CommentDataPlugin,CommentHighlight, CommentPoint } from "./extensions/commentExtension";
import { CustomTableCell, CustomTableHeader } from "./extensions/customTableCells";
import { DiffHighlight } from "./extensions/diffHighlight";
import { FootnoteRef } from "./extensions/footnoteExtension";
import { HeadingFoldExtension } from "./extensions/headingFoldExtension";
import { HeadingNumberExtension } from "./extensions/headingNumberExtension";
import { MathInline } from "./extensions/mathInlineExtension";
import { CustomImage } from "./imageExtension";
import { CustomTable } from "./tableExtension";

/**
 * tiptap-markdown の MarkdownTightLists は bulletList / orderedList のみ対象。
 * taskList にも tight 属性を追加し、空行なしで出力できるようにする。
 */
const TaskListTight = Extension.create({
  name: "taskListTight",
  addGlobalAttributes() {
    return [{
      types: ["taskList"],
      attributes: {
        tight: {
          default: true,
          parseHTML: (el: HTMLElement) =>
            el.getAttribute("data-tight") === "true" || !el.querySelector("p"),
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.tight ? { class: "tight", "data-tight": "true" } : {},
        },
      },
    }];
  },
});

/**
 * insertContent 経由で挿入されたリスト内テキストノードの末尾 \n を除去する。
 * tiptap-markdown のパーサーが { inline: true } で解析する際に末尾 \n が残り、
 * WYSIWYG 表示でネストリスト手前に空行が表示される問題を修正する。
 */
const ListTextCleanup = Extension.create({
  name: "listTextCleanup",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("listTextCleanup"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const changes: { from: number; to: number; text: string; marks: readonly import("@tiptap/pm/model").Mark[] }[] = [];
          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text?.endsWith("\n")) return;
            const $pos = newState.doc.resolve(pos);
            if ($pos.parent.type.name !== "paragraph") return;
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type.name === "listItem") {
                const text = node.text ?? "";
                const trimmed = text.replace(/\n+$/, "");
                changes.push({ from: pos, to: pos + text.length, text: trimmed, marks: [...node.marks] });
                break;
              }
            }
          });
          if (changes.length === 0) return null;
          const tr = newState.tr;
          for (let i = changes.length - 1; i >= 0; i--) {
            const { from, to, text, marks } = changes[i];
            if (text.length > 0) {
              tr.replaceWith(from, to, newState.schema.text(text, marks));
            } else {
              tr.delete(from, to);
            }
          }
          return tr;
        },
      }),
    ];
  },
});

/** 共通 Extension（メインエディタ / 比較エディタで共有） */
export function getBaseExtensions(options?: { disableComments?: boolean }): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5] },
      codeBlock: false,
      hardBreak: false,
      blockquote: false, // AdmonitionBlockquote で置換
    }),
    AdmonitionBlockquote,
    CodeBlockWithMermaid.configure({ lowlight }),
    Highlight,
    Underline,
    LinkExtension.configure({ openOnClick: false, validate: () => true, isAllowedUri: () => true }),
    CustomImage.configure({ inline: false, allowBase64: true }),
    TaskList,
    TaskItem.configure({
      nested: true,
      onReadOnlyChecked: () => true,
    }),
    TaskListTight,
    ListTextCleanup,
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
    HeadingNumberExtension,
  ];
  if (!options?.disableComments) {
    extensions.push(CommentHighlight, CommentPoint, CommentDataPlugin);
  }
  return extensions;
}
