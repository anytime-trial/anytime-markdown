import { mergeAttributes,Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type MarkdownIt from "markdown-it";

import { ImageRowNodeView } from "./ImageRowNodeView";
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
      },
    };
  },
});
