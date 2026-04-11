import { GraphDocument, GraphNode, GraphEdge, NodeType, EdgeType, EndpointShape, TextAlign, VerticalAlign, DEFAULT_NODE_STYLE, DEFAULT_EDGE_STYLE, DEFAULT_VIEWPORT } from '../types';

/** Strip HTML tags from a string, converting `<br>` to newline. Loops until no tags remain to avoid incomplete sanitization of nested/malformed markup. */
function stripHtmlTags(html: string): string {
  let result = html.replaceAll(/<br\s*\/?>/gi, '\n');
  let prev: string;
  do {
    prev = result;
    result = result.replaceAll(/<[^>]*>/g, '');
  } while (result !== prev);
  return result;
}

function parseStyle(styleStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of styleStr.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      result[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    } else if (part.trim()) {
      result[part.trim()] = '1';
    }
  }
  return result;
}

function resolveNodeType(style: Record<string, string>): NodeType {
  if (style['ellipse']) return 'ellipse';
  if (style['rhombus']) return 'diamond';
  if (style['shape'] === 'parallelogram') return 'parallelogram';
  if (style['shape']?.startsWith('cylinder')) return 'cylinder';
  if (style['shape'] === 'note') return 'sticky';
  if (style['shape'] === 'document') return 'doc';
  if (style['shape'] === 'image') return 'image';
  if (style['swimlane']) return 'frame';
  if (style['text'] && style['strokeColor'] === 'none' && style['fillColor'] === 'none') return 'text';
  return 'rect';
}

function resolveEndpointShape(arrowVal: string | undefined, fillVal: string | undefined): EndpointShape {
  if (!arrowVal || arrowVal === 'none') return 'none';
  if (arrowVal === 'oval') return 'circle';
  if (arrowVal === 'diamond') return 'diamond';
  if (arrowVal === 'block' && fillVal === '0') return 'bar';
  return 'arrow';
}

function colorFromHex(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

/** Convert NodeList/HTMLCollection to array for cross-platform compatibility (browser + xmldom) */
function toArray(nodeList: NodeListOf<Element> | HTMLCollectionOf<Element>): Element[] {
  return Array.from(nodeList);
}

/** Find first child element matching tag name (xmldom-compatible replacement for querySelector) */
function findChildByTag(parent: Element, tagName: string): Element | null {
  const children = parent.getElementsByTagName(tagName);
  return children.length > 0 ? children[0] : null;
}

/** Find child mxPoint with specific 'as' attribute */
function findMxPoint(parent: Element, asValue: string): Element | null {
  for (const point of Array.from(parent.getElementsByTagName('mxPoint'))) {
    if (point.getAttribute('as') === asValue) return point;
  }
  return null;
}

export function importFromDrawio(xmlString: string): GraphDocument {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  const errorNode = xmlDoc.getElementsByTagName('parsererror')[0] ?? null;
  if (errorNode) {
    throw new Error(`Invalid XML: ${errorNode.textContent?.slice(0, 200)}`);
  }
  const cells = toArray(xmlDoc.getElementsByTagName('mxCell'));

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const cell of cells) {
    const id = cell.getAttribute('id') ?? '';
    if (id === '0' || id === '1') continue;

    const styleStr = cell.getAttribute('style') ?? '';
    const style = parseStyle(styleStr);
    const value = cell.getAttribute('value') ?? '';

    if (cell.getAttribute('vertex') === '1') {
      const node = convertVertex(cell, id, style, value);
      if (node) nodes.push(node);
    } else if (cell.getAttribute('edge') === '1') {
      const edge = convertEdge(cell, id, style, value);
      if (edge) edges.push(edge);
    }
  }

  // Assign zIndex based on cell order (draw.io renders later cells on top)
  nodes.forEach((node, i) => { node.zIndex = i; });

  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: 'Imported',
    nodes,
    edges,
    viewport: { ...DEFAULT_VIEWPORT },
    createdAt: now,
    updatedAt: now,
  };
}

/** mxCell vertex を GraphNode に変換する */
function convertVertex(
  cell: Element, id: string,
  style: Record<string, string>, value: string,
): GraphNode {
  const geo = findChildByTag(cell, 'mxGeometry');
  const x = Number.parseFloat(geo?.getAttribute('x') ?? '0');
  const y = Number.parseFloat(geo?.getAttribute('y') ?? '0');
  const width = Number.parseFloat(geo?.getAttribute('width') ?? '120');
  const height = Number.parseFloat(geo?.getAttribute('height') ?? '60');

  const nodeType = resolveNodeType(style);
  const fill = colorFromHex(style['fillColor'], DEFAULT_NODE_STYLE.fill);
  const stroke = colorFromHex(style['strokeColor'], DEFAULT_NODE_STYLE.stroke);
  const strokeWidth = Number.parseFloat(style['strokeWidth'] ?? '2');
  const fontSize = Number.parseFloat(style['fontSize'] ?? '14');
  const fontFamily = style['fontFamily'] ?? DEFAULT_NODE_STYLE.fontFamily;

  const url = cell.getAttribute('link') ?? undefined;
  const nodeStyle = buildNodeStyle(style, fill, stroke, strokeWidth, fontSize, fontFamily);
  const metadata = parseMetadata(cell);
  const locked = cell.getAttribute('connectable') === '0' ? true : undefined;
  const parent = cell.getAttribute('parent');
  const groupId = (!parent || parent === '1') ? undefined : parent;

  return {
    id,
    type: nodeType,
    x, y, width, height,
    // Canvas fillText 専用。DOM に出力する場合は DOMPurify 等でサニタイズすること
    text: stripHtmlTags(value),
    style: nodeStyle,
    ...(url ? { url } : {}),
    ...(locked ? { locked } : {}),
    ...(groupId ? { groupId } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

/** ノードスタイルオブジェクトを構築する */
function buildNodeStyle(
  style: Record<string, string>,
  fill: string, stroke: string, strokeWidth: number,
  fontSize: number, fontFamily: string,
): GraphNode['style'] {
  const fontColor = style['fontColor'] ? colorFromHex(style['fontColor'], '#FFFFFF') : undefined;
  const fontStyleVal = style['fontStyle'] ? Number.parseInt(style['fontStyle'], 10) : undefined;
  const align = (['left', 'center', 'right'].includes(style['align']) ? style['align'] : undefined) as TextAlign | undefined;
  const verticalAlign = (['top', 'middle', 'bottom'].includes(style['verticalAlign']) ? style['verticalAlign'] : undefined) as VerticalAlign | undefined;
  const opacity = style['opacity'] === undefined ? undefined : Number.parseFloat(style['opacity']);
  const dashed = style['dashed'] === '1' ? true : undefined;
  const rounded = style['rounded'] === '1';
  const borderRadius = rounded ? (Number.parseFloat(style['arcSize'] ?? '0') || 10) : undefined;
  const spacing = style['spacing'] === undefined ? undefined : Number.parseFloat(style['spacing']);
  const spacingTop = style['spacingTop'] === undefined ? undefined : Number.parseFloat(style['spacingTop']);
  const spacingRight = style['spacingRight'] === undefined ? undefined : Number.parseFloat(style['spacingRight']);
  const spacingBottom = style['spacingBottom'] === undefined ? undefined : Number.parseFloat(style['spacingBottom']);
  const spacingLeft = style['spacingLeft'] === undefined ? undefined : Number.parseFloat(style['spacingLeft']);

  return {
    fill, stroke, strokeWidth, fontSize, fontFamily,
    ...(fontColor ? { fontColor } : {}),
    ...(fontStyleVal ? { fontStyle: fontStyleVal } : {}),
    ...(align ? { align } : {}),
    ...(verticalAlign ? { verticalAlign } : {}),
    ...(opacity === undefined ? {} : { opacity }),
    ...(dashed ? { dashed } : {}),
    ...(borderRadius ? { borderRadius } : {}),
    ...(spacing === undefined ? {} : { spacing }),
    ...(spacingTop === undefined ? {} : { spacingTop }),
    ...(spacingRight === undefined ? {} : { spacingRight }),
    ...(spacingBottom === undefined ? {} : { spacingBottom }),
    ...(spacingLeft === undefined ? {} : { spacingLeft }),
  };
}

/** data-metadata 属性からメタデータを取得する */
function parseMetadata(cell: Element): Record<string, string | number> | undefined {
  const metadataAttr = cell.getAttribute('data-metadata');
  if (!metadataAttr) return undefined;
  try { return JSON.parse(metadataAttr); } catch { return undefined; }
}

/** mxCell edge を GraphEdge に変換する */
function convertEdge(
  cell: Element, id: string,
  style: Record<string, string>, value: string,
): GraphEdge {
  const source = cell.getAttribute('source') ?? undefined;
  const target = cell.getAttribute('target') ?? undefined;

  const geo = findChildByTag(cell, 'mxGeometry');
  const srcPt = geo ? findMxPoint(geo, 'sourcePoint') : null;
  const tgtPt = geo ? findMxPoint(geo, 'targetPoint') : null;

  const fromX = Number.parseFloat(srcPt?.getAttribute('x') ?? '0');
  const fromY = Number.parseFloat(srcPt?.getAttribute('y') ?? '0');
  const toX = Number.parseFloat(tgtPt?.getAttribute('x') ?? '0');
  const toY = Number.parseFloat(tgtPt?.getAttribute('y') ?? '0');

  const isOrthogonal = style['edgeStyle'] === 'orthogonalEdgeStyle';
  const isCurved = style['curved'] === '1';
  const edgeType: EdgeType = isOrthogonal ? 'connector' : 'line';
  const routing = isCurved ? 'bezier' as const : undefined;

  const edgeStroke = colorFromHex(style['strokeColor'], DEFAULT_EDGE_STYLE.stroke);
  const edgeStrokeWidth = Number.parseFloat(style['strokeWidth'] ?? '2');
  const endShape = resolveEndpointShape(style['endArrow'], style['endFill']);
  const startShape = resolveEndpointShape(style['startArrow'], style['startFill']);

  const edgeOpacity = style['opacity'] === undefined ? undefined : Number.parseFloat(style['opacity']);
  const edgeDashed = style['dashed'] === '1' ? true : undefined;

  const weightStr = cell.getAttribute('data-weight');
  const edgeWeight = weightStr ? Number.parseFloat(weightStr) : undefined;

  return {
    id,
    type: edgeType,
    from: { nodeId: source, x: fromX, y: fromY },
    to: { nodeId: target, x: toX, y: toY },
    style: {
      stroke: edgeStroke, strokeWidth: edgeStrokeWidth, startShape, endShape, routing,
      ...(edgeOpacity === undefined ? {} : { opacity: edgeOpacity }),
      ...(edgeDashed ? { dashed: edgeDashed } : {}),
    },
    label: stripHtmlTags(value) || undefined,
    ...(edgeWeight !== undefined && !Number.isNaN(edgeWeight) ? { weight: edgeWeight } : {}),
  };
}
