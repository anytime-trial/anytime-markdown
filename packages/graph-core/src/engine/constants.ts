import {
  COLOR_SHADOW, COLOR_SHADOW_LIGHT, COLOR_DRAG_GLOW,
} from '../theme';

// ── Handle / Hit-test ──

/** リサイズハンドルの半径 (px) */
export const HANDLE_SIZE = 8;
/** エッジヒットテストの許容距離 (px) */
export const EDGE_TOLERANCE = 6;
/** 接続ポイントの描画半径 (px) */
export const CONNECTION_POINT_RADIUS = 10;
/** エッジ端点ハンドルの半径 (px) */
export const ENDPOINT_HANDLE_RADIUS = 10;
/** スナップインジケータの半径 (px) */
export const SNAP_INDICATOR_RADIUS = 6;

// ── Shadow ──

export interface ShadowStyle {
  readonly color: string;
  readonly blur: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export const SHADOW_DEFAULT: ShadowStyle = { color: COLOR_SHADOW, blur: 12, offsetX: 3, offsetY: 3 };
export const SHADOW_STICKY: ShadowStyle = { color: COLOR_SHADOW_LIGHT, blur: 8, offsetX: 2, offsetY: 2 };
export const SHADOW_DRAGGING: ShadowStyle = { color: COLOR_DRAG_GLOW, blur: 16, offsetX: 4, offsetY: 4 };

// ── Font size ──

export const FONT_SIZE_BADGE = 10;
export const FONT_SIZE_PREVIEW = 11;
export const FONT_SIZE_TOOLTIP = 11;
export const FONT_SIZE_EDGE_LABEL = 12;
export const FONT_SIZE_LINK_ICON = 12;

// ── Dash patterns ──

export const DASH_DEFAULT: readonly number[] = [4, 4];
export const DASH_FRAME: readonly number[] = [6, 3];
export const DASH_OVERLAY: readonly number[] = [6, 4];

// ── Stroke width ──

export const STROKE_WIDTH_SELECTED = 3;

// ── Text limits ──

export const TEXT_PREVIEW_MAX_CHARS = 100;
export const TEXT_PREVIEW_MAX_LINES = 3;
export const TEXT_LINE_MAX_CHARS = 30;
export const URL_TRUNCATE_LENGTH = 50;

// ── Endpoint shape dimensions ──

export const ARROW_HEAD_LENGTH = 12;
export const ENDPOINT_CIRCLE_RADIUS = 5;
export const ENDPOINT_DIAMOND_SIZE = 8;
export const ENDPOINT_BAR_LENGTH = 8;

// ── Shape geometry ──

/** 平行四辺形のオフセット比率（幅に対する割合） */
export const PARALLELOGRAM_OFFSET_RATIO = 0.2;

/** シリンダーの楕円比率（描画用、高さに対する割合） */
export const CYLINDER_ELLIPSE_RATIO = 0.12;

/** シリンダーの楕円高さ比率（ヒットテスト用、高さに対する割合） */
export const CYLINDER_ELLIPSE_HEIGHT_RATIO = 0.15;

/** シリンダーの楕円高さ上限 (px) */
export const CYLINDER_ELLIPSE_MAX_HEIGHT = 15;

// ── Frame ──

/** フレームのタイトルバー高さ (px) */
export const FRAME_TITLE_HEIGHT = 28;

/** フレームのパディング (px) */
export const FRAME_PADDING = 40;

/** フレームの折りたたみ/展開アイコンサイズ (px) */
export const FRAME_COLLAPSE_ICON_SIZE = 10;

/** フレームのタイトルテキスト左余白 (px) */
export const FRAME_TITLE_TEXT_LEFT = 12;

/** フレームのアイコン右余白 (px) */
export const FRAME_ICON_RIGHT_MARGIN = 12;

/** フレームのタイトルテキスト右マージン (px) */
export const FRAME_TITLE_TEXT_RIGHT_MARGIN = 40;

// ── Text layout ──

/** ノード内テキストの左右パディング (px) */
export const NODE_TEXT_PADDING = 8;

/** テキストの行高さ倍率（fontSize に対する比率） */
export const TEXT_LINE_HEIGHT_RATIO = 1.3;

// ── Doc shape ──

/** ドキュメントアイコンの描画サイズ (px) */
export const DOC_ICON_SIZE = 18;

/** ドキュメントアイコンの中心 X オフセット (px) */
export const DOC_ICON_CENTER_X = 18;

/** ドキュメントアイコンの中心 Y オフセット (px) */
export const DOC_ICON_CENTER_Y = 18;

/** ドキュメントタイトルの X オフセット (px) */
export const DOC_TITLE_X = 34;

/** ドキュメントタイトルの Y オフセット (px) */
export const DOC_TITLE_Y = 14;

/** ドキュメントタイトルの右マージン (px) */
export const DOC_TITLE_RIGHT_MARGIN = 44;

/** ドキュメントプレビューの X オフセット (px) */
export const DOC_PREVIEW_X = 10;

/** ドキュメントプレビューの Y オフセット (px) */
export const DOC_PREVIEW_Y = 40;

/** ドキュメントプレビューの行高さ (px) */
export const DOC_PREVIEW_LINE_HEIGHT = 15;

/** ドキュメントプレビューの右マージン (px) */
export const DOC_PREVIEW_RIGHT_MARGIN = 20;

// ── Border radius fallback ──

/** 付箋の角丸フォールバック (px) */
export const BORDER_RADIUS_STICKY = 4;

/** ドキュメントの角丸フォールバック (px) */
export const BORDER_RADIUS_DOC = 8;

/** フレームの角丸フォールバック (px) */
export const BORDER_RADIUS_FRAME = 8;

/** 画像の角丸フォールバック (px) */
export const BORDER_RADIUS_IMAGE = 4;

// ── Connector / Routing ──

/** 直交パスのデフォルトマージン (px) */
export const ORTHOGONAL_MARGIN = 20;

/** ベジェ曲線の最小制御点距離 (px) */
export const BEZIER_MIN_CP_DISTANCE = 30;

/** 接続ポイントが重なる場合のオフセット量 (px) */
export const OVERLAP_OFFSET = 30;

// ── Hit test ──

/** 接続ポイントのヒットテスト半径 (px、スケール前） */
export const CONNECTION_HIT_RADIUS = 10;

/** ノード辺境界のヒットテスト半径 (px、スケール前） */
export const BORDER_HIT_RADIUS = 20;

// ── Overlay drawing ──

/** エッジ端点ハンドルの描画半径 (px、スケール前） */
export const EDGE_ENDPOINT_DRAW_RADIUS = 7;

/** エッジ端点ハンドルの内円比率 */
export const EDGE_ENDPOINT_INNER_RATIO = 0.45;

/** 接続ポイントの描画半径 (px、スケール前） */
export const CONNECTION_POINT_DRAW_RADIUS = 6;

/** 接続ポイントの内円比率 */
export const CONNECTION_POINT_INNER_RATIO = 0.5;

/** バウンディングボックスのパディング (px、スケール前） */
export const BOUNDING_BOX_PADDING = 6;

/** スナップハイライトのパディング (px) */
export const SNAP_HIGHLIGHT_PADDING = 4;

/** スナップハイライトの線幅 (px) */
export const SNAP_HIGHLIGHT_STROKE_WIDTH = 3;

/** スマートガイドの延長量 (px) */
export const SMART_GUIDE_EXTENSION = 10;

// ── Lock indicator ──

/** ロックアイコンの描画サイズ (px、スケール前） */
export const LOCK_ICON_SIZE = 14;

/** ロックアイコンのオフセット (px、スケール前） */
export const LOCK_ICON_OFFSET = 4;

// ── Link icon ──

/** リンクアイコンのオフセット (px) */
export const LINK_ICON_OFFSET = 4;

// ── Mermaid import layout ──

/** Mermaid インポート時の水平方向ノード間隔 (px) */
export const MERMAID_SPACING_X_HORIZONTAL = 250;

/** Mermaid インポート時の垂直方向ノード間隔 (px、水平レイアウト） */
export const MERMAID_SPACING_Y_HORIZONTAL = 150;

/** Mermaid インポート時の水平方向ノード間隔 (px、垂直レイアウト） */
export const MERMAID_SPACING_X_VERTICAL = 200;

/** Mermaid インポート時の垂直方向ノード間隔 (px) */
export const MERMAID_SPACING_Y_VERTICAL = 180;

/** Mermaid インポート時のレイアウト原点オフセット (px) */
export const MERMAID_LAYOUT_ORIGIN = 100;

/** 太線エッジの線幅 (px) */
export const THICK_EDGE_STROKE_WIDTH = 4;
