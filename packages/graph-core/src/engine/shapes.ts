import { GraphNode } from '../types';
import { CanvasColors, FONT_FAMILY, getCanvasColors } from '../theme';
import {
  SHADOW_DEFAULT, SHADOW_DRAGGING,
  FONT_SIZE_LINK_ICON,
  NODE_TEXT_PADDING, TEXT_LINE_HEIGHT_RATIO,
  PARALLELOGRAM_OFFSET_RATIO, CYLINDER_ELLIPSE_RATIO,
  LINK_ICON_OFFSET,
} from './constants';
import type { ShadowStyle } from './constants';
import { specialShapes, standardShapePaths, skipTextTypes, setupStroke } from './shapeRenderers';
import { wrapText } from './textRendering';

/** drawNode 呼び出し中に有効な色設定（モジュールスコープ） */
let currentColors: CanvasColors = getCanvasColors(true);

export function getCurrentColors(): CanvasColors {
  return currentColors;
}

export function setCurrentColors(colors: CanvasColors): void {
  currentColors = colors;
}

const MAX_IMAGE_CACHE = 50;

/** 画像キャッシュ（dataURL → HTMLImageElement） */
const imageCache = new Map<string, HTMLImageElement>();

export function getOrLoadImage(dataUrl: string): HTMLImageElement | null {
  const cached = imageCache.get(dataUrl);
  if (cached) {
    // LRU: ヒット時にエントリを末尾に移動
    imageCache.delete(dataUrl);
    imageCache.set(dataUrl, cached);
    return cached.complete ? cached : null;
  }
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.src = dataUrl;
  imageCache.set(dataUrl, img);
  // LRU: 最大エントリ数を超えたら最古を削除
  if (imageCache.size > MAX_IMAGE_CACHE) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }
  return img.complete ? img : null;
}

/** ドキュメント切替時などにキャッシュをクリア */
export function clearImageCache(): void {
  imageCache.clear();
}

/** グラデーション fill を生成 */
export function makeFill(ctx: CanvasRenderingContext2D, style: GraphNode['style'], x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (!style.gradientTo) return style.fill;
  const dir = style.gradientDirection ?? 'vertical';
  let grd: CanvasGradient;
  if (dir === 'horizontal') grd = ctx.createLinearGradient(x, y, x + w, y);
  else if (dir === 'diagonal') grd = ctx.createLinearGradient(x, y, x + w, y + h);
  else grd = ctx.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, style.fill);
  grd.addColorStop(1, style.gradientTo);
  return grd;
}

/** 影を適用 */
export function applyShadow(ctx: CanvasRenderingContext2D, style: GraphNode['style'], shadow: ShadowStyle = SHADOW_DEFAULT): void {
  if (style.shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
}

export function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** borderRadius の実効値を算出（未設定時はフォールバック値を使用） */
export function effectiveBorderRadius(style: GraphNode['style'], fallback: number): number {
  return Math.max(fallback, style.borderRadius ?? 0);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function drawNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  selected: boolean,
  isDragging: boolean = false,
  colors?: CanvasColors,
): void {
  currentColors = colors ?? getCanvasColors(true);
  ctx.save();

  // ドラッグ中の浮き上がりエフェクト
  if (isDragging) {
    ctx.shadowColor = SHADOW_DRAGGING.color;
    ctx.shadowBlur = SHADOW_DRAGGING.blur;
    ctx.shadowOffsetX = SHADOW_DRAGGING.offsetX;
    ctx.shadowOffsetY = SHADOW_DRAGGING.offsetY;
  }

  const { x, y, width, height, type, style, text } = node;
  const fill = makeFill(ctx, style, x, y, width, height);

  // 1. 特殊レンダラーを検索
  const specialRenderer = specialShapes[type];
  if (specialRenderer) {
    specialRenderer(ctx, node, selected, isDragging, fill);
  } else {
    // 2. 標準シェイプレジストリを検索
    const pathFn = standardShapePaths[type];
    if (pathFn) {
      renderStandardShape(ctx, node, selected, fill, pathFn);
    }
  }

  // 共通テキスト描画（特殊タイプは個別にテキストを処理済み）
  if (text && !skipTextTypes.has(type)) {
    ctx.fillStyle = currentColors.textPrimary;
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const padding = NODE_TEXT_PADDING;
    const maxWidth = width - padding * 2;
    const wrappedLines = wrapText(ctx, text, maxWidth);
    const lineHeight = style.fontSize * TEXT_LINE_HEIGHT_RATIO;
    const maxLines = Math.max(1, Math.floor((height - padding * 2) / lineHeight));
    const visibleLines = wrappedLines.slice(0, maxLines);
    if (wrappedLines.length > maxLines && visibleLines.length > 0) {
      visibleLines[visibleLines.length - 1] += '\u2026';
    }
    const totalHeight = visibleLines.length * lineHeight;
    const startY = y + height / 2 - totalHeight / 2 + lineHeight / 2;

    visibleLines.forEach((line, i) => {
      ctx.fillText(line, x + width / 2, startY + i * lineHeight, maxWidth);
    });
  }

  // リンクアイコン（URL設定済みノード）
  if (node.url) {
    ctx.save();
    ctx.font = `${FONT_SIZE_LINK_ICON}px ${FONT_FAMILY}`;
    ctx.fillStyle = currentColors.accentColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('\u{1F517}', x + width - LINK_ICON_OFFSET, y + LINK_ICON_OFFSET);
    ctx.restore();
  }

  ctx.restore();
}

/** 標準シェイプのパス描画関数の型 */
export type ShapePathFn = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  node: GraphNode,
) => void;

function renderStandardShape(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  selected: boolean,
  fill: string | CanvasGradient,
  pathFn: ShapePathFn,
): void {
  const { x, y, width, height, style } = node;
  applyShadow(ctx, style);
  ctx.fillStyle = fill;
  pathFn(ctx, x, y, width, height, node);
  ctx.fill();
  clearShadow(ctx);
  setupStroke(ctx, style, selected);
  pathFn(ctx, x, y, width, height, node);
  ctx.stroke();
}

export function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w / 2, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

export function drawParallelogram(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const offset = w * PARALLELOGRAM_OFFSET_RATIO;
  ctx.beginPath();
  ctx.moveTo(x + offset, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - offset, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export function drawCylinderBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const ry = h * CYLINDER_ELLIPSE_RATIO;
  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.lineTo(x, y + h - ry);
  ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + w, y + ry);
  ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI, true);
  ctx.closePath();
}

export function drawCylinderTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const ry = h * CYLINDER_ELLIPSE_RATIO;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI * 2);
  ctx.closePath();
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}
