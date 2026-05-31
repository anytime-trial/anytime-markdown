import { Table } from "@tiptap/extension-table";
import type { Node as PMNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { tableCellModePlugin } from "./plugins/tableCellMode/tableCellModePlugin";
import { TableNodeView } from "./TableNodeView";
import type { MdSerializerState } from "./types";

export interface CustomTableOptions {
  resizable?: boolean;
  /** スプレッドシートのグリッド行数 */
  gridRows?: number;
  /** スプレッドシートのグリッド列数 */
  gridCols?: number;
}

export const CustomTable = Table.extend<CustomTableOptions>({
  draggable: true,

  addOptions() {
    return {
      ...this.parent?.(),
      gridRows: undefined,
      gridCols: undefined,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: { default: false, rendered: false },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView);
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? [];
    // tableCellModePlugin を最優先で登録（tableEditing より先にイベントをインターセプト）
    return [tableCellModePlugin(), ...parentPlugins];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MdSerializerState, node: PMNode) {
          state.inTable = true;
          node.forEach((row: PMNode, _p: number, i: number) => {
            state.write("| ");
            row.forEach((col: PMNode, _p2: number, j: number) => {
              if (j) state.write(" | ");
              const cellContent = col.firstChild;
              if (cellContent?.textContent.trim()) {
                // GFM のセル区切り `|` と衝突するため、renderInline がセル本文として
                // 書き込んだ範囲だけを後から `\|` にエスケープする。state.write で書く
                // セル境界 `| ` / ` | ` / ` |` は範囲外なので影響しない。
                const before = state.out.length;
                state.renderInline(cellContent);
                const written = state.out.slice(before);
                const escaped = written.replaceAll(/(?<!\\)\|/g, String.raw`\|`);
                if (escaped !== written) {
                  state.out = state.out.slice(0, before) + escaped;
                }
              }
            });
            state.write(" |");
            state.ensureNewLine();
            if (!i) {
              const delimiters: string[] = [];
              row.forEach((col: PMNode) => {
                const align = col.attrs.textAlign;
                if (align === "center") delimiters.push(":---:");
                else if (align === "right") delimiters.push("---:");
                else delimiters.push("---");
              });
              state.write(`| ${delimiters.join(" | ")} |`);
              state.ensureNewLine();
            }
          });
          state.closeBlock(node);
          state.inTable = false;
        },
        parse: {},
      },
    };
  },
});
