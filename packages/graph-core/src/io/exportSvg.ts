import { GraphDocument, GraphNode, GraphEdge } from '../types';
import { computeOrthogonalPath, bestSides, getConnectionPoints } from '../engine/connector';
import { computeVisibilityPath } from '../engine/visibilityGraph';
import {
  CANVAS_BG, COLOR_TEXT_PRIMARY,
  FONT_FAMILY,
} from '../theme';
import { escapeXml } from './utils';

function renderNodeSvg(node: GraphNode, gradFill?: string): string {
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
    lines.push(`<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" fill="${COLOR_TEXT_PRIMARY}" font-size="${style.fontSize}" font-family="${FONT_FAMILY}">${escapeXml(text)}</text>`);
  }

  lines.push('</g>');
  return lines.join('\n');
}

function renderEdgeSvg(edge: GraphEdge, nodes: GraphNode[]): string {
  const { id, style, type } = edge;
  const stroke = escapeXml(style.stroke);
  const sw = style.strokeWidth;
  const lines: string[] = [];
  lines.push(`<g id="${escapeXml(id)}">`);

  let points: { x: number; y: number }[] = [];

  if (type === 'connector' && edge.from.nodeId && edge.to.nodeId) {
    const fromNode = nodes.find(n => n.id === edge.from.nodeId);
    const toNode = nodes.find(n => n.id === edge.to.nodeId);
    if (fromNode && toNode) {
      if (edge.manualMidpoint !== undefined) {
        points = computeOrthogonalPath(fromNode, toNode, 20, edge.manualMidpoint);
      } else {
        const obstacles = nodes
          .filter(n => n.id !== fromNode.id && n.id !== toNode.id)
          .map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height }));
        const sides = bestSides(fromNode, toNode);
        const fromPts = getConnectionPoints(fromNode);
        const toPts = getConnectionPoints(toNode);
        const fromPt = fromPts.find(p => p.side === sides.fromSide) ?? fromPts[0];
        const toPt = toPts.find(p => p.side === sides.toSide) ?? toPts[0];
        points = computeVisibilityPath(fromPt, sides.fromSide, toPt, sides.toSide, obstacles);
      }
    }
  }

  if (points.length >= 2) {
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    lines.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`);
  } else {
    lines.push(`<line x1="${edge.from.x}" y1="${edge.from.y}" x2="${edge.to.x}" y2="${edge.to.y}" stroke="${stroke}" stroke-width="${sw}"/>`);
  }

  // 矢印マーカー
  const endShape = style.endShape ?? (type === 'connector' ? 'arrow' : 'none');
  if (endShape === 'arrow') {
    const last = points.length >= 2 ? points.at(-1)! : { x: edge.to.x, y: edge.to.y };
    const prev = points.length >= 2 ? points.at(-2)! : { x: edge.from.x, y: edge.from.y };
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const len = 12;
    const x1 = last.x - len * Math.cos(angle - Math.PI / 6);
    const y1 = last.y - len * Math.sin(angle - Math.PI / 6);
    const x2 = last.x - len * Math.cos(angle + Math.PI / 6);
    const y2 = last.y - len * Math.sin(angle + Math.PI / 6);
    lines.push(`<polygon points="${last.x},${last.y} ${x1},${y1} ${x2},${y2}" fill="${stroke}"/>`);
  }

  lines.push('</g>');
  return lines.join('\n');
}

export function exportToSvg(doc: GraphDocument): string {
  const nodes = doc.nodes;
  const edges = doc.edges;

  // バウンディングボックス計算
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  const pad = 40;
  const vx = minX - pad;
  const vy = minY - pad;
  const vw = maxX - minX + pad * 2;
  const vh = maxY - minY + pad * 2;

  // グラデーション定義を収集
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
  parts.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${CANVAS_BG}"/>`);

  edges.forEach(e => parts.push(renderEdgeSvg(e, nodes)));
  nodes.forEach(n => parts.push(renderNodeSvg(n, gradFills.get(n.id))));

  parts.push('</svg>');
  return parts.join('\n');
}
