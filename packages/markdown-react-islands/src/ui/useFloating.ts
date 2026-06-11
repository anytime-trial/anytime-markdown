"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { Placement, ReferenceElement } from "@floating-ui/dom";

/**
 * オーバーレイ配置の共有フック。MUI/Popper を使わず、既にバンドル内にある
 * `@floating-ui/dom`（markdown-core 依存）を直叩きして flip / shift / offset と
 * autoUpdate を提供する。Tooltip / Menu など Portal で body 直下に出す要素を
 * アンカー要素に対して配置するために使う。
 *
 * - `strategy: "fixed"` 前提（floating 要素は `position: fixed`）。
 * - `autoUpdate` は ResizeObserver / IntersectionObserver に依存する。jsdom など
 *   未実装環境では単発計算へフォールバックする（無限ループ・クラッシュ防止）。
 */
export interface UseFloatingOptions {
  /** 開いているか。false の間は計算しない。 */
  open: boolean;
  /** 希望配置。衝突時は flip で反転する。 */
  placement?: Placement;
  /** アンカーと floating 要素の間隔(px)。 */
  offsetPx?: number;
  /** viewport 端からの最小余白(px)。flip / shift の padding に使う。 */
  padding?: number;
}

export interface UseFloatingResult {
  /** アンカー要素。実 DOM（Element）でも virtual element でも可（@floating-ui の ReferenceElement）。 */
  referenceRef: React.MutableRefObject<ReferenceElement | null>;
  floatingRef: React.MutableRefObject<HTMLElement | null>;
  /** floating 要素の left(px)。 */
  x: number;
  /** floating 要素の top(px)。 */
  y: number;
  /** flip 適用後の実配置。 */
  resolvedPlacement: Placement;
  /**
   * 初回計算が完了したか。位置確定までの不可視化は通常 `floatingStyle`（opacity:0）に任せる。
   * 生の x/y/ready を自前 style で使うのは、a11y ツリーから外してよい Tooltip 等で
   * visibility:hidden を採りたい場合のみ（getByRole で拾う必要がある要素では opacity を使う）。
   */
  ready: boolean;
  /**
   * floating 要素にそのまま spread できる位置スタイル（position:fixed + left/top +
   * 位置確定前の opacity/pointer-events ガード）。Menu / Popover / Select /
   * SlashCommandMenu が共通利用し、各自は zIndex / minWidth / paperStyle を足す。
   * 位置確定前を visibility:hidden でなく opacity:0 にするのは a11y ツリーから外さず
   * getByRole で拾えるようにするため。
   */
  floatingStyle: CSSProperties;
}

export function useFloating({
  open,
  placement = "bottom",
  offsetPx = 6,
  padding = 8,
}: UseFloatingOptions): UseFloatingResult {
  const referenceRef = useRef<ReferenceElement | null>(null);
  const floatingRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<{ x: number; y: number; resolvedPlacement: Placement; ready: boolean }>({
    x: 0,
    y: 0,
    resolvedPlacement: placement,
    ready: false,
  });

  const update = useCallback(() => {
    const reference = referenceRef.current;
    const floating = floatingRef.current;
    if (!reference || !floating) return;
    computePosition(reference, floating, {
      strategy: "fixed",
      placement,
      middleware: [offset(offsetPx), flip({ padding }), shift({ padding })],
    })
      .then(({ x, y, placement: resolvedPlacement }) => {
        setState({ x, y, resolvedPlacement, ready: true });
      })
      .catch((error: unknown) => {
        // 位置計算失敗は致命的でないが、原因追跡のため握りつぶさず出力する。
        console.error("[useFloating] computePosition failed", error);
      });
  }, [placement, offsetPx, padding]);

  useEffect(() => {
    if (!open) {
      setState((s) => (s.ready ? { ...s, ready: false } : s));
      return;
    }
    const reference = referenceRef.current;
    const floating = floatingRef.current;
    if (!reference || !floating) return;
    // autoUpdate は ResizeObserver / IntersectionObserver を生成する。未実装環境
    // （jsdom 等）ではクラッシュするため、単発計算へフォールバックする。
    if (typeof ResizeObserver === "undefined" || typeof IntersectionObserver === "undefined") {
      update();
      return;
    }
    return autoUpdate(reference, floating, update);
  }, [open, update]);

  const floatingStyle: CSSProperties = {
    position: "fixed",
    left: state.x,
    top: state.y,
    opacity: state.ready ? 1 : 0,
    pointerEvents: state.ready ? undefined : "none",
  };

  return { referenceRef, floatingRef, ...state, floatingStyle };
}
