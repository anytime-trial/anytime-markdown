/**
 * graph-viewer vanilla ShapeIcons ファクトリ群。
 *
 * React 版 `components/ShapeIcons.tsx` の vanilla 移植。
 * 各図形種別のカスタム SVG アイコンを DOM エレメントとして生成する。
 * Material Icons に存在しない独自形状（diamond / parallelogram / sticky-note / cylinder）を実装。
 */

import { resolveFontSize, resolveColor, type IconOptions } from '../ui-vanilla/SvgIcon';

export type { IconOptions };

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SvgIcon を直接呼ばずに汎用 SVG 要素を構築する内部ヘルパー。 */
function buildCustomSvg(
  opts: Readonly<IconOptions>,
  builder: (svg: SVGSVGElement) => void,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  if (opts.className) svg.setAttribute('class', opts.className);
  svg.style.fontSize = resolveFontSize(opts.fontSize);
  const color = resolveColor(opts.color);
  if (color != null) svg.style.color = color;

  builder(svg);
  return svg;
}

function addPath(svg: SVGSVGElement, d: string, extra: Readonly<Record<string, string>>): void {
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('d', d);
  for (const [k, v] of Object.entries(extra)) {
    el.setAttribute(k, v);
  }
  svg.appendChild(el);
}

function addEllipse(
  svg: SVGSVGElement,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  extra: Readonly<Record<string, string>>,
): void {
  const el = document.createElementNS(SVG_NS, 'ellipse');
  el.setAttribute('cx', String(cx));
  el.setAttribute('cy', String(cy));
  el.setAttribute('rx', String(rx));
  el.setAttribute('ry', String(ry));
  for (const [k, v] of Object.entries(extra)) {
    el.setAttribute(k, v);
  }
  svg.appendChild(el);
}

const STROKE_ATTRS = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
} as const satisfies Record<string, string>;

/**
 * Diamond（ひし形）アイコン。
 *
 * @param opts - サイズ・色オプション（{@link IconOptions} 参照）
 * @returns `SVGSVGElement`
 */
export function createDiamondShapeIcon(opts: Readonly<IconOptions> = {}): SVGSVGElement {
  return buildCustomSvg(opts, (svg) => {
    addPath(svg, 'M12 2 L22 12 L12 22 L2 12 Z', STROKE_ATTRS);
  });
}

/**
 * Parallelogram（平行四辺形）アイコン。
 *
 * @param opts - サイズ・色オプション
 * @returns `SVGSVGElement`
 */
export function createParallelogramShapeIcon(opts: Readonly<IconOptions> = {}): SVGSVGElement {
  return buildCustomSvg(opts, (svg) => {
    addPath(svg, 'M6 4 L22 4 L18 20 L2 20 Z', STROKE_ATTRS);
  });
}

/**
 * StickyNote（付箋）アイコン。
 *
 * @param opts - サイズ・色オプション
 * @returns `SVGSVGElement`
 */
export function createStickyNoteShapeIcon(opts: Readonly<IconOptions> = {}): SVGSVGElement {
  return buildCustomSvg(opts, (svg) => {
    addPath(svg, 'M3 3 L3 21 L15 21 L21 15 L21 3 Z', STROKE_ATTRS);
    addPath(svg, 'M15 21 L15 15 L21 15', STROKE_ATTRS);
  });
}

/**
 * Cylinder（シリンダー）アイコン。
 *
 * @param opts - サイズ・色オプション
 * @returns `SVGSVGElement`
 */
export function createCylinderShapeIcon(opts: Readonly<IconOptions> = {}): SVGSVGElement {
  return buildCustomSvg(opts, (svg) => {
    addEllipse(svg, 12, 5, 9, 3, STROKE_ATTRS);
    addPath(
      svg,
      'M3 5 L3 19 C3 20.66 7.03 22 12 22 C16.97 22 21 20.66 21 19 L21 5',
      STROKE_ATTRS,
    );
  });
}
