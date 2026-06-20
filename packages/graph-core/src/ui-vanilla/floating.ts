/**
 * 脱React の vanilla DOM floating ファクトリ（ui/useFloating.ts + ui/Popover.tsx + ui/Menu.tsx 置換）。
 *
 * 既にバンドル内にある `@floating-ui/dom`（markdown-core 依存）を直叩きして flip / shift /
 * offset と autoUpdate を素 DOM でラップする。React hook（useFloating）/ Portal /
 * createPortal には依存しない。テーマ色は `--am-color-*` / `--am-*` CSS 変数で追従する。
 *
 * 提供する 3 階層:
 *   - createFloating ... reference→floating の配置計算 + autoUpdate 購読（最下層）。
 *   - createPopover  ... backdrop(click-away) + floating paper + ESC + 初期/復帰フォーカス。
 *   - createMenu     ... backdrop + floating ul(role=menu) + 矢印キー nav + ESC/Tab で閉じる。
 *
 * 共有 helper（appendContent / applyStyle / FOCUSABLE）は `./dom` から import（再実装禁止）。
 */

import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "@floating-ui/dom";
import type { Placement, ReferenceElement } from "@floating-ui/dom";

import { appendContent, applyStyle, FOCUSABLE, type VanillaContent } from "./dom";

export type { Placement } from "@floating-ui/dom";

// --- createFloating（最下層: 配置計算 + autoUpdate） --------------------------

/** {@link createFloating} のオプション。useFloating（hook）の素 DOM 版。 */
export interface CreateFloatingOptions {
  /**
   * アンカー。実 DOM（Element）でも virtual element（`{ getBoundingClientRect }`）でも可
   * （@floating-ui の ReferenceElement）。MUI anchorPosition 相当の固定座標は virtual で渡す。
   */
  reference: ReferenceElement;
  /** floating 要素（位置を付与する対象）。 */
  floating: HTMLElement;
  /** 希望配置。衝突時は flip で反転する。既定 "bottom"。 */
  placement?: Placement;
  /** アンカーと floating 要素の間隔(px)。既定 6。 */
  offsetPx?: number;
  /** viewport 端からの最小余白(px)。flip / shift の padding。既定 8。 */
  padding?: number;
  /** 配置確定ごとに呼ばれるコールバック（x/y/resolvedPlacement を受ける）。 */
  onPosition?: (state: FloatingState) => void;
}

/** 配置計算結果。 */
export interface FloatingState {
  /** floating 要素の left(px)。 */
  x: number;
  /** floating 要素の top(px)。 */
  y: number;
  /** flip 適用後の実配置。 */
  resolvedPlacement: Placement;
}

/**
 * reference→floating を `position:fixed` で配置し、autoUpdate を購読する。
 *
 * floating 要素には初回計算まで `opacity:0; pointer-events:none` を付け、確定後に解除する
 * （位置確定前のちらつき防止。a11y ツリーから外さないため visibility ではなく opacity）。
 *
 * `autoUpdate` は ResizeObserver / IntersectionObserver に依存する。jsdom 等の未実装環境では
 * 単発計算へフォールバックする（無限ループ・クラッシュ防止）。
 *
 * @returns `update`（手動再計算）と `destroy`（autoUpdate 解除）。
 */
export function createFloating(opts: CreateFloatingOptions): {
  update: () => void;
  destroy: () => void;
} {
  const {
    reference,
    floating,
    placement = "bottom",
    offsetPx = 6,
    padding = 8,
    onPosition,
  } = opts;

  floating.style.position = "fixed";
  floating.style.left = "0px";
  floating.style.top = "0px";
  floating.style.opacity = "0";
  floating.style.pointerEvents = "none";

  let destroyed = false;

  const update = (): void => {
    if (destroyed) return;
    computePosition(reference, floating, {
      strategy: "fixed",
      placement,
      middleware: [offset(offsetPx), flip({ padding }), shift({ padding })],
    })
      .then(({ x, y, placement: resolvedPlacement }) => {
        if (destroyed) return;
        floating.style.left = `${x}px`;
        floating.style.top = `${y}px`;
        floating.style.opacity = "1";
        floating.style.pointerEvents = "";
        onPosition?.({ x, y, resolvedPlacement });
      })
      .catch((error: unknown) => {
        // 位置計算失敗は致命的でないが、原因追跡のため握りつぶさず出力する。
        console.error("[createFloating] computePosition failed", error);
      });
  };

  let cleanup: (() => void) | null = null;
  // autoUpdate は ResizeObserver / IntersectionObserver を生成する。未実装環境（jsdom 等）では
  // クラッシュするため、単発計算へフォールバックする。
  if (
    typeof ResizeObserver === "undefined" ||
    typeof IntersectionObserver === "undefined"
  ) {
    update();
  } else {
    cleanup = autoUpdate(reference, floating, update);
  }

  return {
    update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cleanup?.();
      cleanup = null;
    },
  };
}

// --- createPopover（Popover.tsx 置換） ---------------------------------------

/**
 * MUI anchorPosition 相当の固定座標から virtual reference を作る（Menu.tsx の virtual 相当）。
 * 座標は viewport 基準（position:fixed 前提）。
 */
export function createVirtualAnchor(position: {
  top: number;
  left: number;
}): ReferenceElement {
  const { top, left } = position;
  const rect = {
    x: left,
    y: top,
    top,
    left,
    right: left,
    bottom: top,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  };
  return { getBoundingClientRect: () => rect as DOMRect };
}
