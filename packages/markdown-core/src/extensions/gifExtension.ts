import { mergeAttributes,Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { GifNodeView } from "../components/GifNodeView";
import type { MdSerializerState } from "../types";

export const GifBlock = Node.create({
  name: "gifBlock",
  group: "block",
  draggable: true,
  atom: true,

  addStorage() {
    return {
      markdown: {
        serialize(state: MdSerializerState, node: PMNode) {
          const src = (node.attrs.src as string) ?? "";
          const alt = (node.attrs.alt as string) ?? "";
          state.write(`![${alt}](${src})`);
          state.closeBlock(node);
        },
        parse: {
          // Markdown → HTML のパースは tiptap-markdown のデフォルト image 処理に任せ、
          // parseHTML の img[src$=".gif"] で gifBlock にマッチさせる
        },
      },
    };
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      width: { default: null },
      autoEditOpen: { default: false, rendered: false },
      gifSettings: {
        default: null,
        parseHTML: (element: HTMLElement) => element.dataset.gifSettings ?? null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.gifSettings) return {};
          return { "data-gif-settings": attributes.gifSettings as string };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        // data-gif-settings 属性があれば GIF ブロックとして認識
        tag: "img[data-gif-settings]",
        getAttrs: (element: HTMLElement) => ({
          src: element.getAttribute("src") || "",
          alt: element.getAttribute("alt") || "",
          width: element.getAttribute("width") || null,
          gifSettings: element.dataset.gifSettings ?? null,
        }),
      },
      {
        // .gif 拡張子の画像も GIF ブロックとして認識
        tag: 'img[src$=".gif"]',
        getAttrs: (element: HTMLElement) => {
          const src = element.getAttribute("src");
          if (!src?.endsWith(".gif")) return false;
          return {
            src,
            alt: element.getAttribute("alt") || "",
            width: element.getAttribute("width") || null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { src: HTMLAttributes.src })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GifNodeView);
  },
});
