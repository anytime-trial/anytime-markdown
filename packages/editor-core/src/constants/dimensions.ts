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
/** ハンドルバーキャプションのフォントサイズ */
export const HANDLEBAR_CAPTION_FONT_SIZE = "0.65rem";
/** スラッシュコマンドメニューのフォントサイズ */
export const SLASH_COMMAND_FONT_SIZE = "0.85rem";
/** バッジ番号のフォントサイズ（コメント・アノテーション） */
export const BADGE_NUMBER_FONT_SIZE = "0.55rem";
/** 見出しレベルバッジのフォントサイズ */
export const HEADING_BADGE_FONT_SIZE = "0.6rem";
/** マージ差分バッジのフォントサイズ */
export const MERGE_BADGE_FONT_SIZE = "0.6rem";
/** コンテキストメニュー本文のフォントサイズ */
export const CONTEXT_MENU_FONT_SIZE = "0.8125rem";
/** メニュー項目のフォントサイズ */
export const MENU_ITEM_FONT_SIZE = "0.85rem";
/** ダイアログヘッダーのフォントサイズ */
export const DIALOG_HEADER_FONT_SIZE = "0.875rem";
/** ツールバーボタンのフォントサイズ */
export const TOOLBAR_FONT_SIZE = "0.8rem";
/** アウトラインパネルのフォントサイズ */
export const OUTLINE_FONT_SIZE = "0.8rem";
/** ブロックスタイル（折りたたみラベル等）のフォントサイズ */
export const BLOCK_STYLE_FONT_SIZE = "0.8rem";
/** コメント本文のフォントサイズ */
export const COMMENT_BODY_FONT_SIZE = "0.8rem";
/** パネル内入力欄のフォントサイズ */
export const PANEL_INPUT_FONT_SIZE = "0.8rem";
/** 検索バーカウンターのフォントサイズ */
export const SEARCH_COUNTER_FONT_SIZE = "0.65rem";
/** 検索バー入力欄のフォントサイズ */
export const SEARCH_INPUT_FONT_SIZE = "0.78rem";
/** スキップリンクのフォントサイズ */
export const SKIP_LINK_FONT_SIZE = "0.875rem";
/** コメント入力欄のフォントサイズ */
export const COMMENT_INPUT_FONT_SIZE = "0.875rem";
/** チップのフォントサイズ */
export const CHIP_FONT_SIZE = "0.7rem";
/** 小ボタンのフォントサイズ */
export const SMALL_BUTTON_FONT_SIZE = "0.7rem";
/** 小キャプションのフォントサイズ */
export const SMALL_CAPTION_FONT_SIZE = "0.7rem";
/** パネルボタン・トグルボタンのフォントサイズ */
export const PANEL_BUTTON_FONT_SIZE = "0.75rem";
/** ショートカット表示のフォントサイズ */
export const SHORTCUT_HINT_FONT_SIZE = "0.75rem";
/** 全画面ダイアログ パネルヘッダーのフォントサイズ */
export const FS_PANEL_HEADER_FONT_SIZE = "0.75rem";
/** 全画面ダイアログ タブのフォントサイズ */
export const FS_TAB_FONT_SIZE = "0.75rem";
/** 見出しアンカーリンクのフォントサイズ */
export const HEADING_ANCHOR_FONT_SIZE = "0.75rem";
/** フロントマターコードのフォントサイズ */
export const FRONTMATTER_CODE_FONT_SIZE = "0.75rem";
/** マージ情報キャプションのフォントサイズ */
export const MERGE_INFO_FONT_SIZE = "0.75rem";
/** ツールチップのフォントサイズ */
export const TOOLTIP_FONT_SIZE = "12px";

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
