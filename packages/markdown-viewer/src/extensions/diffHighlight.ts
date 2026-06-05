import { Extension } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";
import type { EditorView } from "@anytime-markdown/markdown-pm/view";
import { Decoration, DecorationSet } from "@anytime-markdown/markdown-pm/view";

import type { PlaceholderPosition } from "../utils/blockDiffComputation";

// Re-export for external consumers
export type { BlockDiffResult, PlaceholderPosition } from "../utils/blockDiffComputation";
export { computeBlockDiff } from "../utils/blockDiffComputation";

export const diffHighlightPluginKey = new PluginKey("diffHighlight");

// --- Tiptap Extension ---

interface DiffHighlightState {
  changedBlocks: Set<number>;
  cellDiffs: Map<number, Set<number>>;
  placeholderPositions: PlaceholderPosition[];
  side: "left" | "right";
  /** 未変更ブロック折りたたみ ON/OFF */
  collapse: boolean;
  /** 変更ブロックの前後に残すブロック数 */
  contextBlocks: number;
  /** 手動展開済みの run キー（run の先頭 blockIndex 文字列） */
  expandedRuns: Set<string>;
  /** 展開ボタンのラベルテンプレート（{count} を含む） */
  expandLabel: string;
}

const EMPTY_STATE: DiffHighlightState = {
  changedBlocks: new Set(),
  cellDiffs: new Map(),
  placeholderPositions: [],
  side: "left",
  collapse: false,
  contextBlocks: 1,
  expandedRuns: new Set(),
  expandLabel: "Show {count} unchanged blocks",
};

const LEFT_BLOCK_STYLE = "background-color: rgba(248, 81, 73, 0.10); border-radius: 4px;";
const RIGHT_BLOCK_STYLE = "background-color: rgba(46, 160, 67, 0.10); border-radius: 4px;";
const LEFT_CELL_STYLE = "background-color: rgba(248, 81, 73, 0.18);";
const RIGHT_CELL_STYLE = "background-color: rgba(46, 160, 67, 0.18);";

/** これ未満の未変更ブロック run は畳まない */
const MIN_COLLAPSE_BLOCKS = 2;

// --- meta（プラグインへの指示）の型 ---

type DiffHighlightMeta =
  | { kind: "highlight"; changedBlocks: Set<number>; cellDiffs: Map<number, Set<number>>; placeholderPositions: PlaceholderPosition[]; side: "left" | "right" }
  | { kind: "collapse"; collapse: boolean; contextBlocks: number; expandLabel: string }
  | { kind: "toggleRun"; key: string }
  | { kind: "clear" };

declare module "@anytime-markdown/markdown-core" {
  interface Commands<ReturnType> {
    diffHighlight: {
      setDiffHighlight: (
        result: import("../utils/blockDiffComputation").BlockDiffResult,
        side: "left" | "right",
      ) => ReturnType;
      clearDiffHighlight: () => ReturnType;
      setDiffCollapse: (collapse: boolean, contextBlocks: number, expandLabel: string) => ReturnType;
    };
  }
}

/** ブロック変更のデコレーションを作成する */
function buildBlockDecorations(
  node: PMNode, pos: number, blockIndex: number,
  changedBlocks: Set<number>, blockStyle: string,
  decorations: Decoration[],
): void {
  if (changedBlocks.has(blockIndex)) {
    decorations.push(
      // data-diff-block: 差分ナビゲーション（次/前ジャンプ）のスクロールアンカー。
      // DOM 上の出現順 = 変更ブロック順として querySelectorAll で参照される。
      Decoration.node(pos, pos + node.nodeSize, { style: blockStyle, "data-diff-block": "true" }),
    );
  }
}

/** セル差分のデコレーションを作成する */
function buildCellDecorations(
  node: PMNode, pos: number, blockIndex: number,
  cellDiffs: Map<number, Set<number>>, cellStyle: string,
  decorations: Decoration[],
): void {
  if (!cellDiffs.has(blockIndex)) return;
  const changedCellSet = cellDiffs.get(blockIndex);
  if (!changedCellSet) return;
  let flatCellIndex = 0;
  node.forEach((row, rowOffset) => {
    row.forEach((cell, cellOffset) => {
      if (changedCellSet.has(flatCellIndex)) {
        const cellPos = pos + 1 + rowOffset + 1 + cellOffset;
        decorations.push(
          Decoration.node(cellPos, cellPos + cell.nodeSize, {
            style: cellStyle,
          }),
        );
      }
      flatCellIndex++;
    });
  });
}

/** プレースホルダー Widget デコレーションを作成する */
function buildPlaceholderDecorations(
  placeholderPositions: PlaceholderPosition[],
  decorations: Decoration[],
): void {
  const lineHeight = 1.6;
  const fontSize = 16;
  for (const ph of placeholderPositions) {
    const height = ph.lineCount * fontSize * lineHeight;
    decorations.push(
      Decoration.widget(ph.pos, () => {
        const el = document.createElement("div");
        el.style.height = `${height}px`;
        el.style.backgroundColor = "rgba(128, 128, 128, 0.06)";
        el.style.borderRadius = "4px";
        el.style.margin = "2px 0";
        el.setAttribute("aria-hidden", "true");
        return el;
      }, { side: 1 }),
    );
  }
}

/** 展開ボタン Widget の DOM を作る */
function createExpanderWidget(view: EditorView, runKey: string, count: number, label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "diff-collapse-expander";
  el.textContent = `⋯ ${label.replace("{count}", String(count))}`;
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.style.cssText =
    "cursor:pointer; text-align:center; font-size:13px; padding:2px 8px; margin:2px 0;" +
    "color:rgba(128,128,128,0.9); background-color:rgba(128,128,128,0.08);" +
    "border-top:1px dashed rgba(128,128,128,0.4); border-bottom:1px dashed rgba(128,128,128,0.4);" +
    "user-select:none;";
  const toggle = () => {
    view.dispatch(view.state.tr.setMeta(diffHighlightPluginKey, { kind: "toggleRun", key: runKey } satisfies DiffHighlightMeta));
  };
  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  return el;
}

/** 折りたたみ（未変更ブロックの非表示 + 展開ウィジェット）デコレーションを作成する */
function buildCollapseDecorations(
  doc: PMNode, changedBlocks: Set<number>, contextBlocks: number,
  expandedRuns: Set<string>, expandLabel: string, decorations: Decoration[],
): void {
  const n = doc.childCount;
  if (n === 0) return;

  // 各トップレベルノードの絶対位置とサイズ
  const offsets: number[] = [];
  const sizes: number[] = [];
  doc.forEach((node, offset) => {
    offsets.push(offset);
    sizes.push(node.nodeSize);
  });

  // 変更ブロックの前後 contextBlocks を可視とする
  const visible = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!changedBlocks.has(i)) continue;
    const lo = Math.max(0, i - contextBlocks);
    const hi = Math.min(n - 1, i + contextBlocks);
    for (let j = lo; j <= hi; j++) visible[j] = true;
  }

  let i = 0;
  while (i < n) {
    if (visible[i]) { i++; continue; }
    let j = i;
    while (j < n && !visible[j]) j++;
    const len = j - i;
    const key = String(i);
    if (len >= MIN_COLLAPSE_BLOCKS && !expandedRuns.has(key)) {
      for (let k = i; k < j; k++) {
        decorations.push(Decoration.node(offsets[k], offsets[k] + sizes[k], { style: "display:none", contenteditable: "false" }));
      }
      decorations.push(
        Decoration.widget(offsets[i], (view) => createExpanderWidget(view, key, len, expandLabel), { side: -1, key: `collapse-${key}` }),
      );
    }
    i = j;
  }
}

function applyMeta(value: DiffHighlightState, meta: DiffHighlightMeta): DiffHighlightState {
  switch (meta.kind) {
    case "highlight":
      return { ...value, changedBlocks: meta.changedBlocks, cellDiffs: meta.cellDiffs, placeholderPositions: meta.placeholderPositions, side: meta.side };
    case "collapse":
      // collapse 状態が変わったら手動展開はリセット
      return { ...value, collapse: meta.collapse, contextBlocks: meta.contextBlocks, expandLabel: meta.expandLabel, expandedRuns: new Set() };
    case "toggleRun": {
      const next = new Set(value.expandedRuns);
      if (next.has(meta.key)) next.delete(meta.key);
      else next.add(meta.key);
      return { ...value, expandedRuns: next };
    }
    case "clear":
      return { ...EMPTY_STATE, collapse: value.collapse, contextBlocks: value.contextBlocks, expandLabel: value.expandLabel };
  }
}

export const DiffHighlight = Extension.create({
  name: "diffHighlight",

  addCommands() {
    return {
      setDiffHighlight:
        (result: import("../utils/blockDiffComputation").BlockDiffResult, side: "left" | "right") =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, {
              kind: "highlight",
              changedBlocks: result.changedBlocks,
              cellDiffs: result.cellDiffs,
              placeholderPositions: result.placeholderPositions ?? [],
              side,
            } satisfies DiffHighlightMeta);
          }
          return true;
        },
      clearDiffHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, { kind: "clear" } satisfies DiffHighlightMeta);
          }
          return true;
        },
      setDiffCollapse:
        (collapse: boolean, contextBlocks: number, expandLabel: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, { kind: "collapse", collapse, contextBlocks, expandLabel } satisfies DiffHighlightMeta);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: diffHighlightPluginKey,
        state: {
          init(): DiffHighlightState {
            return EMPTY_STATE;
          },
          apply(tr, value: DiffHighlightState): DiffHighlightState {
            const meta = tr.getMeta(diffHighlightPluginKey) as DiffHighlightMeta | undefined;
            if (meta) return applyMeta(value, meta);
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = diffHighlightPluginKey.getState(state) as
              | DiffHighlightState
              | undefined;
            if (!pluginState) return DecorationSet.empty;
            const { changedBlocks, cellDiffs, placeholderPositions, side, collapse, contextBlocks, expandedRuns, expandLabel } = pluginState;
            const nothingToHighlight = changedBlocks.size === 0 && cellDiffs.size === 0 && placeholderPositions.length === 0;
            if (nothingToHighlight && !collapse) {
              return DecorationSet.empty;
            }

            const blockStyle = side === "left" ? LEFT_BLOCK_STYLE : RIGHT_BLOCK_STYLE;
            const cellStyle = side === "left" ? LEFT_CELL_STYLE : RIGHT_CELL_STYLE;
            const decorations: Decoration[] = [];
            let blockIndex = 0;

            state.doc.forEach((node, pos) => {
              buildBlockDecorations(node, pos, blockIndex, changedBlocks, blockStyle, decorations);
              buildCellDecorations(node, pos, blockIndex, cellDiffs, cellStyle, decorations);
              blockIndex++;
            });

            buildPlaceholderDecorations(placeholderPositions, decorations);

            if (collapse) {
              buildCollapseDecorations(state.doc, changedBlocks, contextBlocks, expandedRuns, expandLabel, decorations);
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
