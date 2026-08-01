import type { ImageAnnotation } from "../types/imageAnnotation";

/**
 * 画像アノテーションを vanilla SVG（React 非依存）で描画するビルダー。
 *
 * 旧 `AnnotationOverlay`（React コンポーネント）の読み取り専用描画を DOM API へ
 * 移植したもの。framework-decoupling Phase 2 の native ImageBlock content で使う。
 * 座標は画像に対する % 値（viewBox 0..100, preserveAspectRatio=none）。
 */
const SVG_NS = "http://www.w3.org/2000/svg";

const STROKE_WIDTH = "2";

function el(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function buildShape(a: ImageAnnotation): SVGElement | null {
  const base = { stroke: a.color, "stroke-width": STROKE_WIDTH, fill: "none" };
  if (a.type === "rect") {
    return el("rect", {
      x: String(Math.min(a.x1, a.x2)),
      y: String(Math.min(a.y1, a.y2)),
      width: String(Math.abs(a.x2 - a.x1)),
      height: String(Math.abs(a.y2 - a.y1)),
      ...base,
    });
  }
  if (a.type === "circle") {
    return el("ellipse", {
      cx: String((a.x1 + a.x2) / 2),
      cy: String((a.y1 + a.y2) / 2),
      rx: String(Math.abs(a.x2 - a.x1) / 2),
      ry: String(Math.abs(a.y2 - a.y1) / 2),
      ...base,
    });
  }
  if (a.type === "line") {
    return el("line", {
      x1: String(a.x1),
      y1: String(a.y1),
      x2: String(a.x2),
      y2: String(a.y2),
      ...base,
    });
  }
  return null;
}

function buildAnnotationGroup(a: ImageAnnotation, index: number): SVGGElement {
  const g = el("g", {}) as SVGGElement;
  const shape = buildShape(a);
  if (shape) g.appendChild(shape);

  const badgeX = String(Math.min(a.x1, a.x2));
  const badgeY = String(Math.min(a.y1, a.y2));
  g.appendChild(el("circle", { cx: badgeX, cy: badgeY, r: "2.5", fill: a.color }));

  const text = el("text", {
    x: badgeX,
    y: badgeY,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    "font-size": "3",
    fill: "white",
    "font-weight": "bold",
  });
  text.style.pointerEvents = "none";
  text.textContent = String(index + 1);
  g.appendChild(text);
  return g;
}

/** アノテーション配列から読み取り専用の SVG オーバーレイ要素を生成する（空なら null）。 */
export function buildAnnotationSvg(
  annotations: readonly ImageAnnotation[],
): SVGSVGElement | null {
  if (annotations.length === 0) return null;
  const svg = el("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "none",
  }) as SVGSVGElement;
  svg.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
  annotations.forEach((a, i) => svg.appendChild(buildAnnotationGroup(a, i)));
  return svg;
}
