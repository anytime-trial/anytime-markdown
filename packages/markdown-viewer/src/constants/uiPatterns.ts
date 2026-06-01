/**
 * 繰り返し使用される UI スタイルパターンの定数定義
 */

import { getDivider, getPrimaryMain } from "./colors";

// ── フォーカスアウトライン ──

/** focus-visible 時のアウトラインスタイル（ブロック要素のドラッグハンドル等） */
export function getFocusOutlineSx(isDark: boolean) {
  return {
    outline: "2px solid",
    outlineColor: getPrimaryMain(isDark),
    outlineOffset: 2,
    borderRadius: 0.5,
  } as const;
}

/** focus-visible 時のアウトラインスタイル（スプリッター等、borderRadius なし） */
export function getFocusOutlineBare(isDark: boolean) {
  return {
    outline: "2px solid",
    outlineColor: getPrimaryMain(isDark),
    outlineOffset: 2,
  } as const;
}

// ── イージングトークン ──
/** 出現用: 勢いよく現れ、ゆっくり着地 */
export const EASE_DECELERATE = "cubic-bezier(0, 0, 0.2, 1)";
/** 標準: なめらかで自然な加減速 */
export const EASE_STANDARD = "cubic-bezier(0.4, 0, 0.2, 1)";
/** 退場用: ゆっくり始まり、素早く去る */
export const EASE_ACCELERATE = "cubic-bezier(0.4, 0, 1, 1)";

// ── 速度トークン ──
/** 150ms: アイコン、トグル、リップル */
export const DURATION_FAST = "0.15s";
/** 250ms: ボタンホバー、フォーカスリング、背景色変化 */
export const DURATION_NORMAL = "0.25s";
/** 300ms: シャドウ、モーダル開閉、レイアウトシフト */
export const DURATION_SLOW = "0.3s";

// ── トランジション（deprecated） ──

/** @deprecated DURATION_FAST + EASE_STANDARD を使用 */
export const TRANSITION_FAST = DURATION_FAST;

/** @deprecated DURATION_NORMAL + EASE_STANDARD を使用 */
export const TRANSITION_EXPAND = "0.2s";

/** prefers-reduced-motion 対応の sx ルール */
export const REDUCED_MOTION_SX = {
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
} as const;

// ── ドラッグハンドル共通スタイル ──

/** ブロック要素のドラッグハンドル sx */
export function getDragHandleSx(isDark: boolean) {
  return {
    cursor: "grab",
    display: "flex",
    alignItems: "center",
    opacity: 0.7,
    "&:hover, &:focus-visible": { opacity: 1 },
    "&:focus-visible": getFocusOutlineSx(isDark),
  } as const;
}

// ── スプリッター共通スタイル ──

/** 全画面ダイアログのドラッグスプリッター sx */
export function getSplitterSx(isDark: boolean) {
  return {
    width: 4,
    cursor: "col-resize",
    bgcolor: getDivider(isDark),
    flexShrink: 0,
    "&:hover": { bgcolor: getPrimaryMain(isDark) },
    "&:focus-visible": { ...getFocusOutlineBare(isDark), bgcolor: getPrimaryMain(isDark) },
    transition: `background-color ${DURATION_FAST}`,
    ...REDUCED_MOTION_SX,
  } as const;
}
