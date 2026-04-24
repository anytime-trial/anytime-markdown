import { mergeAttributes,Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type MarkdownIt from "markdown-it";

import type { MarkdownSerializerLike } from "./markdownItRules/imageSerializer";
import { wrapImageRow } from "./markdownItRules/wrapImageRow";

export const ImageRow = Node.create({
  name: "imageRow",
  group: "block",
  content: "image+",
  draggable: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-image-row]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-image-row": "",
        class: "image-row",
        role: "group",
        "aria-label": "画像行",
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("imageRowAutoExpand"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = newState.tr;
          let modified = false;
          const rows: Array<{ pos: number; size: number; children: ProseMirrorNode[] }> = [];
          newState.doc.descendants((node, pos) => {
            if (node.type.name === "imageRow") {
              const children: ProseMirrorNode[] = [];
              node.forEach((child) => {
                // placeholder（src が空の image）は children としてカウントしない
                if (child.type.name === "image" && child.attrs.src) {
                  children.push(child);
                }
              });
              rows.push({ pos, size: node.nodeSize, children });
              return false;
            }
          });
          rows.reverse().forEach(({ pos, size, children }) => {
            if (children.length === 0) {
              tr.delete(pos, pos + size);
              modified = true;
            } else if (children.length === 1) {
              tr.replaceWith(pos, pos + size, children[0]);
              modified = true;
            }
          });
          return modified ? tr : null;
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        parse: {
          setup: (md: MarkdownIt) => {
            wrapImageRow(md);
          },
        },
        serialize(state: MarkdownSerializerLike, node: ProseMirrorNode) {
          node.forEach((child) => {
            if (child.type.name !== "image") return;
            const alt = String(child.attrs.alt ?? "");
            const src = String(child.attrs.src ?? "").replace(/[()]/g, "\\$&");
            const title = child.attrs.title
              ? ` "${String(child.attrs.title).replace(/"/g, '\\"')}"`
              : "";
            state.write(`![${alt.replace(/([\\[\]])/g, "\\$1")}](${src}${title})`);
          });
          state.closeBlock(node);
        },
      },
    };
  },
});
