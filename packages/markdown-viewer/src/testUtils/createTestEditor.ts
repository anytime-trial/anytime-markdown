import { Editor, Extension, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { CustomImage } from "../imageExtension";
import { ImageRow } from "../imageRowExtension";
import { imagePastePlugin } from "../plugins/imagePastePlugin";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Mark } from "@tiptap/pm/model";

const ImagePasteTest = Extension.create({
  name: "imagePasteTest",
  addProseMirrorPlugins() { return [imagePastePlugin]; },
});

/** taskList にも tight 属性を追加（tiptap-markdown は bulletList/orderedList のみ対象のため） */
const TaskListTight = Extension.create({
  name: "taskListTight",
  addGlobalAttributes() {
    return [{
      types: ["taskList"],
      attributes: {
        tight: {
          default: true,
          parseHTML: (el: HTMLElement) =>
            el.dataset.tight === "true" || !el.querySelector("p"),
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.tight ? { class: "tight", "data-tight": "true" } : {},
        },
      },
    }];
  },
});

/** insertContent 経由で残るリスト内テキストノードの末尾 \n を除去する */
const ListTextCleanup = Extension.create({
  name: "listTextCleanup",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("listTextCleanup"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const changes: { from: number; to: number; text: string; marks: readonly Mark[] }[] = [];
          newState.doc.descendants((node, pos) => {
            if (!node.isText || !node.text?.endsWith("\n")) return;
            const $pos = newState.doc.resolve(pos);
            if ($pos.parent.type.name !== "paragraph") return;
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type.name === "listItem") {
                const trimmed = node.text.trimEnd();
                changes.push({ from: pos, to: pos + node.text.length, text: trimmed, marks: [...node.marks] });
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

interface CreateTestEditorOptions {
  content?: string;
  withTable?: boolean;
  withMarkdown?: boolean;
}

export function createTestEditor({
  content = "",
  withTable = false,
  withMarkdown = false,
}: CreateTestEditorOptions = {}): Editor {
  const extensions: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5] },
      // withMarkdown 時は Link/Underline を個別設定で追加するため StarterKit 側を無効化
      ...(withMarkdown ? { link: false, underline: false } : {}),
    }),
  ];

  if (withTable) {
    extensions.push(TableKit);
  }

  if (withMarkdown) {
    extensions.push(
      Markdown.configure({ html: true }),
      ImageRow,
      CustomImage.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, isAllowedUri: () => true }),
      Highlight,
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      TaskListTight,
      ListTextCleanup,
      ImagePasteTest,
    );
  }

  return new Editor({ extensions, content });
}

/** テキストノードを検索し、その位置を返す */
export function findTextPosition(editor: Editor, text: string): number {
  let foundPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (foundPos !== -1) return false;
    if (node.isText && node.text?.includes(text)) {
      foundPos = pos;
      return false;
    }
  });
  return foundPos;
}

/** テーブルの内容を2次元配列で取得 */
export function getTableContent(editor: Editor): string[][] {
  const rows: string[][] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableRow") {
      const cells: string[] = [];
      node.forEach((cell) => {
        cells.push(cell.textContent);
      });
      rows.push(cells);
      return false;
    }
  });
  return rows;
}
