import CodeBlock from "@tiptap/extension-code-block";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockNodeView } from "./MermaidNodeView";

export const CodeBlockWithMermaid = CodeBlock.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: { default: false, rendered: false },
      codeCollapsed: { default: true, rendered: false },
      width: { default: null, rendered: false },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
});
