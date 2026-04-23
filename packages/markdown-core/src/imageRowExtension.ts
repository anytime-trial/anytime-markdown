import { mergeAttributes,Node } from "@tiptap/core";

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
});
