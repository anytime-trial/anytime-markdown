import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const changeGutterKey = new PluginKey("changeGutter");

/** top-level ノードの fingerprint を生成 */
function nodeFingerprint(node: PmNode): string {
  return JSON.stringify(node.toJSON());
}

/** ノードがテキストを持たない空段落かどうか */
function isEmptyParagraph(node: PmNode): boolean {
  return node.type.name === "paragraph" && node.textContent.trim() === "";
}

interface NodeEntry {
  /** doc 内の実インデックス */
  docIndex: number;
  fingerprint: string;
}

/** doc から空段落を除外した fingerprint リストを生成 */
function collectContentNodes(doc: PmNode): NodeEntry[] {
  const entries: NodeEntry[] = [];
  let index = 0;
  doc.forEach((node) => {
    if (!isEmptyParagraph(node)) {
      entries.push({ docIndex: index, fingerprint: nodeFingerprint(node) });
    }
    index++;
  });
  return entries;
}

/** baseline fingerprint リストから空段落を除外 */
function filterBaselineFingerprints(
  fingerprints: string[],
  doc: PmNode,
): string[] {
  const result: string[] = [];
  let index = 0;
  doc.forEach((node) => {
    if (!isEmptyParagraph(node)) {
      result.push(fingerprints[index]);
    }
    index++;
  });
  return result;
}

interface DiffResult {
  /** current 側で変更/追加されたノードの doc インデックス */
  changed: Set<number>;
  /**
   * 削除が発生した位置: current 側の doc インデックス。
   * そのインデックスのノードの直前に削除インジケータを表示する。
   * -1 は doc 先頭での削除を意味する。
   */
  deletionBefore: number[];
}

/** Build LCS DP table for two string arrays */
function buildLcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      if (i === 0 || j === 0) dp[i][j] = 0;
      else if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Backtrack LCS DP table to extract match pairs (baseline index, current index) */
function backtrackLcs(
  dp: number[][],
  a: string[],
  b: string[],
): { pairs: { bi: number; ci: number }[]; matchedCurrent: Set<number> } {
  const pairs: { bi: number; ci: number }[] = [];
  const matchedCurrent = new Set<number>();
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push({ bi: i - 1, ci: j - 1 });
      matchedCurrent.add(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  return { pairs, matchedCurrent };
}

function addDeletionTarget(
  docIndex: number,
  seen: Set<number>,
  changed: Set<number>,
  result: number[],
): void {
  if (!seen.has(docIndex) && !changed.has(docIndex)) {
    seen.add(docIndex);
    result.push(docIndex);
  }
}

/** Detect deletion positions by finding unmatched baseline nodes */
function detectDeletions(
  baselineLen: number,
  matchPairs: { bi: number; ci: number }[],
  current: NodeEntry[],
  changed: Set<number>,
): number[] {
  const matchedBaseline = new Set(matchPairs.map((p) => p.bi));
  const deletionBefore: number[] = [];
  const seen = new Set<number>();
  const n = current.length;

  for (let bi = 0; bi < baselineLen; bi++) {
    if (matchedBaseline.has(bi)) continue;

    const nextPair = matchPairs.find((p) => p.bi > bi);
    if (nextPair) {
      addDeletionTarget(current[nextPair.ci].docIndex, seen, changed, deletionBefore);
    } else {
      const lastCurrentDocIdx = n > 0 ? current[n - 1].docIndex : -1;
      const endIsChanged = lastCurrentDocIdx >= 0 && changed.has(lastCurrentDocIdx);
      if (!seen.has(-1) && !endIsChanged) {
        seen.add(-1);
        deletionBefore.push(-1);
      }
    }
  }
  return deletionBefore;
}

/**
 * LCS ベースの差分検出: baseline と current のコンテンツノードを比較し、
 * 変更/追加と削除を検出する。空段落はスキップ。
 */
function diffContentNodes(
  baseline: string[],
  current: NodeEntry[],
): DiffResult {
  const currentFps = current.map((e) => e.fingerprint);
  const n = currentFps.length;

  const dp = buildLcsTable(baseline, currentFps);
  const { pairs: matchPairs, matchedCurrent } = backtrackLcs(dp, baseline, currentFps);

  // 変更/追加: current でマッチしなかったノード
  const changed = new Set<number>();
  for (let k = 0; k < n; k++) {
    if (!matchedCurrent.has(k)) changed.add(current[k].docIndex);
  }

  const deletionBefore = detectDeletions(baseline.length, matchPairs, current, changed);

  return { changed, deletionBefore };
}

/** 削除マーカーの DOM 要素を生成 */
function createDeleteMarker(): HTMLElement {
  const el = document.createElement("div");
  el.className = "change-gutter-deleted";
  el.setAttribute("aria-hidden", "true");
  return el;
}

interface ChangeGutterState {
  /** baseline の全 fingerprints（空段落含む、doc 保存用） */
  allFingerprints: string[] | null;
  /** baseline のコンテンツノード fingerprints（空段落除外、比較用） */
  baselineContent: string[] | null;
  decorations: DecorationSet;
  /** 変更ノードの開始位置リスト（昇順、ナビゲーション用） */
  changedPositions: number[];
}

/** プラグイン state から変更位置リストを取得 */
export function getChangedPositions(
  editorState: import("@tiptap/pm/state").EditorState,
): number[] {
  return changeGutterKey.getState(editorState)?.changedPositions ?? [];
}

/** CSS 注入済みフラグ */
let styleInjected = false;

function injectStyles() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const style = document.createElement("style");
  style.id = "change-gutter-styles";
  style.textContent = `
    .change-gutter-mark {
      border-left: 3px solid #2ea043 !important;
    }
    .change-gutter-deleted {
      display: block;
      height: 0;
      width: 12px;
      border-bottom: 2px solid #f85149;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    changeGutter: {
      /** 現在の doc を baseline として保存 */
      setChangeGutterBaseline: () => ReturnType;
      /** baseline と装飾をクリア */
      clearChangeGutter: () => ReturnType;
      /** 次の変更箇所へ移動 */
      goToNextChange: () => ReturnType;
      /** 前の変更箇所へ移動 */
      goToPrevChange: () => ReturnType;
    };
  }
}

export const ChangeGutterExtension = Extension.create({
  name: "changeGutter",

  addCommands() {
    return {
      setChangeGutterBaseline:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(changeGutterKey, { action: "setBaseline" });
          }
          return true;
        },
      clearChangeGutter:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(changeGutterKey, { action: "clear" });
          }
          return true;
        },
      goToNextChange:
        () =>
        ({ state, dispatch, view }) => {
          const positions = getChangedPositions(state);
          if (positions.length === 0) return false;
          const cursor = state.selection.from;
          // カーソルより後の最初の変更位置、なければ先頭に巡回
          const next = positions.find((p) => p > cursor) ?? positions[0];
          if (dispatch) {
            const tr = state.tr.setSelection(
              TextSelection.create(state.doc, next),
            );
            dispatch(tr.scrollIntoView());
          }
          view?.focus();
          return true;
        },
      goToPrevChange:
        () =>
        ({ state, dispatch, view }) => {
          const positions = getChangedPositions(state);
          if (positions.length === 0) return false;
          const cursor = state.selection.from;
          // カーソルより前の最後の変更位置、なければ末尾に巡回
          let prev: number | undefined;
          for (let i = positions.length - 1; i >= 0; i--) {
            if (positions[i] < cursor) { prev = positions[i]; break; }
          }
          const target = prev ?? positions.at(-1)!;
          if (dispatch) {
            const tr = state.tr.setSelection(
              TextSelection.create(state.doc, target),
            );
            dispatch(tr.scrollIntoView());
          }
          view?.focus();
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    injectStyles();

    return [
      new Plugin<ChangeGutterState>({
        key: changeGutterKey,
        state: {
          init(): ChangeGutterState {
            return { allFingerprints: null, baselineContent: null, decorations: DecorationSet.empty, changedPositions: [] };
          },
          apply(tr, state, _oldEditorState, newEditorState): ChangeGutterState {
            const meta = tr.getMeta(changeGutterKey) as
              | { action: string }
              | undefined;

            if (meta?.action === "setBaseline") {
              const doc = newEditorState.doc;
              const allFps: string[] = [];
              doc.forEach((node) => allFps.push(nodeFingerprint(node)));
              const contentFps = filterBaselineFingerprints(allFps, doc);
              return {
                allFingerprints: allFps,
                baselineContent: contentFps,
                decorations: DecorationSet.empty,
                changedPositions: [],
              };
            }

            if (meta?.action === "clear") {
              return { allFingerprints: null, baselineContent: null, decorations: DecorationSet.empty, changedPositions: [] };
            }

            if (!state.baselineContent) return state;

            if (!tr.docChanged) {
              return {
                ...state,
                decorations: state.decorations.map(tr.mapping, tr.doc),
                changedPositions: state.changedPositions.map((p) => tr.mapping.map(p)),
              };
            }

            // doc 変更時: baseline と比較して装飾を再計算（空段落を除外）
            const doc = newEditorState.doc;
            const currentContent = collectContentNodes(doc);
            const { changed, deletionBefore } = diffContentNodes(
              state.baselineContent,
              currentContent,
            );

            const decorations: Decoration[] = [];
            const positions: number[] = [];

            // ノード位置マップを構築
            const nodePositions: { offset: number; size: number }[] = [];
            let index = 0;
            doc.forEach((node, offset) => {
              nodePositions.push({ offset, size: node.nodeSize });
              if (changed.has(index)) {
                // ノード内の最初のテキスト位置（カーソル配置可能な位置）
                const textPos = offset + 1;
                positions.push(textPos);
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    class: "change-gutter-mark",
                  }),
                );
              }
              index++;
            });

            // 削除インジケータ
            for (const beforeDocIdx of deletionBefore) {
              let pos: number;
              if (beforeDocIdx === -1) {
                // doc 末尾での削除
                pos = doc.content.size;
              } else {
                // 該当ノードの直前に配置
                const np = nodePositions[beforeDocIdx];
                pos = np ? np.offset : 0;
              }
              decorations.push(
                Decoration.widget(pos, createDeleteMarker, { side: -1 }),
              );
            }

            return {
              allFingerprints: state.allFingerprints,
              baselineContent: state.baselineContent,
              decorations: DecorationSet.create(doc, decorations),
              changedPositions: positions,
            };
          },
        },
        props: {
          decorations(state) {
            return (
              this.getState(state)?.decorations ?? DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});
