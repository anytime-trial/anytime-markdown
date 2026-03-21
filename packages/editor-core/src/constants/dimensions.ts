// ── エディタ高さ初期値 ──
export const EDITOR_HEIGHT_MD = 600;
export const EDITOR_HEIGHT_MOBILE = 350;
export const EDITOR_HEIGHT_DEFAULT = 450;
export const EDITOR_HEIGHT_MIN = 200;

// ── アウトラインパネル ──
export const OUTLINE_WIDTH_DEFAULT = 220;
export const OUTLINE_WIDTH_MIN = 150;
export const OUTLINE_WIDTH_MAX = 500;

// ── プレビュー最大高さ ──
export const PREVIEW_MAX_HEIGHT = 400;

// ── StatusBar ──
/** StatusBar 高さ + border-top + Paper border 分のオフセット */
export const STATUSBAR_HEIGHT = 39;
/** StatusBar フォントサイズ */
export const STATUSBAR_FONT_SIZE = "0.875rem";

// ── コメントパネル ──
export const COMMENT_PANEL_WIDTH = 280;

// ── 全画面ダイアログ ──
/** コード側ツールバー・タブ行の高さ */
export const FS_TOOLBAR_HEIGHT = 32;
/** サンプルチップの高さ */
export const FS_CHIP_HEIGHT = 26;
/** ズーム倍率表示の最小幅 */
export const FS_ZOOM_LABEL_WIDTH = 36;
/** コードエリアの初期幅 (px) */
export const FS_CODE_INITIAL_WIDTH = 500;
/** コードエリアの最小幅 (px) */
export const FS_CODE_MIN_WIDTH = 120;

// ── パネルヘッダー ──
/** アウトライン・コメント・エクスプローラ パネル共通のヘッダー高さ */
export const PANEL_HEADER_MIN_HEIGHT = 40;

// ── サイドツールバー ──
/** 右端の縦ツールバー幅（ハンバーガーメニュー中心と揃える） */
export const SIDE_TOOLBAR_WIDTH = 46;
/** サイドツールバー内のアイコンボタンサイズ */
export const SIDE_TOOLBAR_ICON_SIZE = 32;

// ── エディタ内部オフセット ──
/** .tiptap minHeight 算出用（上部パディング + ツールバー分） */
export const EDITOR_PADDING_TOP = 36;
/** .tiptap maxHeight 算出用（ボーダー分） */
export const EDITOR_PADDING_BORDER = 4;

// ── 用紙サイズ (mm) ──
export type PaperSize = "off" | "A3" | "A4" | "B4" | "B5";

export const PAPER_WIDTHS_MM: Record<Exclude<PaperSize, "off">, number> = {
  A3: 297,
  A4: 210,
  B4: 257,
  B5: 182,
};

/** 用紙サイズ選択肢の表示順 */
export const PAPER_SIZE_OPTIONS: PaperSize[] = ["off", "A3", "A4", "B4", "B5"];

/** 余白デフォルト (mm) */
export const PAPER_MARGIN_DEFAULT = 20;
export const PAPER_MARGIN_MIN = 10;
export const PAPER_MARGIN_MAX = 40;
export const PAPER_MARGIN_STEP = 5;

/** 用紙の本文幅を px で計算する */
export function calcPaperContentWidth(paperSize: Exclude<PaperSize, "off">, marginMm: number): number {
  const contentMm = PAPER_WIDTHS_MM[paperSize] - marginMm * 2;
  return Math.round(contentMm * (96 / 25.4));
}
