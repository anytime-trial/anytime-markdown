import { GraphDocument, GraphNode, GraphEdge } from '../types';
import { escapeXml, toHexColor } from './utils';

const NODE_SHAPE_MAP: Record<string, string> = {
  ellipse: 'ellipse',
  diamond: 'rhombus',
  parallelogram: 'shape=parallelogram',
  cylinder: 'shape=cylinder3;size=15',
  sticky: 'shape=note;size=15',
  doc: 'shape=document;size=0.15',
  frame: 'swimlane;startSize=20',
  image: 'shape=image;imageAlign=center;imageVerticalAlign=middle',
};

const END_ARROW_MAP: Record<string, string> = {
  none: 'endArrow=none',
  circle: 'endArrow=oval;endFill=1',
  diamond: 'endArrow=diamond;endFill=1',
  bar: 'endArrow=block;endFill=0',
};

const START_ARROW_MAP: Record<string, string> = {
  none: 'startArrow=none',
  arrow: 'startArrow=classic;startFill=1',
  circle: 'startArrow=oval;startFill=1',
  diamond: 'startArrow=diamond;startFill=1',
  bar: 'startArrow=block;startFill=0',
};

const ROUTING_MAP: Record<string, string> = {
  bezier: 'edgeStyle=orthogonalEdgeStyle;curved=1',
  orthogonal: 'edgeStyle=orthogonalEdgeStyle',
};

function nodeStyle(node: GraphNode): string {
  const parts: string[] = [];
  const fill = toHexColor(node.style.fill).replaceAll('#', '');
  const stroke = toHexColor(node.style.stroke).replaceAll('#', '');

  if (node.type === 'text') {
    parts.push('text;strokeColor=none;fillColor=none');
    return parts.join(';');
  }

  parts.push(NODE_SHAPE_MAP[node.type] ?? 'rounded=0');

  parts.push(
    `fillColor=#${fill}`,
    `strokeColor=#${stroke}`,
    `strokeWidth=${node.style.strokeWidth}`,
    `fontSize=${node.style.fontSize}`,
    `fontFamily=${node.style.fontFamily}`,
  );

  const fontColor = node.style.fontColor ? toHexColor(node.style.fontColor).replaceAll('#', '') : 'FFFFFF';
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
  const stroke = toHexColor(edge.style.stroke).replaceAll('#', '');

  if (edge.type === 'connector') {
    const routing = edge.style.routing ?? 'orthogonal';
    const routingStyle = ROUTING_MAP[routing];
    if (routingStyle) parts.push(routingStyle);
  }

  parts.push(`strokeColor=#${stroke}`, `strokeWidth=${edge.style.strokeWidth}`);

  const endShape = edge.style.endShape ?? (edge.type === 'connector' ? 'arrow' : 'none');
  const startShape = edge.style.startShape ?? 'none';

  parts.push(END_ARROW_MAP[endShape] ?? 'endArrow=classic;endFill=1');
  parts.push(START_ARROW_MAP[startShape] ?? '');

  if (edge.style.opacity !== undefined && edge.style.opacity !== 100) parts.push(`opacity=${edge.style.opacity}`);
  if (edge.style.dashed) parts.push('dashed=1');

  parts.push('html=1');
  return parts.join(';');
}

function buildNodeCell(node: GraphNode, style: string): string[] {
  const label = escapeXml(node.text);
  const urlAttr = node.url ? ` link="${escapeXml(node.url)}"` : '';
  const connectable = node.locked ? ' connectable="0"' : '';
  const parent = node.groupId ? escapeXml(node.groupId) : '1';
  const metadataAttr = node.metadata ? ` data-metadata="${escapeXml(JSON.stringify(node.metadata))}"` : '';
  return [
    `<mxCell id="${escapeXml(node.id)}" value="${label}" style="${style}" vertex="1" parent="${parent}"${urlAttr}${connectable}${metadataAttr}>`,
    `<mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry"/>`,
    '</mxCell>',
  ];
}

function buildEdgeCell(edge: GraphEdge, style: string): string[] {
  const label = edge.label ? escapeXml(edge.label) : '';
  const src = edge.from.nodeId ? `source="${escapeXml(edge.from.nodeId)}"` : '';
  const tgt = edge.to.nodeId ? `target="${escapeXml(edge.to.nodeId)}"` : '';
  const weightAttr = edge.weight != null ? ` data-weight="${edge.weight}"` : '';
  const lines: string[] = [
    `<mxCell id="${escapeXml(edge.id)}" value="${label}" style="${style}" edge="1" parent="1" ${src} ${tgt}${weightAttr}>`,
    '<mxGeometry relative="1" as="geometry">',
  ];
  if (!edge.from.nodeId) {
    lines.push(`<mxPoint x="${edge.from.x}" y="${edge.from.y}" as="sourcePoint"/>`);
  }
  if (!edge.to.nodeId) {
    lines.push(`<mxPoint x="${edge.to.x}" y="${edge.to.y}" as="targetPoint"/>`);
  }
  lines.push('</mxGeometry>', '</mxCell>');
  return lines;
}

export function exportToDrawio(doc: GraphDocument): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<mxfile>',
    '<diagram>',
    '<mxGraphModel>',
    '<root>',
    '<mxCell id="0"/>',
    '<mxCell id="1" parent="0"/>',
  ];

  // Sort nodes by zIndex for correct layer ordering
  const sortedNodes = [...doc.nodes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  for (const node of sortedNodes) {
    lines.push(...buildNodeCell(node, nodeStyle(node)));
  }

  for (const edge of doc.edges) {
    lines.push(...buildEdgeCell(edge, edgeStyle(edge)));
  }

  lines.push('</root>', '</mxGraphModel>', '</diagram>', '</mxfile>');
  return lines.join('\n');
}
