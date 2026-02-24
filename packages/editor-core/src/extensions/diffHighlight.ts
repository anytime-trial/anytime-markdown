import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export const diffHighlightPluginKey = new PluginKey("diffHighlight");

// --- Block diff computation ---

interface BlockInfo {
  text: string;
  typeName: string;
}

function getTopLevelBlocks(doc: PMNode): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  doc.forEach((node) => {
    blocks.push({ text: node.textContent, typeName: node.type.name });
  });
  return blocks;
}

/** セル単位でテーブルを比較する */
function compareTableCells(
  leftTable: PMNode,
  rightTable: PMNode,
): { leftCells: Set<number>; rightCells: Set<number> } {
  // 行×列構造で取得（行数・列数が異なる場合に対応）
  const getRows = (table: PMNode): string[][] => {
    const rows: string[][] = [];
    table.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => {
        cells.push(cell.textContent);
      });
      rows.push(cells);
    });
    return rows;
  };

  const leftRows = getRows(leftTable);
  const rightRows = getRows(rightTable);
  const leftChanged = new Set<number>();
  const rightChanged = new Set<number>();

  const maxRowLen = Math.max(leftRows.length, rightRows.length);
  let leftFlatIdx = 0;
  let rightFlatIdx = 0;

  for (let r = 0; r < maxRowLen; r++) {
    const lRow = leftRows[r];
    const rRow = rightRows[r];

    if (!lRow) {
      // 右側のみに存在する行 → 全セルを変更マーク
      if (rRow) {
        for (let c = 0; c < rRow.length; c++) rightChanged.add(rightFlatIdx + c);
        rightFlatIdx += rRow.length;
      }
      continue;
    }
    if (!rRow) {
      // 左側のみに存在する行 → 全セルを変更マーク
      for (let c = 0; c < lRow.length; c++) leftChanged.add(leftFlatIdx + c);
      leftFlatIdx += lRow.length;
      continue;
    }

    // 両方に行が存在 → 列単位で比較
    const maxColLen = Math.max(lRow.length, rRow.length);
    for (let c = 0; c < maxColLen; c++) {
      if (c >= lRow.length) {
        rightChanged.add(rightFlatIdx + c);
      } else if (c >= rRow.length) {
        leftChanged.add(leftFlatIdx + c);
      } else if (lRow[c] !== rRow[c]) {
        leftChanged.add(leftFlatIdx + c);
        rightChanged.add(rightFlatIdx + c);
      }
    }
    leftFlatIdx += lRow.length;
    rightFlatIdx += rRow.length;
  }

  return { leftCells: leftChanged, rightCells: rightChanged };
}

export interface BlockDiffResult {
  /** ブロック全体をハイライトするインデックス */
  changedBlocks: Set<number>;
  /** テーブルのセル単位ハイライト: blockIndex → 変更セルの flat index set */
  cellDiffs: Map<number, Set<number>>;
}

/**
 * LCS ベースのブロックレベル差分を計算する。
 * テーブルブロックはセル単位で比較する。
 */
export function computeBlockDiff(
  leftDoc: PMNode,
  rightDoc: PMNode,
): { left: BlockDiffResult; right: BlockDiffResult } {
  const leftBlocks = getTopLevelBlocks(leftDoc);
  const rightBlocks = getTopLevelBlocks(rightDoc);
  const n = leftBlocks.length;
  const m = rightBlocks.length;

  // LCS DP (完全一致のブロックのみマッチ)
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (
        leftBlocks[i - 1].text === rightBlocks[j - 1].text &&
        leftBlocks[i - 1].typeName === rightBlocks[j - 1].typeName
      ) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack → マッチペア
  const matchedPairs: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (
      leftBlocks[i - 1].text === rightBlocks[j - 1].text &&
      leftBlocks[i - 1].typeName === rightBlocks[j - 1].typeName
    ) {
      matchedPairs.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const leftResult: BlockDiffResult = { changedBlocks: new Set(), cellDiffs: new Map() };
  const rightResult: BlockDiffResult = { changedBlocks: new Set(), cellDiffs: new Map() };

  // ギャップ（マッチ間の未マッチブロック）を処理
  // ProseMirror ノードへアクセスするため、doc を再走査
  const leftNodes: PMNode[] = [];
  leftDoc.forEach((node) => leftNodes.push(node));
  const rightNodes: PMNode[] = [];
  rightDoc.forEach((node) => rightNodes.push(node));

  let prevLeft = -1;
  let prevRight = -1;
  const sentinel: [number, number][] = [[n, m]];

  for (const [ml, mr] of [...matchedPairs, ...sentinel]) {
    const unmatchedLeft: number[] = [];
    for (let k = prevLeft + 1; k < ml; k++) unmatchedLeft.push(k);
    const unmatchedRight: number[] = [];
    for (let k = prevRight + 1; k < mr; k++) unmatchedRight.push(k);

    // 貪欲にペアリング
    const pairLen = Math.min(unmatchedLeft.length, unmatchedRight.length);
    for (let k = 0; k < pairLen; k++) {
      const li = unmatchedLeft[k];
      const ri = unmatchedRight[k];
      if (leftBlocks[li].typeName === "table" && rightBlocks[ri].typeName === "table") {
        // テーブル → セル単位比較
        const { leftCells, rightCells } = compareTableCells(leftNodes[li], rightNodes[ri]);
        if (leftCells.size > 0) leftResult.cellDiffs.set(li, leftCells);
        if (rightCells.size > 0) rightResult.cellDiffs.set(ri, rightCells);
      } else {
        leftResult.changedBlocks.add(li);
        rightResult.changedBlocks.add(ri);
      }
    }
    // 残りの未ペアブロック
    for (let k = pairLen; k < unmatchedLeft.length; k++) {
      leftResult.changedBlocks.add(unmatchedLeft[k]);
    }
    for (let k = pairLen; k < unmatchedRight.length; k++) {
      rightResult.changedBlocks.add(unmatchedRight[k]);
    }

    prevLeft = ml;
    prevRight = mr;
  }

  return { left: leftResult, right: rightResult };
}

// --- Tiptap Extension ---

interface DiffHighlightState {
  changedBlocks: Set<number>;
  cellDiffs: Map<number, Set<number>>;
  side: "left" | "right";
}

const EMPTY_STATE: DiffHighlightState = {
  changedBlocks: new Set(),
  cellDiffs: new Map(),
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
        result: BlockDiffResult,
        side: "left" | "right",
      ) => ReturnType;
      clearDiffHighlight: () => ReturnType;
    };
  }
}

export const DiffHighlight = Extension.create({
  name: "diffHighlight",

  addCommands() {
    return {
      setDiffHighlight:
        (result: BlockDiffResult, side: "left" | "right") =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(diffHighlightPluginKey, {
              changedBlocks: result.changedBlocks,
              cellDiffs: result.cellDiffs,
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
            const { changedBlocks, cellDiffs, side } = pluginState;
            if (changedBlocks.size === 0 && cellDiffs.size === 0) {
              return DecorationSet.empty;
            }

            const blockStyle = side === "left" ? LEFT_BLOCK_STYLE : RIGHT_BLOCK_STYLE;
            const cellStyle = side === "left" ? LEFT_CELL_STYLE : RIGHT_CELL_STYLE;
            const decorations: Decoration[] = [];
            let blockIndex = 0;

            state.doc.forEach((node, pos) => {
              if (changedBlocks.has(blockIndex)) {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, { style: blockStyle }),
                );
              } else if (cellDiffs.has(blockIndex)) {
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
              blockIndex++;
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
