import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { DetailsNodeView } from "../components/DetailsNodeView";

export const DetailsSummary = Node.create({
  name: "detailsSummary",
  content: "inline*",
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "summary",
      mergeAttributes(HTMLAttributes, {
        style: "cursor: default; font-weight: 600;",
      }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("<summary>");
          state.text(node.textContent, false);
          state.write("</summary>\n\n");
        },
        parse: {},
      },
    };
  },
});

export const Details = Node.create({
  name: "details",
  group: "block",
  content: "detailsSummary block+",
  defining: true,

  parseHTML() {
    return [{ tag: "details" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes(HTMLAttributes, { open: "" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DetailsNodeView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("<details>\n");
          state.renderContent(node);
          state.ensureNewLine();
          state.write("</details>");
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
