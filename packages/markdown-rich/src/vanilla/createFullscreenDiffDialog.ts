/**
 * compare（merge）モード時のコードブロック編集ダイアログ (vanilla) —
 * React `FullscreenDiffView` + `useBlockMergeCompare` の表示部の置換。
 *
 * 旧挙動: merge ビューが開いている間にコードブロックの編集ダイアログを開くと、
 * 通常の編集 UI の代わりに左=比較側 / 右=編集側の行 diff ビューを表示し、
 * ブロック単位マージ（chevron）・右ペイン直接編集の結果を
 * `onMergeApply(newThisCode, newCompareCode)` で即時通知する（Apply ボタンなし・ライブ適用）。
 *
 * パネル描画は markdown-viewer の `createMergeEditorPanel`（InlineMergeView と同部品）を再利用し、
 * 画面上の左右（左=比較・右=編集）とデータモデル（applyMerge の left=編集側）が逆である点も
 * InlineMergeView の flippedMerge と同じ規約で吸収する。
 */

import {
  createMergeEditorPanel,
  type MergeEditorPanelHandle,
} from "@anytime-markdown/markdown-viewer/src/components-vanilla/MergeEditorPanel";
import { createDialog } from "@anytime-markdown/markdown-viewer/src/ui-vanilla/Dialog";
import {
  applyMerge,
  computeDiff,
  type DiffResult,
} from "@anytime-markdown/markdown-viewer/src/utils/diffEngine";

import { createDialogHeader } from "./dialogHelpers";

export interface CreateFullscreenDiffDialogOptions {
  label: string;
  isDark: boolean;
  editorBg: string;
  fontSize: number;
  lineHeight: number;
  /** 編集側（このエディタ）の初期コード。 */
  thisCode: string;
  /** 比較側（counterpart）の初期コード。 */
  compareCode: string;
  /**
   * マージ・編集の結果通知（編集側・比較側の順）。変更のたびに呼ばれる
   * （旧 React handleLeftChange / handleMergeBlock と同じライブ適用契約）。
   */
  onMergeApply: (newThisCode: string, newCompareCode: string) => void;
  t: (key: string) => string;
  onClose: () => void;
}

export interface FullscreenDiffDialogHandle {
  /** ダイアログ DOM（document.body に append 済み）。 */
  el: HTMLElement;
  /** ダイアログを破棄する。 */
  destroy: () => void;
}

/** compare モードのブロック単位マージダイアログを開く。 */
export function createFullscreenDiffDialog(
  opts: CreateFullscreenDiffDialogOptions,
): FullscreenDiffDialogHandle {
  const { t, isDark, fontSize, lineHeight } = opts;
  const editorSettings = { fontSize, lineHeight };

  let editText = opts.thisCode;
  let compareText = opts.compareCode;
  let diffResult: DiffResult = computeDiff(editText, compareText, {});

  const dlg = createDialog({
    onClose: opts.onClose,
    fullScreen: true,
    labelledBy: "codeblock-diff-title",
    paperStyle: { backgroundColor: opts.editorBg },
  });

  const header = createDialogHeader({
    label: opts.label,
    isDark,
    iconText: "{}",
    t,
    onClose: opts.onClose,
  });
  header.el.id = "codeblock-diff-title";
  dlg.paper.appendChild(header.el);

  // 画面上の左右（左=比較・右=編集）とデータモデル（applyMerge の left=editText）が
  // 逆のため、パネルが発火する方向を反転して applyMerge へ渡す（InlineMergeView と同規約）。
  const handleMerge = (
    blockId: number,
    direction: "left-to-right" | "right-to-left",
  ): void => {
    const block = diffResult.blocks.find((b) => b.id === blockId);
    if (!block) return;
    const flipped = direction === "left-to-right" ? "right-to-left" : "left-to-right";
    const { newLeftText, newRightText } = applyMerge(editText, compareText, block, flipped);
    editText = newLeftText;
    compareText = newRightText;
    opts.onMergeApply(editText, compareText);
    rerender();
  };

  // 左パネル（比較側・readOnly）。diffLines は rightLines（compareText 側）。
  const leftPanel: MergeEditorPanelHandle = createMergeEditorPanel({
    t,
    editorSettings,
    sourceMode: true,
    sourceText: compareText,
    diffLines: diffResult.rightLines,
    side: "left",
    readOnly: true,
    autoResize: true,
    hideScrollbar: true,
    onMerge: handleMerge,
  });

  // 右パネル（編集側）。diffLines は leftLines（editText 側）。
  const rightPanel: MergeEditorPanelHandle = createMergeEditorPanel({
    t,
    editorSettings,
    sourceMode: true,
    sourceText: editText,
    diffLines: diffResult.leftLines,
    side: "right",
    autoResize: true,
    textareaAriaLabel: t("sourceEditor"),
    onMerge: handleMerge,
    onSourceChange: (v) => {
      editText = v;
      opts.onMergeApply(editText, compareText);
      rerender();
    },
  });

  const body = document.createElement("div");
  body.style.cssText = "flex:1 1 auto;display:flex;overflow:auto;min-height:0;";
  const leftWrap = document.createElement("div");
  leftWrap.style.cssText = "flex:1;min-width:0;";
  leftWrap.appendChild(leftPanel.el);
  const divider = document.createElement("div");
  divider.style.cssText = "width:1px;align-self:stretch;background-color:var(--am-color-divider);";
  const rightWrap = document.createElement("div");
  rightWrap.style.cssText = "flex:1;min-width:0;";
  rightWrap.appendChild(rightPanel.el);
  body.append(leftWrap, divider, rightWrap);
  dlg.paper.appendChild(body);

  /**
   * diff 再計算と両パネルの再描画。パネル update は textarea を再構築するため、
   * 右ペイン編集中は caret / focus を再構築後の textarea へ復元する。
   */
  function rerender(): void {
    diffResult = computeDiff(editText, compareText, {});
    const active = document.activeElement;
    const wasEditing = active instanceof HTMLTextAreaElement && rightWrap.contains(active);
    const caret = wasEditing ? active.selectionStart : null;
    leftPanel.update({ sourceText: compareText, diffLines: diffResult.rightLines });
    rightPanel.update({ sourceText: editText, diffLines: diffResult.leftLines });
    if (wasEditing) {
      const ta = rightWrap.querySelector("textarea");
      if (ta) {
        ta.focus();
        const p = Math.min(caret ?? ta.value.length, ta.value.length);
        ta.setSelectionRange(p, p);
      }
    }
  }

  return {
    el: dlg.el,
    destroy() {
      leftPanel.destroy();
      rightPanel.destroy();
      header.destroy();
      dlg.destroy();
    },
  };
}
