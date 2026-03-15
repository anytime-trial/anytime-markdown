/**
 * 繰り返し使用される UI スタイルパターンの定数定義
 */

// ── フォーカスアウトライン ──

/** focus-visible 時のアウトラインスタイル（ブロック要素のドラッグハンドル等） */
export const FOCUS_OUTLINE = {
  outline: "2px solid",
  outlineColor: "primary.main",
  borderRadius: 0.5,
} as const;

/** focus-visible 時のアウトラインスタイル（スプリッター等、borderRadius なし） */
export const FOCUS_OUTLINE_BARE = {
  outline: "2px solid",
  outlineColor: "primary.main",
} as const;

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
export const DRAG_HANDLE_SX = {
  cursor: "grab",
  display: "flex",
  alignItems: "center",
  opacity: 0.7,
  "&:hover, &:focus-visible": { opacity: 1 },
  "&:focus-visible": FOCUS_OUTLINE,
} as const;

// ── スプリッター共通スタイル ──

/** 全画面ダイアログのドラッグスプリッター sx */
export const SPLITTER_SX = {
  width: 4,
  cursor: "col-resize",
  bgcolor: "divider",
  flexShrink: 0,
  "&:hover": { bgcolor: "primary.main" },
  "&:focus-visible": { ...FOCUS_OUTLINE_BARE, bgcolor: "primary.main" },
  transition: `background-color ${TRANSITION_FAST}`,
  ...REDUCED_MOTION_SX,
} as const;
