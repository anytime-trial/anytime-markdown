import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extensions: any[] = [
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
    extensions.push(Markdown.configure({ html: true }));
    extensions.push(Image);
    extensions.push(Link.configure({ openOnClick: false }));
    extensions.push(Highlight);
    extensions.push(Underline);
    extensions.push(TaskList);
    extensions.push(TaskItem.configure({ nested: true }));
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
