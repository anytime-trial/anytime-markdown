/**
 * 脱 React の vanilla DOM「LinePreviewPanel」ファクトリ。
 *
 * React 原版 `components/LinePreviewPanel.tsx` の素 DOM 版。ソースモードで textarea の
 * カーソル行をホバー通知として受け、その行の左右テキストをインライン diff（語単位の
 * 追加/削除ハイライト）付きで上下 2 段に表示する。左右の横スクロールを相互同期する。
 *
 * 変換規約:
 * - React props → opts。`useState(hoveredLineIdx)` は closure 変数 + setHovered() に置換。
 * - `hoverSetterRef` の代わりに戻り値 handle の `setHoveredLine(idx)` を公開する
 *   （呼び元の InlineMergeView が onHoverLine からこれを呼ぶ）。
 * - テーマは `--am-color-*` CSS 変数で追従するため isDark 分岐は不要。
 */

import {
  computeInlineDiff,
  type DiffResult,
  type InlineSegment,
} from "@anytime-markdown/markdown-engine";

/** {@link createLinePreviewPanel} のオプション。 */
export interface CreateLinePreviewPanelOptions {
  /** diff 結果。null の間はパネル本体を描画しない。 */
  diffResult: DiffResult | null;
  /** ソースモードか。false の間はパネル本体を描画しない。 */
  sourceMode: boolean;
  /** エディタ設定（fontSize）。プレビュー行のフォントサイズに使う。 */
  editorSettings: { fontSize: number };
}

/** {@link createLinePreviewPanel} の戻り値。 */
export interface LinePreviewPanelHandle {
  /** root（呼び元が配置する）。 */
  el: HTMLElement;
  /** ホバー行 index を設定して再描画する（onHoverLine から呼ぶ）。 */
  setHoveredLine: (idx: number | null) => void;
  /** diffResult / sourceMode / editorSettings を差し替える。 */
  update: (next: Partial<CreateLinePreviewPanelOptions>) => void;
  /** listener を解放し root を空にする。 */
  destroy: () => void;
}

function applyPreviewStyle(el: HTMLElement, fontSize: number): void {
  el.style.cssText =
    `padding-left:16px;padding-right:16px;padding-top:2px;padding-bottom:2px;` +
    `font-family:monospace;font-size:${fontSize + 4}px;line-height:1.4;white-space:pre;` +
    `overflow-x:auto;overflow-y:hidden;color:var(--am-color-text-primary);`;
}

/** インライン diff セグメントを span 群で描画する。 */
function renderSegments(
  container: HTMLElement,
  segments: InlineSegment[],
  highlightType: "removed" | "added",
): void {
  for (const seg of segments) {
    const span = document.createElement("span");
    span.textContent = seg.text;
    if (seg.type === highlightType) {
      const bg =
        highlightType === "removed"
          ? "var(--am-color-diff-removed-bg)"
          : "var(--am-color-diff-added-bg)";
      span.style.backgroundColor = bg;
      span.style.textDecoration = highlightType === "removed" ? "line-through" : "underline";
      span.style.borderRadius = "2px";
    }
    container.appendChild(span);
  }
}

/**
 * vanilla LinePreviewPanel を生成する。ソースモードかつ diffResult が存在し、ホバー行が
 * 設定されているときのみ上下 2 段のプレビューを表示する。
 */
export function createLinePreviewPanel(
  opts: CreateLinePreviewPanelOptions,
): LinePreviewPanelHandle {
  const state: CreateLinePreviewPanelOptions = { ...opts };
  let hoveredLineIdx: number | null = null;
  let destroyed = false;
  let isSyncingScroll = false;

  const root = document.createElement("div");

  const topEl = document.createElement("div");
  const separator = document.createElement("div");
  separator.setAttribute("role", "separator");
  const bottomEl = document.createElement("div");

  const onTopScroll = (): void => {
    if (isSyncingScroll) return;
    isSyncingScroll = true;
    bottomEl.scrollLeft = topEl.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingScroll = false;
    });
  };
  const onBottomScroll = (): void => {
    if (isSyncingScroll) return;
    isSyncingScroll = true;
    topEl.scrollLeft = bottomEl.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingScroll = false;
    });
  };
  topEl.addEventListener("scroll", onTopScroll);
  bottomEl.addEventListener("scroll", onBottomScroll);

  const render = (): void => {
    const { diffResult, sourceMode, editorSettings } = state;
    if (!sourceMode || !diffResult) {
      root.style.display = "none";
      root.replaceChildren();
      return;
    }
    root.style.display = "";
    root.style.cssText =
      "border-top:1px solid var(--am-color-divider);" +
      "background-color:var(--am-color-bg-default);flex-shrink:0;";

    const leftLine = hoveredLineIdx === null ? null : diffResult.leftLines?.[hoveredLineIdx];
    const rightLine = hoveredLineIdx === null ? null : diffResult.rightLines?.[hoveredLineIdx];
    const leftText = leftLine?.text ?? "";
    const rightText = rightLine?.text ?? "";
    const hasBoth =
      hoveredLineIdx !== null && leftText !== "" && rightText !== "" && leftText !== rightText;
    const inlineDiff = hasBoth ? computeInlineDiff(leftText, rightText) : null;

    applyPreviewStyle(topEl, editorSettings.fontSize);
    applyPreviewStyle(bottomEl, editorSettings.fontSize);
    separator.style.cssText = "border-top:1px solid var(--am-color-divider);";

    topEl.replaceChildren();
    bottomEl.replaceChildren();

    if (inlineDiff) {
      renderSegments(topEl, inlineDiff.oldSegments, "removed");
      renderSegments(bottomEl, inlineDiff.newSegments, "added");
    } else {
      topEl.textContent = hoveredLineIdx !== null && leftText ? leftText : " ";
      bottomEl.textContent = hoveredLineIdx !== null && rightText ? rightText : " ";
    }

    root.replaceChildren(topEl, separator, bottomEl);
  };

  render();

  return {
    el: root,
    setHoveredLine(idx: number | null) {
      if (destroyed) return;
      hoveredLineIdx = idx;
      render();
    },
    update(next: Partial<CreateLinePreviewPanelOptions>) {
      if (destroyed) return;
      Object.assign(state, next);
      render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      topEl.removeEventListener("scroll", onTopScroll);
      bottomEl.removeEventListener("scroll", onBottomScroll);
      root.replaceChildren();
    },
  };
}
