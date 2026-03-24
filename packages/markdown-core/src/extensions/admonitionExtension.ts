/**
 * Admonition / Callout Extension
 *
 * StarterKit の Blockquote を拡張し、GitHub 互換の `> [!NOTE]` 記法をサポートする。
 * - sanitizeMarkdown の preprocessAdmonition で前処理（> [!TYPE] → HTML blockquote）
 * - parseHTML で data-admonition-type を検出
 * - appendTransaction でユーザー入力時の [!TYPE] を検出
 * - serialize で `> [!TYPE]` ヘッダーを出力
 *
 * 対応タイプ: NOTE, TIP, IMPORTANT, WARNING, CAUTION
 */
import Blockquote from "@tiptap/extension-blockquote";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const ADMONITION_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i;
const MAX_BLOCKQUOTE_DEPTH = 6;

interface SerializerState {
  wrapBlock: (delim: string, firstDelim: string | null, node: unknown, f: () => void) => void;
  renderContent: (node: unknown) => void;
  write: (content: string) => void;
  ensureNewLine: () => void;
  closeBlock: (node: unknown) => void;
  out: string;
}

interface SerializedNode {
  attrs: { admonitionType: string | null };
}

export const AdmonitionBlockquote = Blockquote.extend({
  name: "blockquote", // 既存名を維持して StarterKit の blockquote を置換

  addAttributes() {
    return {
      admonitionType: {
        default: null,
        parseHTML: (el: HTMLElement) => el.dataset.admonitionType,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.admonitionType
            ? { "data-admonition-type": attrs.admonitionType }
            : {},
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { $from } = this.editor.state.selection;
        let bqDepth = 0;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === "blockquote") bqDepth++;
        }
        if (bqDepth >= 1 && bqDepth < MAX_BLOCKQUOTE_DEPTH) {
          return this.editor.chain().wrapIn("blockquote").run();
        }
        return false;
      },
      "Shift-Tab": () => {
        const { $from } = this.editor.state.selection;
        // 外側の blockquote が存在する場合のみ lift
        let bqCount = 0;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === "blockquote") bqCount++;
        }
        if (bqCount >= 2) {
          return this.editor.chain().lift("blockquote").run();
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("admonitionDetect"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = newState.tr;
          let modified = false;
          const modifications: Array<{
            pos: number;
            type: string;
            deleteFrom: number;
            deleteTo: number;
          }> = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "blockquote" || node.attrs.admonitionType) return;
            const first = node.firstChild;
            if (first?.type.name !== "paragraph") return;
            const text = first.textContent;
            const match = ADMONITION_RE.exec(text);
            if (!match) return;
            const textStart = pos + 2; // blockquote(1) + paragraph(1)
            modifications.push({
              pos,
              type: match[1].toLowerCase(),
              deleteFrom: textStart,
              deleteTo: textStart + match[0].length,
            });
          });

          if (modifications.length === 0) return null;
          // 後方から処理してポジションずれを防止
          for (let i = modifications.length - 1; i >= 0; i--) {
            const mod = modifications[i];
            tr.setNodeAttribute(mod.pos, "admonitionType", mod.type);
            tr.delete(mod.deleteFrom, mod.deleteTo);
            modified = true;
          }
          return modified ? tr : null;
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: SerializedNode) {
          if (node.attrs.admonitionType) {
            const type = node.attrs.admonitionType.toUpperCase();
            // firstDelim で [!TYPE] ヘッダー行を出力し、content は通常の > prefix
            state.wrapBlock("> ", `> [!${type}]\n`, node, () => {
              state.renderContent(node);
            });
            // Admonition 間に空行を確保
            state.ensureNewLine();
            state.out += "\n";
          } else {
            state.wrapBlock("> ", null, node, () => {
              state.renderContent(node);
            });
          }
        },
        parse: {},
      },
    };
  },
});
