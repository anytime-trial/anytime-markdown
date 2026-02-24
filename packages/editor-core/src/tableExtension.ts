import { Table } from "@tiptap/extension-table";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TableNodeView } from "./TableNodeView";
import type { MdSerializerState } from "./types";
import type { Node as PMNode } from "@tiptap/pm/model";

export const CustomTable = Table.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: { default: false, rendered: false },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView);
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
                state.renderInline(cellContent);
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
