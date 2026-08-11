import { GraphDocument, GraphNode, GraphEdge } from '../types';
import { computeOrthogonalPath, bestSides, getConnectionPoints, computeBezierPath } from '../engine/connector';
import { computeVisibilityPath } from '../engine/orthogonalRouter';
import {
  CANVAS_BG, COLOR_TEXT_PRIMARY,
  FONT_FAMILY,
} from '../theme';
import { escapeXml } from './utils';

/**
 * SVG テキストをノード幅に合わせて行に折り返す（純粋・文字幅推定ベース）。
 * 明示的な改行を尊重し、空白を含む英文は単語単位、CJK 等は文字単位で折り返す。
 */
function wrapSvgText(text: string, width: number, fontSize: number): string[] {
  const explicit = text.split('\n');
  const maxChars = Math.max(1, Math.floor((width - 16) / (fontSize * 0.62)));
  const out: string[] = [];
  for (const seg of explicit) {
    out.push(...wrapSvgSegment(seg, maxChars));
  }
  return out.length ? out : [''];
}

/** 明示的な改行で切った 1 セグメントを、行数分の文字列へ折り返す。 */
function wrapSvgSegment(seg: string, maxChars: number): string[] {
  if (seg.length <= maxChars) { return [seg]; }
  const hasSpaces = /\s/.test(seg.trim());
  return hasSpaces ? wrapSvgByWords(seg, maxChars) : wrapSvgByChars(seg, maxChars);
}

/** 空白を含む英文などを単語単位で折り返す。 */
function wrapSvgByWords(seg: string, maxChars: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of seg.split(/(\s+)/)) {
    if ((line + word).trim().length > maxChars && line.trim()) {
      out.push(line.trim());
      line = word;
    } else {
      line += word;
    }
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

/** CJK 等、空白の無い文字列を文字単位で折り返す。 */
function wrapSvgByChars(seg: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < seg.length; i += maxChars) out.push(seg.slice(i, i + maxChars));
  return out;
}

function renderNodeSvg(node: GraphNode, gradFill?: string, textColor: string = COLOR_TEXT_PRIMARY): string {
  const { id, type, x, y, width: w, height: h, text, style } = node;
  const lines: string[] = [];
  const fill = gradFill ?? escapeXml(style.fill);
  const stroke = escapeXml(style.stroke);
  const sw = style.strokeWidth;
  const r = style.borderRadius ?? 0;
  const filterAttr = style.shadow ? ' filter="url(#shadow)"' : '';

  const metadataAttr = node.metadata
    ? ` data-metadata="${escapeXml(JSON.stringify(node.metadata))}"`
    : '';
  lines.push(`<g id="${escapeXml(id)}"${metadataAttr}>`);

  if (type === 'ellipse') {
    lines.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${filterAttr}/>`);
  } else if (type === 'diamond') {
    const pts = `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
    lines.push(`<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${filterAttr}/>`);
  } else if (type === 'parallelogram') {
    const offset = w * 0.2;
    lines.push(`<polygon points="${x + offset},${y} ${x + w},${y} ${x + w - offset},${y + h} ${x},${y + h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${filterAttr}/>`);
  } else if (type === 'cylinder') {
    const ry = h * 0.1;
    lines.push(
      `<path d="M${x},${y + ry} A${w / 2},${ry} 0 0,1 ${x + w},${y + ry} V${y + h - ry} A${w / 2},${ry} 0 0,1 ${x},${y + h - ry} Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${filterAttr}/>`,
      `<ellipse cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`,
    );
  } else if (type === 'frame') {
    lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="8 4" rx="${r}"${filterAttr}/>`);
  } else if (type === 'image') {
    lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="${r}"${filterAttr}/>`);
    if (node.imageData) {
      lines.push(`<image href="${escapeXml(node.imageData)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`);
    }
  } else if (type === 'sticky') {
    lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${filterAttr}/>`);
  } else if (type === 'text') {
    // テキストノードは枠なし
  } else {
    lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="${r}"${filterAttr}/>`);
  }

  if (text) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const fontColor = escapeXml(style.fontColor ?? textColor);
    const lineHeight = style.fontSize * 1.25;
    const wrapped = wrapSvgText(text, w, style.fontSize);
    const startY = cy - ((wrapped.length - 1) * lineHeight) / 2;
    const tspans = wrapped
      .map((ln, i) => `<tspan x="${cx}" y="${startY + i * lineHeight}">${escapeXml(ln)}</tspan>`)
      .join('');
    lines.push(`<text text-anchor="middle" dominant-baseline="central" fill="${fontColor}" font-size="${style.fontSize}" font-family="${FONT_FAMILY}">${tspans}</text>`);
  }

  lines.push('</g>');
  return lines.join('\n');
}

function resolveEdgePoints(edge: GraphEdge, nodes: GraphNode[]): { x: number; y: number }[] {
  if (edge.type !== 'connector' || !edge.from.nodeId || !edge.to.nodeId) {
    return [];
  }
  const fromNode = nodes.find(n => n.id === edge.from.nodeId);
  const toNode = nodes.find(n => n.id === edge.to.nodeId);
  if (!fromNode || !toNode) {
    return [];
  }
  if (edge.manualMidpoint !== undefined) {
    return computeOrthogonalPath(fromNode, toNode, 20, edge.manualMidpoint);
  }
  const obstacles = nodes
    .filter(n => n.id !== fromNode.id && n.id !== toNode.id)
    .map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
  const sides = bestSides(fromNode, toNode);
  const fromPts = getConnectionPoints(fromNode);
  const toPts = getConnectionPoints(toNode);
  const fromPt = fromPts.find(p => p.side === sides.fromSide) ?? fromPts[0];
  const toPt = toPts.find(p => p.side === sides.toSide) ?? toPts[0];
  return computeVisibilityPath(fromPt, sides.fromSide, toPt, sides.toSide, obstacles);
}

/**
 * routing:'bezier' の connector エッジについて、境界間の3次ベジェ制御点
 * [start, cp1, cp2, end] を返す（それ以外は null）。静的 SVG 出力でも
 * ライブエンジンと同じ曲線（FreeMind 風マインドマップ等）を描くために使う。
 */
function resolveBezierPath(edge: GraphEdge, nodes: GraphNode[]): { x: number; y: number }[] | null {
  if (edge.type !== 'connector' || edge.style.routing !== 'bezier') {
    return null;
  }
  if (!edge.from.nodeId || !edge.to.nodeId) {
    return null;
  }
  const fromNode = nodes.find(n => n.id === edge.from.nodeId);
  const toNode = nodes.find(n => n.id === edge.to.nodeId);
  if (!fromNode || !toNode) {
    return null;
  }
  return computeBezierPath(fromNode, toNode);
}

/** 線の端 `tip` に、`from` から `tip` へ向かう矢頭を描く。 */
function pushArrowPolygon(
  lines: string[],
  tip: { x: number; y: number },
  from: { x: number; y: number },
  stroke: string,
): void {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const len = 12;
  const x1 = tip.x - len * Math.cos(angle - Math.PI / 6);
  const y1 = tip.y - len * Math.sin(angle - Math.PI / 6);
  const x2 = tip.x - len * Math.cos(angle + Math.PI / 6);
  const y2 = tip.y - len * Math.sin(angle + Math.PI / 6);
  lines.push(`<polygon points="${tip.x},${tip.y} ${x1},${y1} ${x2},${y2}" fill="${stroke}"/>`);
}

/**
 * 両端の矢頭を描く。
 *
 * Why not 終端だけを見るか: drawio 出力と canvas 描画は `startShape` を扱うのに SVG だけが
 * 見ておらず、双方向の関係を書き出すと始端の矢印が消えていた（同じ図が経路によって別の意味に
 * なる）。
 */
function renderArrowMarker(
  lines: string[],
  points: { x: number; y: number }[],
  edge: GraphEdge,
  stroke: string,
): void {
  const hasPoints = points.length >= 2;
  const last = hasPoints ? points.at(-1)! : { x: edge.to.x, y: edge.to.y };
  const beforeLast = hasPoints ? points.at(-2)! : { x: edge.from.x, y: edge.from.y };
  const first = hasPoints ? points[0] : { x: edge.from.x, y: edge.from.y };
  const afterFirst = hasPoints ? points[1] : { x: edge.to.x, y: edge.to.y };

  const endShape = edge.style.endShape ?? (edge.type === 'connector' ? 'arrow' : 'none');
  if (endShape === 'arrow') pushArrowPolygon(lines, last, beforeLast, stroke);

  const startShape = edge.style.startShape ?? 'none';
  if (startShape === 'arrow') pushArrowPolygon(lines, first, afterFirst, stroke);
}

function renderEdgeSvg(edge: GraphEdge, nodes: GraphNode[], textColor: string = COLOR_TEXT_PRIMARY): string {
  const { id, style } = edge;
  const stroke = escapeXml(style.stroke);
  const sw = style.strokeWidth;
  const dashAttr = style.dashed ? ' stroke-dasharray="6 4"' : '';
  const lines: string[] = [];
  const metadataAttr = edge.metadata
    ? ` data-metadata="${escapeXml(JSON.stringify(edge.metadata))}"`
    : '';
  // ラベルがあればクリック対象/インライン編集アンカーをラベル <text> に置く
  // （エッジ <g> の bbox は線分全長に及び、編集欄が肥大化するため）。
  // ラベルが無いメタデータ付きエッジは従来どおり <g> に出力する。
  const labelCarriesMetadata = Boolean(edge.metadata) && Boolean(edge.label);
  lines.push(`<g id="${escapeXml(id)}"${labelCarriesMetadata ? '' : metadataAttr}>`);

  const bezier = resolveBezierPath(edge, nodes);
  const points = bezier ?? resolveEdgePoints(edge, nodes);

  if (points.length >= 2) {
    const d = bezier
      ? `M${points[0].x},${points[0].y} C${points[1].x},${points[1].y} ${points[2].x},${points[2].y} ${points[3].x},${points[3].y}`
      : points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    lines.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`);
  } else {
    lines.push(`<line x1="${edge.from.x}" y1="${edge.from.y}" x2="${edge.to.x}" y2="${edge.to.y}" stroke="${stroke}" stroke-width="${sw}"${dashAttr}/>`);
  }

  renderArrowMarker(lines, points, edge, stroke);

  if (edge.label) {
    let mx: number, my: number;
    if (points.length >= 2) {
      const mid = points[Math.floor(points.length / 2)];
      mx = mid.x;
      my = mid.y;
    } else {
      mx = (edge.from.x + edge.to.x) / 2;
      my = (edge.from.y + edge.to.y) / 2;
    }
    lines.push(
      `<text x="${mx}" y="${my}"${labelCarriesMetadata ? metadataAttr : ''} text-anchor="middle" dominant-baseline="central" fill="${escapeXml(textColor)}" font-size="13" font-family="${FONT_FAMILY}" paint-order="stroke" stroke="${escapeXml(textColor)}" stroke-width="0">${escapeXml(edge.label)}</text>`,
    );
  }

  lines.push('</g>');
  return lines.join('\n');
}

/** ノードと（ノードを跨がない）線分エッジを囲む viewBox を求める。 */
function computeSvgViewBox(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { vx: number; vy: number; vw: number; vh: number } {
  // バウンディングボックス計算
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  // ノードを跨がない線分エッジ（fishbone の骨など）も範囲に含める
  for (const e of edges) {
    if (e.from.nodeId && e.to.nodeId) continue;
    minX = Math.min(minX, e.from.x, e.to.x);
    minY = Math.min(minY, e.from.y, e.to.y);
    maxX = Math.max(maxX, e.from.x, e.to.x);
    maxY = Math.max(maxY, e.from.y, e.to.y);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  const pad = 40;
  return {
    vx: minX - pad,
    vy: minY - pad,
    vw: maxX - minX + pad * 2,
    vh: maxY - minY + pad * 2,
  };
}

/** グラデーション付きノードの `<linearGradient>` 定義と、ノード ID → fill 参照の対応を作る。 */
function collectGradientDefs(
  nodes: GraphNode[],
): { defs: string[]; gradFills: Map<string, string> } {
  const defs: string[] = [];
  const gradFills = new Map<string, string>();
  for (const n of nodes) {
    if (n.style.gradientTo) {
      const dir = n.style.gradientDirection ?? 'vertical';
      const x1 = '0%', y1 = '0%';
      const x2 = (dir === 'horizontal' || dir === 'diagonal') ? '100%' : '0%';
      const y2 = dir === 'horizontal' ? '0%' : '100%';
      const gradId = `grad-${n.id}`;
      defs.push(`<linearGradient id="${escapeXml(gradId)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0%" stop-color="${escapeXml(n.style.fill)}"/><stop offset="100%" stop-color="${escapeXml(n.style.gradientTo)}"/></linearGradient>`);
      gradFills.set(n.id, `url(#${gradId})`);
    }
  }
  return { defs, gradFills };
}

export function exportToSvg(
  doc: GraphDocument,
  opts: { background?: string; textColor?: string } = {},
): string {
  const background = opts.background ?? CANVAS_BG;
  const textColor = opts.textColor ?? COLOR_TEXT_PRIMARY;
  const nodes = doc.nodes;
  const edges = doc.edges;

  const { vx, vy, vw, vh } = computeSvgViewBox(nodes, edges);

  // グラデーション定義を収集
  const { defs, gradFills } = collectGradientDefs(nodes);

  // シャドウフィルター定義
  const hasShadow = nodes.some(n => n.style.shadow);
  if (hasShadow) {
    defs.push(`<filter id="shadow" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="2" dy="2" stdDeviation="3" flood-opacity="0.3"/></filter>`);
  }

  const parts: string[] = [];
  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vx} ${vy} ${vw} ${vh}" width="${vw}" height="${vh}">`,
  );
  if (defs.length > 0) {
    parts.push(`<defs>${defs.join('')}</defs>`);
  }
  if (background !== 'transparent') {
    parts.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${escapeXml(background)}"/>`);
  }

  edges.forEach(e => parts.push(renderEdgeSvg(e, nodes, textColor)));
  nodes.forEach(n => parts.push(renderNodeSvg(n, gradFills.get(n.id), textColor)));

  parts.push('</svg>');
  return parts.join('\n');
}
