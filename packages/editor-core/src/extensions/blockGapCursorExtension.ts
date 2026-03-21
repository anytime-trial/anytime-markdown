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

import type { EditorView } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";

/** GapCursor 状態での ArrowDown 処理 */
function handleGapArrowDown(view: EditorView, state: EditorState, pos: number): boolean {
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

/** GapCursor 状態での ArrowRight 処理 */
function handleGapArrowRight(view: EditorView, state: EditorState, pos: number): boolean {
  const nodeAfter = state.doc.nodeAt(pos);
  if (!nodeAfter) return true;
  const lang = nodeAfter.attrs.language as string | undefined;
  const canEnter = !nodeAfter.isAtom && !(nodeAfter.type.name === "codeBlock" && lang && PREVIEW_LANGUAGES.has(lang));
  if (canEnter) {
    const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(pos + 1), 1));
    view.dispatch(tr);
  } else {
    const afterBlock = pos + nodeAfter.nodeSize;
    if (afterBlock <= state.doc.content.size) {
      const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(afterBlock), 1));
      view.dispatch(tr);
    }
  }
  return true;
}

/** GapCursor 状態での Enter 処理 */
function handleGapEnter(view: EditorView, state: EditorState, pos: number): boolean {
  const paragraphType = state.schema.nodes.paragraph;
  if (paragraphType) {
    const { tr } = state;
    tr.insert(pos, paragraphType.create());
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    view.dispatch(tr);
  }
  return true;
}

/** 通常カーソルからブロック下方向への GapCursor 設定 */
function handleNormalArrowDown(view: EditorView, state: EditorState): boolean {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth < 1) return false;
  if ($from.parent.type.name === "codeBlock") return false;
  if (!view.endOfTextblock("down")) return false;
  const pos = $from.after($from.depth);
  if (pos >= state.doc.content.size) return false;
  const nodeAfter = state.doc.nodeAt(pos);
  if (!nodeAfter || !BLOCK_NODE_TYPES.has(nodeAfter.type.name)) return false;

  const tr = state.tr.setSelection(new GapCursor(state.doc.resolve(pos)));
  view.dispatch(tr.scrollIntoView());
  adjustGapCursorPosition(view.dom);
  return true;
}

/** 通常カーソルからブロック上方向への GapCursor 設定 */
function handleNormalArrowUpLeft(view: EditorView, state: EditorState, key: string): boolean {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth < 1) return false;
  if ($from.parent.type.name === "codeBlock") return false;
  if (key === "ArrowLeft" && $from.parentOffset > 0) return false;

  const currentIndex = $from.index(0);
  if (currentIndex <= 0) return false;
  const prevNode = state.doc.child(currentIndex - 1);
  if (!BLOCK_NODE_TYPES.has(prevNode.type.name)) return false;

  let prevStart = 0;
  for (let i = 0; i < currentIndex - 1; i++) {
    prevStart += state.doc.child(i).nodeSize;
  }

  const tr = state.tr.setSelection(new GapCursor(state.doc.resolve(prevStart)));
  view.dispatch(tr.scrollIntoView());
  adjustGapCursorPosition(view.dom);
  return true;
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
                const key = event.key;
                if (key === "ArrowDown" || key === "ArrowUp" || key === "ArrowRight" || key === "Enter") {
                  event.preventDefault();
                }
                if (key === "ArrowDown") return handleGapArrowDown(view, state, pos);
                if (key === "ArrowUp") {
                  if (pos > 0) {
                    const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(pos), -1));
                    view.dispatch(tr);
                  }
                  return true;
                }
                if (key === "ArrowRight") return handleGapArrowRight(view, state, pos);
                if (key === "Enter") return handleGapEnter(view, state, pos);
                return false;
              }

              // --- 通常カーソルからブロック横に GapCursor を設定 ---
              if (event.key === "ArrowDown") {
                if (!handleNormalArrowDown(view, state)) return false;
                event.preventDefault();
                return true;
              }
              if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                if (!handleNormalArrowUpLeft(view, state, event.key)) return false;
                event.preventDefault();
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
