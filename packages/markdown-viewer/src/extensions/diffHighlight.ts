import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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
}

const EMPTY_STATE: DiffHighlightState = {
  changedBlocks: new Set(),
  cellDiffs: new Map(),
  placeholderPositions: [],
  side: "left",
};

const LEFT_BLOCK_STYLE = "background-color: rgba(248, 81, 73, 0.10); border-radius: 4px;";
const RIGHT_BLOCK_STYLE = "background-color: rgba(46, 160, 67, 0.10); border-radius: 4px;";
const LEFT_CELL_STYLE = "background-color: rgba(248, 81, 73, 0.18);";
const RIGHT_CELL_STYLE = "background-color: rgba(46, 160, 67, 0.18);";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    diffHighlight: {
      setDiffHighlight: (
        result: import("../utils/blockDiffComputation").BlockDiffResult,
        side: "left" | "right",
      ) => ReturnType;
      clearDiffHighlight: () => ReturnType;
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
      Decoration.node(pos, pos + node.nodeSize, { style: blockStyle }),
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

export const DiffHighlight = Extension.create({
  name: "diffHighlight",

  addCommands() {
    return {
      setDiffHighlight:
        (result: import("../utils/blockDiffComputation").BlockDiffResult, side: "left" | "right") =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, {
              changedBlocks: result.changedBlocks,
              cellDiffs: result.cellDiffs,
              placeholderPositions: result.placeholderPositions ?? [],
              side,
            } satisfies DiffHighlightState);
          }
          return true;
        },
      clearDiffHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, EMPTY_STATE);
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
            const meta = tr.getMeta(diffHighlightPluginKey) as DiffHighlightState | undefined;
            if (meta) return meta;
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = diffHighlightPluginKey.getState(state) as
              | DiffHighlightState
              | undefined;
            if (!pluginState) return DecorationSet.empty;
            const { changedBlocks, cellDiffs, placeholderPositions, side } = pluginState;
            if (changedBlocks.size === 0 && cellDiffs.size === 0 && placeholderPositions.length === 0) {
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

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
