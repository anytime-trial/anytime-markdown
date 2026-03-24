import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { CodeBlockNodeView } from "./MermaidNodeView";

interface MarkdownSerializerState {
  write: (text: string) => void;
  text: (text: string, escape?: boolean) => void;
  ensureNewLine: () => void;
  closeBlock: (node: ProseMirrorNode) => void;
}

export const CodeBlockWithMermaid = CodeBlockLowlight.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: { default: false, rendered: false },
      codeCollapsed: { default: true, rendered: false },
      width: { default: null, rendered: false },
      autoEditOpen: { default: false, rendered: false },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          if (node.attrs.language === "math") {
            state.write("$$\n");
            state.text(node.textContent, false);
            state.ensureNewLine();
            state.write("$$");
            state.closeBlock(node);
          } else {
            state.write(`\`\`\`${node.attrs.language || ""}\n`);
            state.text(node.textContent, false);
            state.ensureNewLine();
            state.write("```");
            state.closeBlock(node);
          }
        },
        parse: {},
      },
    };
  },
});
