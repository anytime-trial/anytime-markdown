import { GraphNode, NodeType } from '../types';
import { CanvasColors, getCanvasColors, FONT_FAMILY } from '../theme';
import {
  SHADOW_DEFAULT, SHADOW_STICKY,
  FONT_SIZE_PREVIEW,
  DASH_DEFAULT, DASH_FRAME, STROKE_WIDTH_SELECTED,
  TEXT_PREVIEW_MAX_CHARS, TEXT_PREVIEW_MAX_LINES, TEXT_LINE_MAX_CHARS,
  BORDER_RADIUS_STICKY, BORDER_RADIUS_DOC, BORDER_RADIUS_FRAME, BORDER_RADIUS_IMAGE,
  FRAME_TITLE_HEIGHT, FRAME_COLLAPSE_ICON_SIZE, FRAME_TITLE_TEXT_LEFT, FRAME_ICON_RIGHT_MARGIN, FRAME_TITLE_TEXT_RIGHT_MARGIN,
  DOC_ICON_SIZE, DOC_ICON_CENTER_X, DOC_ICON_CENTER_Y,
  DOC_TITLE_X, DOC_TITLE_Y, DOC_TITLE_RIGHT_MARGIN,
  DOC_PREVIEW_X, DOC_PREVIEW_Y, DOC_PREVIEW_LINE_HEIGHT, DOC_PREVIEW_RIGHT_MARGIN,
  EDGE_ENDPOINT_INNER_RATIO,
  LOCK_ICON_SIZE, LOCK_ICON_OFFSET,
} from './constants';
import {
  getCurrentColors, setCurrentColors,
  applyShadow, clearShadow, effectiveBorderRadius,
  drawRoundedRect,
  drawCylinderBody, drawCylinderTop,
  drawDiamond, drawParallelogram,
  getOrLoadImage,
} from './shapes';
import type { ShapePathFn } from './shapes';

/** 選択状態に応じた stroke スタイルを設定 */
export function setupStroke(ctx: CanvasRenderingContext2D, style: GraphNode['style'], selected: boolean): void {
  const currentColors = getCurrentColors();
  ctx.strokeStyle = selected ? currentColors.canvasSelection : style.stroke;
  ctx.lineWidth = selected ? STROKE_WIDTH_SELECTED : style.strokeWidth;
}

/** 角丸シェイプの共通描画パターン（shadow → fill → clearShadow → stroke） */
export function renderRoundedShape(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  selected: boolean,
  fill: string | CanvasGradient,
  radiusFallback: number,
): void {
  const { x, y, width, height, style } = node;
  const radius = effectiveBorderRadius(style, radiusFallback);
  applyShadow(ctx, style);
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  clearShadow(ctx);
  setupStroke(ctx, style, selected);
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();
}

/** 特殊タイプ描画関数の型 */
type SpecialShapeRenderer = (
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  selected: boolean,
  isDragging: boolean,
  fill: string | CanvasGradient,
) => void;


// --- Standard shape path functions ---

const drawEllipsePath: ShapePathFn = (ctx, x, y, w, h) => {
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
};

const drawDiamondPath: ShapePathFn = (ctx, x, y, w, h) => {
  drawDiamond(ctx, x, y, w, h);
};

const drawParallelogramPath: ShapePathFn = (ctx, x, y, w, h) => {
  drawParallelogram(ctx, x, y, w, h);
};

/**
 * 標準シェイプレジストリ。
 * applyShadow → pathFn → fill → clearShadow → pathFn → stroke の共通パターンで描画される。
 */
const standardShapePaths: Partial<Record<NodeType, ShapePathFn>> = {
  ellipse: drawEllipsePath,
  diamond: drawDiamondPath,
  parallelogram: drawParallelogramPath,
};

// --- Special shape renderers ---

const renderSticky: SpecialShapeRenderer = (ctx, node, selected, isDragging, fill) => {
  const { x, y, width, height, style } = node;
  const radius = effectiveBorderRadius(style, BORDER_RADIUS_STICKY);

  // sticky は常に影・角丸（ドラッグ中は上で設定済み）
  if (!isDragging) {
    const shadow = style.shadow ? SHADOW_DEFAULT : SHADOW_STICKY;
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }

  ctx.fillStyle = fill;
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fill();

  clearShadow(ctx);
  setupStroke(ctx, style, selected);
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.stroke();
};

const renderText: SpecialShapeRenderer = (ctx, node, selected) => {
  const currentColors = getCurrentColors();
  if (selected) {
    ctx.strokeStyle = currentColors.canvasSelection;
    ctx.lineWidth = 1;
    ctx.setLineDash([...DASH_DEFAULT]);
    ctx.strokeRect(node.x, node.y, node.width, node.height);
    ctx.setLineDash([]);
  }
};

const renderCylinder: SpecialShapeRenderer = (ctx, node, selected, _isDragging, fill) => {
  const { x, y, width, height, style } = node;
  applyShadow(ctx, style);
  ctx.fillStyle = fill;
  drawCylinderBody(ctx, x, y, width, height);
  ctx.fill();
  clearShadow(ctx);
  setupStroke(ctx, style, selected);
  drawCylinderBody(ctx, x, y, width, height);
  ctx.stroke();
  setupStroke(ctx, style, selected);
  drawCylinderTop(ctx, x, y, width, height);
  ctx.stroke();
};

const renderDoc: SpecialShapeRenderer = (ctx, node, selected, _isDragging, fill) => {
  const currentColors = getCurrentColors();
  const { x, y, width, style, text } = node;
  renderRoundedShape(ctx, node, selected, fill, BORDER_RADIUS_DOC);
  // Doc icon (path-based)
  ctx.fillStyle = currentColors.docIconColor;
  ctx.strokeStyle = currentColors.docIconColor;
  drawDocIcon(ctx, x + DOC_ICON_CENTER_X, y + DOC_ICON_CENTER_Y, DOC_ICON_SIZE);
  // Title
  if (text) {
    ctx.fillStyle = currentColors.textPrimary;
    ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + DOC_TITLE_X, y + DOC_TITLE_Y, width - DOC_TITLE_RIGHT_MARGIN);
  }
  // Preview text
  if (node.docContent) {
    ctx.fillStyle = currentColors.textSecondary;
    ctx.font = `${FONT_SIZE_PREVIEW}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const preview = node.docContent.slice(0, TEXT_PREVIEW_MAX_CHARS).split('\n').slice(0, TEXT_PREVIEW_MAX_LINES);
    preview.forEach((line, i) => {
      ctx.fillText(line.slice(0, TEXT_LINE_MAX_CHARS), x + DOC_PREVIEW_X, y + DOC_PREVIEW_Y + i * DOC_PREVIEW_LINE_HEIGHT, width - DOC_PREVIEW_RIGHT_MARGIN);
    });
  }
};

const renderImage: SpecialShapeRenderer = (ctx, node, selected) => {
  const { x, y, width, height, style } = node;
  const r = effectiveBorderRadius(style, BORDER_RADIUS_IMAGE);

  applyShadow(ctx, style);
  // 背景プレースホルダー
  ctx.fillStyle = style.fill;
  drawRoundedRect(ctx, x, y, width, height, r);
  ctx.fill();
  clearShadow(ctx);
  // 画像描画
  if (node.imageData) {
    const img = getOrLoadImage(node.imageData);
    if (img) {
      ctx.save();
      drawRoundedRect(ctx, x, y, width, height, r);
      ctx.clip();
      ctx.drawImage(img, x, y, width, height);
      ctx.restore();
    }
  }
  // 枠線
  setupStroke(ctx, style, selected);
  drawRoundedRect(ctx, x, y, width, height, r);
  ctx.stroke();
};

const renderFrame: SpecialShapeRenderer = (ctx, node, selected, _isDragging, fill) => {
  const currentColors = getCurrentColors();
  const { x, y, width, height, style, text } = node;
  const fr = effectiveBorderRadius(style, BORDER_RADIUS_FRAME);
  const titleH = FRAME_TITLE_HEIGHT;

  if (node.collapsed) {
    // --- 折りたたみ時: タイトルバーのみの矩形 ---
    ctx.fillStyle = currentColors.frameTitleBg;
    drawRoundedRect(ctx, x, y, width, titleH, fr);
    ctx.fill();
    setupStroke(ctx, style, selected);
    drawRoundedRect(ctx, x, y, width, titleH, fr);
    ctx.stroke();
  } else {
    // --- 展開時: 通常のフレーム描画 ---
    ctx.fillStyle = fill;
    drawRoundedRect(ctx, x, y, width, height, fr);
    ctx.fill();
    setupStroke(ctx, style, selected);
    ctx.setLineDash([...DASH_FRAME]);
    drawRoundedRect(ctx, x, y, width, height, fr);
    ctx.stroke();
    ctx.setLineDash([]);
    // タイトルバー
    ctx.fillStyle = currentColors.frameTitleBg;
    drawRoundedRect(ctx, x, y, width, titleH, fr);
    ctx.fill();
    ctx.fillRect(x, y + titleH - fr, width, fr);
  }

  // タイトルテキスト
  if (text) {
    ctx.fillStyle = currentColors.textSecondary;
    ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + FRAME_TITLE_TEXT_LEFT, y + titleH / 2, width - FRAME_TITLE_TEXT_RIGHT_MARGIN);
  }

  // 折りたたみ/展開アイコン（三角形）
  const iconSize = FRAME_COLLAPSE_ICON_SIZE;
  const iconX = x + width - FRAME_ICON_RIGHT_MARGIN - iconSize / 2;
  const iconY = y + titleH / 2;
  ctx.fillStyle = currentColors.textSecondary;
  ctx.beginPath();
  if (node.collapsed) {
    // 右向き三角 ▶
    ctx.moveTo(iconX - iconSize / 2, iconY - iconSize / 2);
    ctx.lineTo(iconX + iconSize / 2, iconY);
    ctx.lineTo(iconX - iconSize / 2, iconY + iconSize / 2);
  } else {
    // 下向き三角 ▼
    ctx.moveTo(iconX - iconSize / 2, iconY - iconSize / 3);
    ctx.lineTo(iconX + iconSize / 2, iconY - iconSize / 3);
    ctx.lineTo(iconX, iconY + iconSize / 2);
  }
  ctx.closePath();
  ctx.fill();
};

const renderRect: SpecialShapeRenderer = (ctx, node, selected, _isDragging, fill) => {
  const { x, y, width, height, style } = node;
  const radius = style.borderRadius ?? 0;

  applyShadow(ctx, style);
  ctx.fillStyle = fill;
  if (radius > 0) {
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.fill();
    clearShadow(ctx);
    setupStroke(ctx, style, selected);
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, width, height);
    clearShadow(ctx);
    setupStroke(ctx, style, selected);
    ctx.strokeRect(x, y, width, height);
  }
};

/** パスベースのドキュメントアイコンを描画 */
function drawDocIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const s = size;
  const fold = s * 0.25;
  ctx.save();
  // Main body
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.35, cy - s * 0.45);
  ctx.lineTo(cx + s * 0.35 - fold, cy - s * 0.45);
  ctx.lineTo(cx + s * 0.35, cy - s * 0.45 + fold);
  ctx.lineTo(cx + s * 0.35, cy + s * 0.45);
  ctx.lineTo(cx - s * 0.35, cy + s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Fold
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.35 - fold, cy - s * 0.45);
  ctx.lineTo(cx + s * 0.35 - fold, cy - s * 0.45 + fold);
  ctx.lineTo(cx + s * 0.35, cy - s * 0.45 + fold);
  ctx.stroke();
  ctx.restore();
}

/**
 * 特殊描画が必要なシェイプのレジストリ。
 * 標準パターンに収まらないタイプはここに登録。
 */
export const specialShapes: Partial<Record<NodeType, SpecialShapeRenderer>> = {
  sticky: renderSticky,
  text: renderText,
  cylinder: renderCylinder,
  doc: renderDoc,
  image: renderImage,
  frame: renderFrame,
  rect: renderRect,
};

/** テキスト描画をスキップするタイプ */
export const skipTextTypes: ReadonlySet<NodeType> = new Set([
  'doc', 'frame', 'image',
]);

export { standardShapePaths };

// --- Lock icon rendering ---

/** パスベースの南京錠アイコンを描画 */
function drawLockIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const s = size;
  const currentColors = getCurrentColors();
  ctx.save();
  ctx.fillStyle = currentColors.lockIcon;
  ctx.strokeStyle = currentColors.lockIcon;
  ctx.lineWidth = 1.5;
  // Lock body (rectangle)
  ctx.fillRect(cx - s * 0.35, cy, s * 0.7, s * 0.5);
  // Lock shackle (arc)
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.25, Math.PI, 0);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** ロック中ノードに南京錠アイコンを描画 */
export function drawLockIndicator(ctx: CanvasRenderingContext2D, node: GraphNode, scale: number, colors?: CanvasColors): void {
  setCurrentColors(colors ?? getCanvasColors(true));
  const size = LOCK_ICON_SIZE / scale;
  const px = node.x + node.width - size - LOCK_ICON_OFFSET / scale;
  const py = node.y + LOCK_ICON_OFFSET / scale;
  drawLockIcon(ctx, px + size / 2, py + size / 2, size);
}
