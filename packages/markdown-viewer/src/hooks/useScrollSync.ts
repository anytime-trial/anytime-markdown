import type { Editor } from "@anytime-markdown/markdown-react";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

import type { AlignedSlot } from "../utils/blockDiffComputation";
import { computeBlockAlignment } from "../utils/blockDiffComputation";
import type { BlockOffset } from "../utils/blockScrollMap";
import { computeFollowerScrollTop } from "../utils/blockScrollMap";

/** Find the first scrollable child element (BFS) */
function findScrollableChild(container: HTMLElement): HTMLElement | null {
  const queue: HTMLElement[] = [container];
  while (queue.length > 0) {
    const el = queue.shift();
    if (!el) continue;
    if (el.scrollHeight > el.clientHeight + 1) {
      const style = getComputedStyle(el);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        return el;
      }
    }
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) queue.push(child);
    }
  }
  return null;
}

/** scrollEl 基準で各トップレベルブロックの上端・高さを計測する（doc 順 = AlignedSlot の index 順） */
function buildOffsetMap(editor: Editor, scrollEl: HTMLElement): BlockOffset[] {
  const map: BlockOffset[] = [];
  const scrollRectTop = scrollEl.getBoundingClientRect().top;
  const scrollTop = scrollEl.scrollTop;
  let index = 0;
  editor.state.doc.forEach((_node, pos) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (dom && typeof dom.getBoundingClientRect === "function") {
      const top = dom.getBoundingClientRect().top - scrollRectTop + scrollTop;
      map.push({ index, top, height: dom.offsetHeight ?? 0 });
    } else {
      map.push({ index, top: 0, height: 0 });
    }
    index++;
  });
  return map;
}

/**
 * 比較モードの左右ペインのスクロールを同期する。
 *
 * WYSIWYG 比較（両エディタ存在・非ソースモード）では、AlignedSlot のブロック対応を
 * 共有してリードペインの可視ブロックに対応する相手側ブロックを同じビューポート位置へ
 * 合わせる（ブロックアンカー方式）。設定は同期的に行い（rAF を介さない）、
 * プログラム的スクロールが返すエコーイベントは期待値一致で抑制して往復ループを防ぐ。
 *
 * ソースモードやエディタ欠落時は従来の ratio 方式へフォールバックする。
 *
 * 注意: doc / nodeDOM は読み取りのみで、blockAlignment / diffHighlight の
 * ProseMirror Plugin 状態には一切触れない。
 *
 * @param leftContainerRef 視覚的に右（編集側 = rightEditor）ペインのコンテナ
 * @param rightScrollRef   視覚的に左（比較側 = leftEditor）ペインのスクロール要素
 */
export function useScrollSync(
  leftContainerRef: RefObject<HTMLDivElement | null>,
  rightScrollRef: RefObject<HTMLDivElement | null>,
  leftEditor: Editor | null | undefined,
  rightEditor: Editor | null | undefined,
  sourceMode: boolean,
): void {
  // 追従ペインへ設定した scrollTop の期待値。追従側が返すエコーイベント判定に使う。
  const programmatic = useRef<{ el: HTMLElement; top: number } | null>(null);
  // ブロックオフセットマップ・slot のキャッシュ（スクロールごとに再計測しない）
  const slotsRef = useRef<AlignedSlot[]>([]);
  const aMapRef = useRef<BlockOffset[]>([]); // side a = rightEditor
  const bMapRef = useRef<BlockOffset[]>([]); // side b = leftEditor
  const staleRef = useRef(true);

  useEffect(() => {
    const rightPaneContainer = leftContainerRef.current; // rightEditor を含むコンテナ
    const leftPaneScroller = rightScrollRef.current; // leftEditor のスクロール要素
    if (!rightPaneContainer || !leftPaneScroller) return;

    const blockMode = !sourceMode && !!leftEditor && !!rightEditor;

    // side a (rightEditor) のスクロール要素はコンテナ内のネスト要素
    const getRightScroller = (): HTMLElement => findScrollableChild(rightPaneContainer) ?? rightPaneContainer;
    const getLeftScroller = (): HTMLElement => leftPaneScroller;

    const rebuild = (): void => {
      if (!blockMode || !leftEditor || !rightEditor) return;
      if (leftEditor.isDestroyed || rightEditor.isDestroyed) return;
      // computeBlockAlignment(docA = rightEditor, docB = leftEditor)：useBlockAlignment と同一の並び
      slotsRef.current = computeBlockAlignment(rightEditor.state.doc, leftEditor.state.doc);
      aMapRef.current = buildOffsetMap(rightEditor, getRightScroller());
      bMapRef.current = buildOffsetMap(leftEditor, getLeftScroller());
      staleRef.current = false;
    };

    const markStale = (): void => {
      staleRef.current = true;
    };

    const isEcho = (el: HTMLElement): boolean => {
      const p = programmatic.current;
      return !!p && p.el === el && Math.abs(el.scrollTop - p.top) <= 1;
    };

    const setFollower = (followerEl: HTMLElement, top: number): void => {
      programmatic.current = { el: followerEl, top };
      followerEl.scrollTop = top; // 同期設定 → 同フレームで両ペインが描画される
    };

    // ratio フォールバック（ソースモード・エディタ欠落時）
    const ratioSync = (from: HTMLElement, to: HTMLElement): void => {
      const max = from.scrollHeight - from.clientHeight;
      const ratio = max > 0 ? from.scrollTop / max : 0;
      setFollower(to, ratio * (to.scrollHeight - to.clientHeight));
    };

    const sync = (leaderSide: "a" | "b"): void => {
      const leaderEl = leaderSide === "a" ? getRightScroller() : getLeftScroller();
      const followerEl = leaderSide === "a" ? getLeftScroller() : getRightScroller();
      if (isEcho(leaderEl)) {
        programmatic.current = null;
        return;
      }
      if (!blockMode) {
        ratioSync(leaderEl, followerEl);
        return;
      }
      if (staleRef.current) rebuild();
      const top = computeFollowerScrollTop({
        leaderScrollTop: leaderEl.scrollTop,
        leaderMap: leaderSide === "a" ? aMapRef.current : bMapRef.current,
        followerMap: leaderSide === "a" ? bMapRef.current : aMapRef.current,
        slots: slotsRef.current,
        leaderSide,
        followerMaxScroll: followerEl.scrollHeight - followerEl.clientHeight,
      });
      setFollower(followerEl, top);
    };

    // rightEditor（side a）スクロール: コンテナで capture し、メイン縦スクロール要素のみ対象
    const onRightScroll = (e: Event): void => {
      if (e.target !== getRightScroller()) return;
      sync("a");
    };
    // leftEditor（side b）スクロール
    const onLeftScroll = (): void => sync("b");

    rightPaneContainer.addEventListener("scroll", onRightScroll, true);
    leftPaneScroller.addEventListener("scroll", onLeftScroll);

    let ro: ResizeObserver | undefined;
    if (blockMode && leftEditor && rightEditor) {
      rebuild();
      leftEditor.on("update", markStale);
      rightEditor.on("update", markStale);
      ro = new ResizeObserver(markStale);
      ro.observe(leftEditor.view.dom);
      ro.observe(rightEditor.view.dom);
    }

    return () => {
      rightPaneContainer.removeEventListener("scroll", onRightScroll, true);
      leftPaneScroller.removeEventListener("scroll", onLeftScroll);
      if (leftEditor) leftEditor.off("update", markStale);
      if (rightEditor) rightEditor.off("update", markStale);
      ro?.disconnect();
      programmatic.current = null;
      staleRef.current = true;
    };
  }, [leftContainerRef, rightScrollRef, leftEditor, rightEditor, sourceMode]);
}
