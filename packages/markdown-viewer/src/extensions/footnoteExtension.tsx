/**
 * Footnote Reference Extension
 *
 * MathInline と同じパターンで脚注参照 [^id] をサポートする。
 * - sanitizeMarkdown で [^id] → <sup data-footnote-ref="id">id</sup> に前処理
 * - parseHTML で <sup data-footnote-ref> を検出
 * - InputRule: [^id] パターンで FootnoteRef ノードに変換
 * - serialize: [^id] を出力
 * - ホバーで脚注定義テキストをツールチップ表示
 * - クリックで定義内のURLを新しいタブで開く
 *
 * NodeView は native ProseMirror NodeView（React 非依存）。テーマ色は CSS 変数
 * `--am-color-primary-main`（applyEditorThemeCssVars 注入）を参照する。
 */
import { InputRule, Node } from "@anytime-markdown/markdown-core";
import type { NodeViewRendererProps } from "@anytime-markdown/markdown-core";
import type { Node as ProseMirrorNode } from "@anytime-markdown/markdown-pm/model";
import type { NodeView } from "@anytime-markdown/markdown-pm/view";

/** ProseMirror ドキュメントから脚注定義テキスト（[^id]: 以降）を検索 */
export function findFootnoteDefinition(
  doc: ProseMirrorNode,
  noteId: string,
): string | null {
  const pattern = `[^${noteId}]:`;
  let result: string | null = null;
  doc.descendants((node) => {
    if (result !== null) return false;
    if (node.type.name === "paragraph") {
      const text = node.textContent;
      const idx = text.indexOf(pattern);
      if (idx >= 0) {
        let defText = text.slice(idx + pattern.length).trim();
        // 同一段落に別の脚注定義 [^id]: が続く場合、そこで打ち切る
        const nextDef = defText.search(/\[\^[^\]]+\]:/);
        if (nextDef >= 0) {
          defText = defText.slice(0, nextDef).trim();
        }
        result = defText;
        return false;
      }
    }
  });
  return result;
}

/** テキストから最初の URL を抽出 */
export function extractUrlFromText(text: string): string | null {
  const match = /https?:\/\/[^\s)>\]]+/.exec(text);
  return match ? match[0] : null;
}

/** FootnoteRef の inline スタイルを native DOM 要素へ適用する */
function applyFootnoteRefStyle(el: HTMLElement): void {
  el.style.display = "inline";
  el.style.fontSize = "0.75em";
  el.style.verticalAlign = "super";
  el.style.lineHeight = "1";
  el.style.color = "var(--am-color-primary-main)";
  el.style.fontWeight = "600";
  el.style.borderRadius = "2px";
  el.style.paddingLeft = "2px";
  el.style.paddingRight = "2px";
}

/**
 * FootnoteRef の native ProseMirror NodeView。
 *
 * React（ReactNodeViewRenderer）を使わず DOM を直接構築する。脚注定義テキストは
 * クリック・ホバー時に毎回 `editor.state.doc` から再計算するため、定義の編集にも追従する。
 * ツールチップは native `title` 属性で表示する。
 */
function createFootnoteRefNodeView({
  node,
  editor,
}: Pick<NodeViewRendererProps, "node" | "editor">): NodeView {
  const dom = document.createElement("span");
  let noteId = node.attrs.noteId as string;
  applyFootnoteRefStyle(dom);
  dom.setAttribute("data-footnote-ref", noteId);
  dom.textContent = `[${noteId}]`;

  const refreshTooltip = (): void => {
    const def = findFootnoteDefinition(editor.state.doc, noteId) ?? "";
    dom.title = def;
    dom.style.cursor = def && extractUrlFromText(def) ? "pointer" : "default";
  };
  refreshTooltip();

  const handleClick = (e: MouseEvent): void => {
    const def = findFootnoteDefinition(editor.state.doc, noteId);
    if (!def) return;
    const url = extractUrlFromText(def);
    if (!url) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const handleEnter = (): void => refreshTooltip();
  dom.addEventListener("click", handleClick);
  dom.addEventListener("pointerenter", handleEnter);

  return {
    dom,
    update(updatedNode) {
      if (updatedNode.type.name !== "footnoteRef") return false;
      noteId = updatedNode.attrs.noteId as string;
      dom.setAttribute("data-footnote-ref", noteId);
      dom.textContent = `[${noteId}]`;
      refreshTooltip();
      return true;
    },
    selectNode() {
      dom.style.outline = "2px solid var(--am-color-primary-main)";
      dom.style.outlineOffset = "1px";
    },
    deselectNode() {
      dom.style.outline = "";
      dom.style.outlineOffset = "";
    },
    destroy() {
      dom.removeEventListener("click", handleClick);
      dom.removeEventListener("pointerenter", handleEnter);
    },
  };
}

export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      noteId: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "sup[data-footnote-ref]",
        getAttrs: (el) => {
          if (typeof el === "string") return false;
          return { noteId: el.dataset.footnoteRef ?? "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", { "data-footnote-ref": HTMLAttributes.noteId }, HTMLAttributes.noteId];
  },

  addNodeView() {
    return (props) => createFootnoteRefNodeView(props);
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\^([^\]]+)\]$/,
        handler: ({ state, range, match, chain }) => {
          const noteId = match[1];
          if (!noteId) return;
          const node = state.schema.nodes.footnoteRef.create({ noteId });
          chain().insertContentAt({ from: range.from, to: range.to }, node.toJSON()).run();
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (text: string) => void },
          node: { attrs: { noteId: string } },
        ) {
          state.write(`[^${node.attrs.noteId}]`);
        },
        parse: {},
      },
    };
  },
});
