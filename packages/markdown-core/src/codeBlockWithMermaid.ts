import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { CodeBlockNodeView } from "./MermaidNodeView";
import {
  EMBED_DATA_ATTR,
  installEmbedFenceRenderer,
  type MarkdownItLike,
} from "./utils/embedFenceRenderer";

interface MarkdownSerializerState {
  write: (text: string) => void;
  text: (text: string, escape?: boolean) => void;
  ensureNewLine: () => void;
  closeBlock: (node: ProseMirrorNode) => void;
}

export const CodeBlockWithMermaid = CodeBlockLowlight.extend({
  draggable: true,

  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
    const parentLanguage = parent.language as Record<string, unknown> | undefined;
    return {
      ...parent,
      language: {
        ...(parentLanguage ?? {}),
        default: null,
        parseHTML: (element: HTMLElement) => {
          const code = element.querySelector("code") ?? element;
          const embedInfo = code.getAttribute(EMBED_DATA_ATTR);
          if (embedInfo) return embedInfo;
          const classes = (code.getAttribute("class") ?? "").split(/\s+/);
          for (const cls of classes) {
            if (cls.startsWith("language-")) {
              return cls.slice("language-".length);
            }
          }
          return null;
        },
        renderHTML: (attrs: { language?: string | null }) => {
          if (!attrs.language) return {};
          const first = attrs.language.split(/\s+/)[0];
          return { class: `language-${first}` };
        },
      },
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
        parse: {
          setup(md: MarkdownItLike) {
            installEmbedFenceRenderer(md);
          },
        },
      },
    };
  },
});
