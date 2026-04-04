import { GraphNode, NodeType } from '../types';
import { CanvasColors, FONT_FAMILY, getCanvasColors } from '../theme';
import {
  SHADOW_DEFAULT, SHADOW_STICKY, SHADOW_DRAGGING,
  FONT_SIZE_PREVIEW, FONT_SIZE_LINK_ICON,
  DASH_DEFAULT, DASH_FRAME, STROKE_WIDTH_SELECTED,
  TEXT_PREVIEW_MAX_CHARS, TEXT_PREVIEW_MAX_LINES, TEXT_LINE_MAX_CHARS,
} from './constants';
import type { ShadowStyle } from './constants';

/** drawNode 呼び出し中に有効な色設定（モジュールスコープ） */
let currentColors: CanvasColors = getCanvasColors(true);

const MAX_IMAGE_CACHE = 50;

/** 画像キャッシュ（dataURL → HTMLImageElement） */
const imageCache = new Map<string, HTMLImageElement>();

function getOrLoadImage(dataUrl: string): HTMLImageElement | null {
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
function makeFill(ctx: CanvasRenderingContext2D, style: GraphNode['style'], x: number, y: number, w: number, h: number): string | CanvasGradient {
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
function applyShadow(ctx: CanvasRenderingContext2D, style: GraphNode['style'], shadow: ShadowStyle = SHADOW_DEFAULT): void {
  if (style.shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
}

/** borderRadius の実効値を算出（未設定時はフォールバック値を使用） */
function effectiveBorderRadius(style: GraphNode['style'], fallback: number): number {
  return Math.max(fallback, style.borderRadius ?? 0);
}

/** 角丸シェイプの共通描画パターン（shadow → fill → clearShadow → stroke） */
function renderRoundedShape(
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

function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** 選択状態に応じた stroke スタイルを設定 */
function setupStroke(ctx: CanvasRenderingContext2D, style: GraphNode['style'], selected: boolean): void {
  ctx.strokeStyle = selected ? currentColors.canvasSelection : style.stroke;
  ctx.lineWidth = selected ? STROKE_WIDTH_SELECTED : style.strokeWidth;
}

// ---------------------------------------------------------------------------
// Shape renderers
// ---------------------------------------------------------------------------

/** 特殊タイプ描画関数の型 */
type SpecialShapeRenderer = (
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  selected: boolean,
  isDragging: boolean,
  fill: string | CanvasGradient,
) => void;

/** 標準シェイプのパス描画関数の型 */
type ShapePathFn = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  node: GraphNode,
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

// --- Standard shape rendering (shared pattern) ---

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

// --- Special shape renderers ---

const renderSticky: SpecialShapeRenderer = (ctx, node, selected, isDragging, fill) => {
  const { x, y, width, height, style } = node;
  const radius = effectiveBorderRadius(style, 4);

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
  const { x, y, width, style, text } = node;
  renderRoundedShape(ctx, node, selected, fill, 8);
  // Doc icon (path-based)
  ctx.fillStyle = currentColors.docIconColor;
  ctx.strokeStyle = currentColors.docIconColor;
  drawDocIcon(ctx, x + 18, y + 18, 18);
  // Title
  if (text) {
    ctx.fillStyle = currentColors.textPrimary;
    ctx.font = `bold ${style.fontSize}px ${style.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + 34, y + 14, width - 44);
  }
  // Preview text
  if (node.docContent) {
    ctx.fillStyle = currentColors.textSecondary;
    ctx.font = `${FONT_SIZE_PREVIEW}px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const preview = node.docContent.slice(0, TEXT_PREVIEW_MAX_CHARS).split('\n').slice(0, TEXT_PREVIEW_MAX_LINES);
    preview.forEach((line, i) => {
      ctx.fillText(line.slice(0, TEXT_LINE_MAX_CHARS), x + 10, y + 40 + i * 15, width - 20);
    });
  }
};

const renderImage: SpecialShapeRenderer = (ctx, node, selected) => {
  const { x, y, width, height, style } = node;
  const r = effectiveBorderRadius(style, 4);

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
  const { x, y, width, height, style, text } = node;
  const fr = effectiveBorderRadius(style, 8);
  const titleH = 28;

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
    ctx.fillText(text, x + 12, y + titleH / 2, width - 40);
  }

  // 折りたたみ/展開アイコン（三角形）
  const iconSize = 10;
  const iconX = x + width - 12 - iconSize / 2;
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

/**
 * 特殊描画が必要なシェイプのレジストリ。
 * 標準パターンに収まらないタイプはここに登録。
 */
const specialShapes: Partial<Record<NodeType, SpecialShapeRenderer>> = {
  sticky: renderSticky,
  text: renderText,
  cylinder: renderCylinder,
  doc: renderDoc,
  image: renderImage,
  frame: renderFrame,
  rect: renderRect,
};

/** テキスト描画をスキップするタイプ */
const skipTextTypes: ReadonlySet<NodeType> = new Set([
  'doc', 'frame', 'image',
]);

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

    const padding = 8;
    const maxWidth = width - padding * 2;
    const wrappedLines = wrapText(ctx, text, maxWidth);
    const lineHeight = style.fontSize * 1.3;
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
    ctx.fillText('\u{1F517}', x + width - 4, y + 4);
    ctx.restore();
  }

  ctx.restore();
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
  const offset = w * 0.2;
  ctx.beginPath();
  ctx.moveTo(x + offset, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - offset, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export function drawCylinderBody(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const ry = h * 0.12;
  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.lineTo(x, y + h - ry);
  ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + w, y + ry);
  ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, Math.PI, true);
  ctx.closePath();
}

export function drawCylinderTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const ry = h * 0.12;
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

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { lines.push(''); continue; }

    let currentLine = '';
    // Split by spaces while preserving CJK character boundaries
    const tokens = paragraph.match(/\S+|\s/g) ?? [paragraph];

    for (const token of tokens) {
      if (token === ' ') {
        const testLine = currentLine + ' ';
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = '';
        } else {
          currentLine = testLine;
        }
        continue;
      }

      const testLine = currentLine + token;
      if (ctx.measureText(testLine).width <= maxWidth || currentLine === '') {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = token;
      }

      // If single token exceeds maxWidth, break it character by character
      if (ctx.measureText(currentLine).width > maxWidth) {
        let rebuild = '';
        for (const c of currentLine) {
          const test = rebuild + c;
          if (ctx.measureText(test).width > maxWidth && rebuild) {
            lines.push(rebuild);
            rebuild = c;
          } else {
            rebuild = test;
          }
        }
        currentLine = rebuild;
      }
    }

    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

/** パスベースの南京錠アイコンを描画 */
function drawLockIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const s = size;
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

/** ロック中ノードに南京錠アイコンを描画 */
export function drawLockIndicator(ctx: CanvasRenderingContext2D, node: GraphNode, scale: number, colors?: CanvasColors): void {
  currentColors = colors ?? getCanvasColors(true);
  const size = 14 / scale;
  const px = node.x + node.width - size - 4 / scale;
  const py = node.y + 4 / scale;
  drawLockIcon(ctx, px + size / 2, py + size / 2, size);
}
