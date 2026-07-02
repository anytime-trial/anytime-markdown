import { CodeBlockLowlight } from "@anytime-markdown/markdown-extension-code-block-lowlight";
import type { CodeBlockLowlightOptions } from "@anytime-markdown/markdown-extension-code-block-lowlight";
import type { Node as ProseMirrorNode } from "@anytime-markdown/markdown-pm/model";

import { createCodeBlockNodeView } from "./components/codeblock/CodeBlockBlockContent";
import {
  EMBED_DATA_ATTR,
  installEmbedFenceRenderer,
  type MarkdownItLike,
} from "@anytime-markdown/markdown-viewer";

interface MarkdownSerializerState {
  write: (text: string) => void;
  text: (text: string, escape?: boolean) => void;
  ensureNewLine: () => void;
  closeBlock: (node: ProseMirrorNode) => void;
}

/** CodeBlockLowlightOptions に i18n 用の t を追加した拡張オプション（MdEmbed と同パターン）。 */
export interface CodeBlockWithMermaidOptions extends CodeBlockLowlightOptions {
  /** content-only NodeView（createGraphPreview 等）の i18n 配線用。未 configure 時は null。 */
  t: ((key: string) => string) | null;
}

export const CodeBlockWithMermaid = CodeBlockLowlight.extend<CodeBlockWithMermaidOptions>({
  draggable: true,

  addOptions() {
    const parent = (this.parent?.() ?? {}) as CodeBlockLowlightOptions;
    return {
      ...parent,
      t: null,
    };
  },

  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
    const parentLanguage = parent.language as Record<string, unknown> | undefined;
    return {
      ...parent,
      language: {
        ...parentLanguage,
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
      // 反転アーキテクチャ: math グラフ表示の ON/OFF。overlay のトグルが書き、
      // native content が GraphView の mount/unmount を駆動する（旧 React 経路は未使用）。
      graphEnabled: { default: false, rendered: false },
    };
  },

  addNodeView() {
    // 反転アーキテクチャ: content-only native NodeView（React 非依存）。
    // 編集 chrome は脱React の createCodeBlockChrome（ツールバー）と、RichMarkdownEditorPage
    // がマウントする CodeDialogHost（編集ダイアログ・React host）が供給する。
    // t は options 経由（MdEmbed と同パターン）で content 内 i18n（createGraphPreview 等）へ配線する。
    return (props) => createCodeBlockNodeView({ ...props, t: this.options.t });
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
