/**
 * ブロック要素（NodeView）の前後で GapCursor を表示し、
 * GapCursor 状態でのキー操作を処理する拡張。
 */
import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

/** GapCursor 対象のブロックノードタイプ名 */
const BLOCK_NODE_TYPES = new Set(["codeBlock", "image", "gifBlock", "table"]);

/** ArrowRight でブロック内に入れないプレビュー系言語 */
const PREVIEW_LANGUAGES = new Set(["math", "mermaid", "plantuml", "html"]);

/** GapCursor 要素をブロック要素の左側に配置する */
function adjustGapCursorPosition(dom: HTMLElement) {
  requestAnimationFrame(() => {
    const el = dom.querySelector(".ProseMirror-gapcursor") as HTMLElement | null;
    if (!el) return;
    const sibling = el.nextElementSibling as HTMLElement | null;
    if (!sibling) return;
    el.style.position = "absolute";
    el.style.top = `${sibling.offsetTop}px`;
    el.style.left = `${sibling.offsetLeft - 4}px`;
    el.style.height = `${sibling.offsetHeight}px`;
    el.style.width = "0";
  });
}

const BLOCK_GAP_KEY = new PluginKey("blockGapCursor");

export const BlockGapCursorExtension = Extension.create({
  name: "blockGapCursor",

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: BLOCK_GAP_KEY,
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              const { state } = view;
              const { selection } = state;
              const isGap = selection instanceof GapCursor;

              // --- GapCursor 状態でのキー操作 ---
              if (isGap) {
                const pos = selection.from;

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  const nodeAfter = state.doc.nodeAt(pos);
                  if (nodeAfter) {
                    const afterBlock = pos + nodeAfter.nodeSize;
                    if (afterBlock <= state.doc.content.size) {
                      const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(afterBlock), 1));
                      view.dispatch(tr);
                    }
                  }
                  return true;
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (pos > 0) {
                    const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(pos), -1));
                    view.dispatch(tr);
                  }
                  return true;
                }

                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  const nodeAfter = state.doc.nodeAt(pos);
                  if (nodeAfter) {
                    const lang = nodeAfter.attrs.language as string | undefined;
                    const canEnter = !nodeAfter.isAtom && !(nodeAfter.type.name === "codeBlock" && lang && PREVIEW_LANGUAGES.has(lang));
                    if (canEnter) {
                      // コード編集可能なブロック（通常コードブロック、テーブル）は内部に入る
                      const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(pos + 1), 1));
                      view.dispatch(tr);
                    } else {
                      // atom ノードやプレビュー系ブロックはスキップ
                      const afterBlock = pos + nodeAfter.nodeSize;
                      if (afterBlock <= state.doc.content.size) {
                        const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(afterBlock), 1));
                        view.dispatch(tr);
                      }
                    }
                  }
                  return true;
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  const paragraphType = state.schema.nodes.paragraph;
                  if (paragraphType) {
                    const { tr } = state;
                    tr.insert(pos, paragraphType.create());
                    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
                    view.dispatch(tr);
                  }
                  return true;
                }

                return false;
              }

              // --- 通常カーソルからブロック横に GapCursor を設定 ---
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "ArrowLeft") return false;

              const { $from, empty } = selection;
              if (!empty || $from.depth < 1) return false;
              if ($from.parent.type.name === "codeBlock") return false;

              if (event.key === "ArrowDown") {
                if (!view.endOfTextblock("down")) return false;
                const pos = $from.after($from.depth);
                if (pos >= state.doc.content.size) return false;
                const nodeAfter = state.doc.nodeAt(pos);
                if (!nodeAfter || !BLOCK_NODE_TYPES.has(nodeAfter.type.name)) return false;

                event.preventDefault();
                const tr = state.tr.setSelection(new GapCursor(state.doc.resolve(pos)));
                view.dispatch(tr.scrollIntoView());
                adjustGapCursorPosition(view.dom);
                return true;
              }

              if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                // ArrowLeft はカーソルが段落の先頭にあるときのみ
                if (event.key === "ArrowLeft" && $from.parentOffset > 0) return false;

                const currentIndex = $from.index(0);
                if (currentIndex <= 0) return false;
                const prevNode = state.doc.child(currentIndex - 1);
                if (!BLOCK_NODE_TYPES.has(prevNode.type.name)) return false;

                // ブロックの開始位置 = 前のブロックノードまでのサイズ合計
                let prevStart = 0;
                for (let i = 0; i < currentIndex - 1; i++) {
                  prevStart += state.doc.child(i).nodeSize;
                }

                event.preventDefault();
                const tr = state.tr.setSelection(new GapCursor(state.doc.resolve(prevStart)));
                view.dispatch(tr.scrollIntoView());
                adjustGapCursorPosition(view.dom);
                return true;
              }

              return false;
            },
          },
        },
      }),
    ];
  },
});
