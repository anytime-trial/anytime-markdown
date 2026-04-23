import { mergeAttributes,Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type MarkdownIt from "markdown-it";

import { ImageRowNodeView } from "./ImageRowNodeView";
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
      mergeAttributes(HTMLAttributes, { "data-image-row": "", class: "image-row" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageRowNodeView);
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
