/**
 * TipTap Extension の共通設定
 *
 * メインエディタと比較エディタで共有する Extension リストを一元管理する。
 * エディタ固有の Extension（検索、削除行ショートカット等）は各エディタで追加する。
 */
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
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
export function getBaseExtensions(options?: { disableComments?: boolean; disableCheckboxToggle?: boolean }): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5] },
      codeBlock: false,
      hardBreak: false,
      blockquote: false, // AdmonitionBlockquote で置換
      bold: { HTMLAttributes: {}, },
      italic: { HTMLAttributes: {}, },
      strike: { HTMLAttributes: {}, },
      code: { HTMLAttributes: {}, },
    }),
    // 書式・リストのキーボードショートカットを無効化
    // （バブルメニュー・ツールバー・スラッシュコマンドから操作）
    Extension.create({
      name: "disableFormattingShortcuts",
      addKeyboardShortcuts() {
        return {
          "Mod-b": () => true,
          "Mod-i": () => true,
          "Mod-u": () => true,
          "Mod-e": () => true,
          "Mod-Shift-x": () => true,
          "Mod-Shift-h": () => true,
          "Mod-Shift-7": () => true,
          "Mod-Shift-8": () => true,
          "Mod-Shift-9": () => true,
          "Mod-k": () => true,
          // 見出し内で Tab: レベルを下げる（H2→H3）、Shift+Tab: 上げる（H3→H2）
          "Tab": ({ editor }) => {
            const { $from } = editor.state.selection;
            const node = $from.parent;
            if (node.type.name !== "heading") return false;
            const level = node.attrs.level as number;
            if (level >= 5) return true; // H5 が最大
            return editor.chain().focus().setHeading({ level: (level + 1) as 1|2|3|4|5 }).run();
          },
          "Shift-Tab": ({ editor }) => {
            const { $from } = editor.state.selection;
            const node = $from.parent;
            if (node.type.name !== "heading") return false;
            const level = node.attrs.level as number;
            if (level <= 1) return true; // H1 が最小
            return editor.chain().focus().setHeading({ level: (level - 1) as 1|2|3|4|5 }).run();
          },
          // Alt+Up/Down: ブロックを上下に移動
          "Alt-ArrowUp": ({ editor }) => {
            const { $from } = editor.state.selection;
            const curStart = $from.before(1);
            if (curStart <= 0) return true;
            const curNode = $from.node(1);
            const $prev = editor.state.doc.resolve(curStart - 1);
            const prevStart = $prev.before(1);
            const prevNode = $prev.node(1);
            const { tr } = editor.state;
            tr.replaceWith(prevStart, curStart + curNode.nodeSize, Fragment.from([curNode, prevNode]));
            tr.setSelection(TextSelection.near(tr.doc.resolve(prevStart + 1)));
            editor.view.dispatch(tr.scrollIntoView());
            return true;
          },
          "Alt-ArrowDown": ({ editor }) => {
            const { $from } = editor.state.selection;
            const curStart = $from.before(1);
            const curNode = $from.node(1);
            const curEnd = curStart + curNode.nodeSize;
            if (curEnd >= editor.state.doc.content.size) return true;
            const $next = editor.state.doc.resolve(curEnd + 1);
            const nextNode = $next.node(1);
            const nextEnd = curEnd + nextNode.nodeSize;
            const { tr } = editor.state;
            tr.replaceWith(curStart, nextEnd, Fragment.from([nextNode, curNode]));
            const newPos = curStart + nextNode.nodeSize + 1;
            tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(newPos, tr.doc.content.size))));
            editor.view.dispatch(tr.scrollIntoView());
            return true;
          },
          // Shift+Alt+Up/Down: ブロックを上下に複製
          "Shift-Alt-ArrowUp": ({ editor }) => {
            const { $from } = editor.state.selection;
            const pos = $from.before(1);
            const node = $from.node(1);
            const { tr } = editor.state;
            tr.insert(pos, node.copy(node.content));
            // カーソルを複製した上のノードに配置
            tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
            editor.view.dispatch(tr.scrollIntoView());
            return true;
          },
          "Shift-Alt-ArrowDown": ({ editor }) => {
            const { $from } = editor.state.selection;
            const pos = $from.before(1);
            const node = $from.node(1);
            const afterPos = pos + node.nodeSize;
            const { tr } = editor.state;
            tr.insert(afterPos, node.copy(node.content));
            // カーソルを複製した下のノードに配置
            tr.setSelection(TextSelection.near(tr.doc.resolve(afterPos + 1)));
            editor.view.dispatch(tr.scrollIntoView());
            return true;
          },
          // Ctrl+Enter: カーソル位置の下に空行を挿入
          "Mod-Enter": ({ editor }) => {
            const { $from } = editor.state.selection;
            const endOfBlock = $from.end(1);
            const { tr } = editor.state;
            const emptyParagraph = editor.state.schema.nodes.paragraph.create();
            tr.insert(endOfBlock + 1, emptyParagraph);
            tr.setSelection(TextSelection.near(tr.doc.resolve(endOfBlock + 2)));
            editor.view.dispatch(tr.scrollIntoView());
            return true;
          },
          // Ctrl+Shift+Enter: カーソル位置の上に空行を挿入
          "Mod-Shift-Enter": ({ editor }) => {
            const { $from } = editor.state.selection;
            const startOfBlock = $from.before(1);
            const { tr } = editor.state;
            const emptyParagraph = editor.state.schema.nodes.paragraph.create();
            tr.insert(startOfBlock, emptyParagraph);
            tr.setSelection(TextSelection.near(tr.doc.resolve(startOfBlock + 1)));
            editor.view.dispatch(tr.scrollIntoView());
            return true;
          },
          // Ctrl+L: 現在の行（ブロック）を選択
          "Mod-l": ({ editor }) => {
            const { $from } = editor.state.selection;
            const start = $from.before(1);
            const node = $from.node(1);
            const end = start + node.nodeSize;
            const { tr } = editor.state;
            tr.setSelection(TextSelection.create(tr.doc, start, end));
            editor.view.dispatch(tr);
            return true;
          },
          // Ctrl+D: カーソル位置の単語を選択
          "Mod-d": ({ editor }) => {
            const { $from, from, to } = editor.state.selection;
            if (from !== to) return false; // 既に選択がある場合はデフォルト動作
            const text = $from.parent.textContent;
            const offset = $from.parentOffset;
            // 単語の境界を検出
            const wordRe = /[\w\u3000-\u9FFF\uF900-\uFAFF]+/g;
            let match: RegExpExecArray | null;
            while ((match = wordRe.exec(text)) !== null) {
              if (match.index <= offset && match.index + match[0].length >= offset) {
                const parentStart = from - offset;
                const wordStart = parentStart + match.index;
                const wordEnd = parentStart + match.index + match[0].length;
                const { tr } = editor.state;
                tr.setSelection(TextSelection.create(tr.doc, wordStart, wordEnd));
                editor.view.dispatch(tr);
                return true;
              }
            }
            return true;
          },
        };
      },
    }),
    AdmonitionBlockquote,
    CodeBlockWithMermaid.configure({ lowlight }),
    Highlight.configure({ multicolor: false }),
    Underline,
    LinkExtension.configure({ openOnClick: false, validate: () => true, isAllowedUri: () => true }),
    CustomImage.configure({ inline: false, allowBase64: true }),
    TaskList,
    TaskItem.configure({
      nested: true,
      onReadOnlyChecked: options?.disableCheckboxToggle ? () => false : () => true,
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
    FootnoteRef,
    HeadingNumberExtension,
  ];
  if (!options?.disableComments) {
    extensions.push(CommentHighlight, CommentPoint, CommentDataPlugin);
  }
  return extensions;
}
