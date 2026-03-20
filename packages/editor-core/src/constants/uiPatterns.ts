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
    borderRadius: 0.5,
  } as const;
}

/** focus-visible 時のアウトラインスタイル（スプリッター等、borderRadius なし） */
export function getFocusOutlineBare(isDark: boolean) {
  return {
    outline: "2px solid",
    outlineColor: getPrimaryMain(isDark),
  } as const;
}

// ── トランジション ──

/** 標準トランジション（背景色、opacity、transform） */
export const TRANSITION_FAST = "0.15s";

/** 展開・折りたたみ用トランジション */
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
    transition: `background-color ${TRANSITION_FAST}`,
    ...REDUCED_MOTION_SX,
  } as const;
}
