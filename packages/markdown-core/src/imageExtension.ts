import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { ImageNodeView } from "./ImageNodeView";

export const CustomImage = Image.extend({
  draggable: true,

  addStorage() {
    return {
      onEditImage: null as ((data: { pos: number; src: string; alt: string }) => void) | null,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: { default: false, rendered: false },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("width") || element.style.width || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
      annotations: {
        default: null,
        parseHTML: (element: HTMLElement) => element.dataset.annotations ?? null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.annotations) return {};
          return { "data-annotations": attributes.annotations };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
