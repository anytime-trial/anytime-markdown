import Image from "@anytime-markdown/markdown-extension-image";
import type { ImageOptions } from "@anytime-markdown/markdown-extension-image";

import { createImageBlockNodeView } from "./components/ImageBlockContent";
import { imageMarkdownSpec } from "./markdownItRules/imageSerializer";

/** CustomImage の拡張オプション（ImageOptions に i18n 用の t を追加。CodeBlockWithMermaid と同パターン）。 */
export interface CustomImageOptions extends ImageOptions {
  /** content-only NodeView（createImageBlockNodeView）の i18n 配線用。未 configure 時は null。 */
  t: ((key: string) => string) | null;
}

export const CustomImage = Image.extend<CustomImageOptions>({
  draggable: true,

  addOptions() {
    const parent = (this.parent?.() ?? {}) as ImageOptions;
    return {
      ...parent,
      t: null,
    };
  },

  addStorage() {
    return {
      onEditImage: null as ((data: { pos: number; src: string; alt: string }) => void) | null,
      markdown: imageMarkdownSpec,
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
    return (props) => createImageBlockNodeView({ ...props, t: this.options.t });
  },
});
