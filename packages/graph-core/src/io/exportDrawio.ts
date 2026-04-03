import { GraphDocument, GraphNode, GraphEdge } from '../types';
import { escapeXml, toHexColor } from './utils';

function nodeStyle(node: GraphNode): string {
  const parts: string[] = [];
  const fill = toHexColor(node.style.fill).replace('#', '');
  const stroke = toHexColor(node.style.stroke).replace('#', '');

  switch (node.type) {
    case 'ellipse':
      parts.push('ellipse');
      break;
    case 'diamond':
      parts.push('rhombus');
      break;
    case 'parallelogram':
      parts.push('shape=parallelogram');
      break;
    case 'cylinder':
      parts.push('shape=cylinder3;size=15');
      break;
    case 'sticky':
      parts.push('shape=note;size=15');
      break;
    case 'text':
      parts.push('text;strokeColor=none;fillColor=none');
      return parts.join(';');
    case 'doc':
      parts.push('shape=document;size=0.15');
      break;
    case 'frame':
      parts.push('swimlane;startSize=20');
      break;
    case 'image':
      parts.push('shape=image;imageAlign=center;imageVerticalAlign=middle');
      break;
    default:
      parts.push('rounded=0');
  }

  parts.push(
    `fillColor=#${fill}`,
    `strokeColor=#${stroke}`,
    `strokeWidth=${node.style.strokeWidth}`,
    `fontSize=${node.style.fontSize}`,
    `fontFamily=${node.style.fontFamily}`,
  );

  const fontColor = node.style.fontColor ? toHexColor(node.style.fontColor).replace('#', '') : 'FFFFFF';
  parts.push(`fontColor=#${fontColor}`);
  if (node.style.fontStyle) parts.push(`fontStyle=${node.style.fontStyle}`);
  if (node.style.align && node.style.align !== 'center') parts.push(`align=${node.style.align}`);
  if (node.style.verticalAlign && node.style.verticalAlign !== 'middle') parts.push(`verticalAlign=${node.style.verticalAlign}`);
  if (node.style.opacity !== undefined && node.style.opacity !== 100) parts.push(`opacity=${node.style.opacity}`);
  if (node.style.dashed) parts.push('dashed=1');
  if (node.style.borderRadius && node.type !== 'ellipse') parts.push('rounded=1');
  if (node.style.spacing !== undefined) parts.push(`spacing=${node.style.spacing}`);
  if (node.style.spacingTop !== undefined) parts.push(`spacingTop=${node.style.spacingTop}`);
  if (node.style.spacingRight !== undefined) parts.push(`spacingRight=${node.style.spacingRight}`);
  if (node.style.spacingBottom !== undefined) parts.push(`spacingBottom=${node.style.spacingBottom}`);
  if (node.style.spacingLeft !== undefined) parts.push(`spacingLeft=${node.style.spacingLeft}`);

  parts.push('whiteSpace=wrap', 'html=1');

  return parts.join(';');
}

function edgeStyle(edge: GraphEdge): string {
  const parts: string[] = [];
  const stroke = toHexColor(edge.style.stroke).replace('#', '');

  if (edge.type === 'connector') {
    const routing = edge.style.routing ?? 'orthogonal';
    if (routing === 'bezier') {
      parts.push('edgeStyle=orthogonalEdgeStyle;curved=1');
    } else if (routing === 'straight') {
      // straight: drawio ではエッジスタイルなし（デフォルトの直線）
    } else {
      parts.push('edgeStyle=orthogonalEdgeStyle');
    }
  }

  parts.push(`strokeColor=#${stroke}`, `strokeWidth=${edge.style.strokeWidth}`);

  const endShape = edge.style.endShape ?? (edge.type === 'connector' ? 'arrow' : 'none');
  const startShape = edge.style.startShape ?? 'none';

  if (endShape === 'none') parts.push('endArrow=none');
  else if (endShape === 'circle') parts.push('endArrow=oval;endFill=1');
  else if (endShape === 'diamond') parts.push('endArrow=diamond;endFill=1');
  else if (endShape === 'bar') parts.push('endArrow=block;endFill=0');
  else parts.push('endArrow=classic;endFill=1');

  if (startShape === 'none') parts.push('startArrow=none');
  else if (startShape === 'arrow') parts.push('startArrow=classic;startFill=1');
  else if (startShape === 'circle') parts.push('startArrow=oval;startFill=1');
  else if (startShape === 'diamond') parts.push('startArrow=diamond;startFill=1');
  else if (startShape === 'bar') parts.push('startArrow=block;startFill=0');

  if (edge.style.opacity !== undefined && edge.style.opacity !== 100) parts.push(`opacity=${edge.style.opacity}`);
  if (edge.style.dashed) parts.push('dashed=1');

  parts.push('html=1');
  return parts.join(';');
}

export function exportToDrawio(doc: GraphDocument): string {
  const lines: string[] = [];
  lines.push(
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<mxfile>',
    '<diagram>',
    '<mxGraphModel>',
    '<root>',
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
  );

  // Sort nodes by zIndex for correct layer ordering
  const sortedNodes = [...doc.nodes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  for (const node of sortedNodes) {
    const style = nodeStyle(node);
    const label = escapeXml(node.text);
    const urlAttr = node.url ? ` link="${escapeXml(node.url)}"` : '';
    const connectable = node.locked ? ' connectable="0"' : '';
    const parent = node.groupId ? escapeXml(node.groupId) : '1';
    const metadataAttr = node.metadata ? ` data-metadata="${escapeXml(JSON.stringify(node.metadata))}"` : '';
    lines.push(
      `<mxCell id="${escapeXml(node.id)}" value="${label}" style="${style}" vertex="1" parent="${parent}"${urlAttr}${connectable}${metadataAttr}>`,
      `<mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry"/>`,
      '</mxCell>',
    );
  }

  for (const edge of doc.edges) {
    const style = edgeStyle(edge);
    const label = edge.label ? escapeXml(edge.label) : '';
    const src = edge.from.nodeId ? `source="${escapeXml(edge.from.nodeId)}"` : '';
    const tgt = edge.to.nodeId ? `target="${escapeXml(edge.to.nodeId)}"` : '';
    const weightAttr = edge.weight != null ? ` data-weight="${edge.weight}"` : '';
    lines.push(
      `<mxCell id="${escapeXml(edge.id)}" value="${label}" style="${style}" edge="1" parent="1" ${src} ${tgt}${weightAttr}>`,
      '<mxGeometry relative="1" as="geometry">',
    );
    if (!edge.from.nodeId) {
      lines.push(`<mxPoint x="${edge.from.x}" y="${edge.from.y}" as="sourcePoint"/>`);
    }
    if (!edge.to.nodeId) {
      lines.push(`<mxPoint x="${edge.to.x}" y="${edge.to.y}" as="targetPoint"/>`);
    }
    lines.push('</mxGeometry>', '</mxCell>');
  }

  lines.push('</root>', '</mxGraphModel>', '</diagram>', '</mxfile>');
  return lines.join('\n');
}
