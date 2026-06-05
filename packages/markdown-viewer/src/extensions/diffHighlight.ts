import { Extension } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { Plugin, PluginKey } from "@anytime-markdown/markdown-pm/state";
import type { EditorView } from "@anytime-markdown/markdown-pm/view";
import { Decoration, DecorationSet } from "@anytime-markdown/markdown-pm/view";

import { getMergeEditors } from "../contexts/MergeEditorsContext";
import type { CollapseRun, PlaceholderPosition } from "../utils/blockDiffComputation";

// Re-export for external consumers
export type { BlockDiffResult, PlaceholderPosition } from "../utils/blockDiffComputation";
export { computeBlockCollapsePlan,computeBlockDiff } from "../utils/blockDiffComputation";

export const diffHighlightPluginKey = new PluginKey("diffHighlight");

// --- Tiptap Extension ---

interface DiffHighlightState {
  changedBlocks: Set<number>;
  cellDiffs: Map<number, Set<number>>;
  placeholderPositions: PlaceholderPosition[];
  side: "left" | "right";
  /** この side で畳む未変更 run（左右で runId 共有・computeBlockCollapsePlan が算出） */
  collapsePlan: CollapseRun[];
  /** 手動展開済みの runId */
  expandedRuns: Set<number>;
  /** 展開ボタンのラベルテンプレート（{count} を含む） */
  expandLabel: string;
}

const EMPTY_STATE: DiffHighlightState = {
  changedBlocks: new Set(),
  cellDiffs: new Map(),
  placeholderPositions: [],
  side: "left",
  collapsePlan: [],
  expandedRuns: new Set(),
  expandLabel: "Show {count} unchanged blocks",
};

const LEFT_BLOCK_STYLE = "background-color: rgba(248, 81, 73, 0.10); border-radius: 4px;";
const RIGHT_BLOCK_STYLE = "background-color: rgba(46, 160, 67, 0.10); border-radius: 4px;";
const LEFT_CELL_STYLE = "background-color: rgba(248, 81, 73, 0.18);";
const RIGHT_CELL_STYLE = "background-color: rgba(46, 160, 67, 0.18);";

// --- meta（プラグインへの指示）の型 ---

type DiffHighlightMeta =
  | { kind: "highlight"; changedBlocks: Set<number>; cellDiffs: Map<number, Set<number>>; placeholderPositions: PlaceholderPosition[]; side: "left" | "right" }
  | { kind: "collapsePlan"; runs: CollapseRun[]; expandLabel: string }
  | { kind: "toggleRun"; runId: number }
  | { kind: "clear" };

declare module "@anytime-markdown/markdown-core" {
  interface Commands<ReturnType> {
    diffHighlight: {
      setDiffHighlight: (
        result: import("../utils/blockDiffComputation").BlockDiffResult,
        side: "left" | "right",
      ) => ReturnType;
      clearDiffHighlight: () => ReturnType;
      setCollapsePlan: (runs: CollapseRun[], expandLabel: string) => ReturnType;
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

/** プレースホルダーの最大高さ（px）。大きな未マッチセクションでも巨大な空白を作らない */
const PLACEHOLDER_MAX_PX = 48;

/** プレースホルダー Widget デコレーションを作成する（片側のみのセクション位置に小型マーカーを置く） */
function buildPlaceholderDecorations(
  placeholderPositions: PlaceholderPosition[],
  decorations: Decoration[],
): void {
  const lineHeight = 1.6;
  const fontSize = 16;
  for (const ph of placeholderPositions) {
    // セクション本来の高さに比例させつつ上限でクランプし、巨大な空白化を防ぐ
    const height = Math.min(ph.lineCount * fontSize * lineHeight, PLACEHOLDER_MAX_PX);
    decorations.push(
      Decoration.widget(ph.pos, () => {
        const el = document.createElement("div");
        el.style.height = `${height}px`;
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.fontSize = "12px";
        el.style.color = "rgba(128, 128, 128, 0.9)";
        el.style.backgroundColor = "rgba(128, 128, 128, 0.06)";
        el.style.border = "1px dashed rgba(128, 128, 128, 0.3)";
        el.style.borderRadius = "4px";
        el.style.margin = "2px 0";
        el.textContent = `⋯ ${ph.lineCount}`;
        el.setAttribute("aria-hidden", "true");
        return el;
      }, { side: 1 }),
    );
  }
}

/** runId を左右両エディタへ同時に toggle する（片側操作で両側を同期展開） */
function dispatchToggleRun(view: EditorView, runId: number): void {
  const editors = getMergeEditors();
  const targets = [editors?.leftEditor, editors?.rightEditor].filter((e): e is NonNullable<typeof e> => !!e);
  if (targets.length === 0) {
    view.dispatch(view.state.tr.setMeta(diffHighlightPluginKey, { kind: "toggleRun", runId } satisfies DiffHighlightMeta));
    return;
  }
  for (const ed of targets) {
    if (!ed.isDestroyed) {
      ed.view.dispatch(ed.state.tr.setMeta(diffHighlightPluginKey, { kind: "toggleRun", runId } satisfies DiffHighlightMeta));
    }
  }
}

/** 展開ボタン Widget の DOM を作る */
function createExpanderWidget(view: EditorView, runId: number, count: number, label: string): HTMLElement {
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
  const toggle = () => dispatchToggleRun(view, runId);
  el.addEventListener("click", toggle);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  return el;
}

/**
 * 折りたたみ（未変更ブロックの非表示 + 展開ウィジェット）デコレーションを作成する。
 * collapsePlan は computeBlockCollapsePlan が算出した this side の run 一覧。
 * offsets / sizes は decorations() の単一走査で収集済みのトップレベルノード位置・サイズ。
 */
function buildCollapseDecorations(
  offsets: number[], sizes: number[], collapsePlan: CollapseRun[],
  expandedRuns: Set<number>, expandLabel: string, decorations: Decoration[],
): void {
  for (const run of collapsePlan) {
    if (expandedRuns.has(run.runId)) continue;
    for (const idx of run.hideIndices) {
      if (idx >= 0 && idx < offsets.length) {
        decorations.push(Decoration.node(offsets[idx], offsets[idx] + sizes[idx], { style: "display:none", contenteditable: "false" }));
      }
    }
    if (run.anchorIndex >= 0 && run.anchorIndex < offsets.length) {
      decorations.push(
        Decoration.widget(offsets[run.anchorIndex], (view) => createExpanderWidget(view, run.runId, run.count, expandLabel), { side: -1, key: `collapse-${run.runId}` }),
      );
    }
  }
}

function applyMeta(value: DiffHighlightState, meta: DiffHighlightMeta): DiffHighlightState {
  switch (meta.kind) {
    case "highlight":
      return { ...value, changedBlocks: meta.changedBlocks, cellDiffs: meta.cellDiffs, placeholderPositions: meta.placeholderPositions, side: meta.side };
    case "collapsePlan":
      // 折りたたみ解除（空 plan）時は手動展開もリセット。更新時は展開状態を保持する。
      return { ...value, collapsePlan: meta.runs, expandLabel: meta.expandLabel, expandedRuns: meta.runs.length === 0 ? new Set() : value.expandedRuns };
    case "toggleRun": {
      const next = new Set(value.expandedRuns);
      if (next.has(meta.runId)) next.delete(meta.runId);
      else next.add(meta.runId);
      return { ...value, expandedRuns: next };
    }
    case "clear":
      return { ...EMPTY_STATE, expandLabel: value.expandLabel };
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
      setCollapsePlan:
        (runs: CollapseRun[], expandLabel: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, { kind: "collapsePlan", runs, expandLabel } satisfies DiffHighlightMeta);
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
            const { changedBlocks, cellDiffs, placeholderPositions, side, collapsePlan, expandedRuns, expandLabel } = pluginState;
            const collapsing = collapsePlan.length > 0;
            const nothingToHighlight = changedBlocks.size === 0 && cellDiffs.size === 0 && placeholderPositions.length === 0;
            if (nothingToHighlight && !collapsing) {
              return DecorationSet.empty;
            }

            const blockStyle = side === "left" ? LEFT_BLOCK_STYLE : RIGHT_BLOCK_STYLE;
            const cellStyle = side === "left" ? LEFT_CELL_STYLE : RIGHT_CELL_STYLE;
            const decorations: Decoration[] = [];
            let blockIndex = 0;
            // collapse 時のみトップレベルノードの位置・サイズを単一走査で収集する
            const offsets: number[] = [];
            const sizes: number[] = [];

            state.doc.forEach((node, pos) => {
              buildBlockDecorations(node, pos, blockIndex, changedBlocks, blockStyle, decorations);
              buildCellDecorations(node, pos, blockIndex, cellDiffs, cellStyle, decorations);
              if (collapsing) {
                offsets.push(pos);
                sizes.push(node.nodeSize);
              }
              blockIndex++;
            });

            buildPlaceholderDecorations(placeholderPositions, decorations);

            if (collapsing) {
              buildCollapseDecorations(offsets, sizes, collapsePlan, expandedRuns, expandLabel, decorations);
            }

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
