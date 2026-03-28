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
  const result: Element[] = [];
  for (let i = 0; i < nodeList.length; i++) {
    result.push(nodeList[i]);
  }
  return result;
}

/** Find first child element matching tag name (xmldom-compatible replacement for querySelector) */
function findChildByTag(parent: Element, tagName: string): Element | null {
  const children = parent.getElementsByTagName(tagName);
  return children.length > 0 ? children[0] : null;
}

/** Find child mxPoint with specific 'as' attribute */
function findMxPoint(parent: Element, asValue: string): Element | null {
  const points = parent.getElementsByTagName('mxPoint');
  for (let i = 0; i < points.length; i++) {
    if (points[i].getAttribute('as') === asValue) return points[i];
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

  cells.forEach(cell => {
    const id = cell.getAttribute('id') ?? '';
    if (id === '0' || id === '1') return;

    const styleStr = cell.getAttribute('style') ?? '';
    const style = parseStyle(styleStr);
    const value = cell.getAttribute('value') ?? '';

    const isVertex = cell.getAttribute('vertex') === '1';
    const isEdge = cell.getAttribute('edge') === '1';

    if (isVertex) {
      const geo = findChildByTag(cell, 'mxGeometry');
      const x = parseFloat(geo?.getAttribute('x') ?? '0');
      const y = parseFloat(geo?.getAttribute('y') ?? '0');
      const width = parseFloat(geo?.getAttribute('width') ?? '120');
      const height = parseFloat(geo?.getAttribute('height') ?? '60');

      const nodeType = resolveNodeType(style);
      const fill = colorFromHex(style['fillColor'], DEFAULT_NODE_STYLE.fill);
      const stroke = colorFromHex(style['strokeColor'], DEFAULT_NODE_STYLE.stroke);
      const strokeWidth = parseFloat(style['strokeWidth'] ?? '2');
      const fontSize = parseFloat(style['fontSize'] ?? '14');
      const fontFamily = style['fontFamily'] ?? DEFAULT_NODE_STYLE.fontFamily;

      const url = cell.getAttribute('link') ?? undefined;

      // Optional style properties
      const fontColor = style['fontColor'] ? colorFromHex(style['fontColor'], '#FFFFFF') : undefined;
      const fontStyleVal = style['fontStyle'] ? parseInt(style['fontStyle'], 10) : undefined;
      const align = (['left', 'center', 'right'].includes(style['align']) ? style['align'] : undefined) as TextAlign | undefined;
      const verticalAlign = (['top', 'middle', 'bottom'].includes(style['verticalAlign']) ? style['verticalAlign'] : undefined) as VerticalAlign | undefined;
      const opacity = style['opacity'] !== undefined ? parseFloat(style['opacity']) : undefined;
      const dashed = style['dashed'] === '1' ? true : undefined;
      const rounded = style['rounded'] === '1';
      const borderRadius = rounded ? (parseFloat(style['arcSize'] ?? '0') || 10) : undefined;
      const spacing = style['spacing'] !== undefined ? parseFloat(style['spacing']) : undefined;
      const spacingTop = style['spacingTop'] !== undefined ? parseFloat(style['spacingTop']) : undefined;
      const spacingRight = style['spacingRight'] !== undefined ? parseFloat(style['spacingRight']) : undefined;
      const spacingBottom = style['spacingBottom'] !== undefined ? parseFloat(style['spacingBottom']) : undefined;
      const spacingLeft = style['spacingLeft'] !== undefined ? parseFloat(style['spacingLeft']) : undefined;

      // Metadata from cell attributes
      const locked = cell.getAttribute('connectable') === '0' ? true : undefined;
      const parent = cell.getAttribute('parent');
      const groupId = (parent && parent !== '1') ? parent : undefined;

      nodes.push({
        id,
        type: nodeType,
        x, y, width, height,
        // Canvas fillText 専用。DOM に出力する場合は DOMPurify 等でサニタイズすること
        text: stripHtmlTags(value),
        style: {
          fill, stroke, strokeWidth, fontSize, fontFamily,
          ...(fontColor ? { fontColor } : {}),
          ...(fontStyleVal ? { fontStyle: fontStyleVal } : {}),
          ...(align ? { align } : {}),
          ...(verticalAlign ? { verticalAlign } : {}),
          ...(opacity !== undefined ? { opacity } : {}),
          ...(dashed ? { dashed } : {}),
          ...(borderRadius ? { borderRadius } : {}),
          ...(spacing !== undefined ? { spacing } : {}),
          ...(spacingTop !== undefined ? { spacingTop } : {}),
          ...(spacingRight !== undefined ? { spacingRight } : {}),
          ...(spacingBottom !== undefined ? { spacingBottom } : {}),
          ...(spacingLeft !== undefined ? { spacingLeft } : {}),
        },
        ...(url ? { url } : {}),
        ...(locked ? { locked } : {}),
        ...(groupId ? { groupId } : {}),
      });
    } else if (isEdge) {
      const source = cell.getAttribute('source') ?? undefined;
      const target = cell.getAttribute('target') ?? undefined;

      const geo = findChildByTag(cell, 'mxGeometry');
      const srcPt = geo ? findMxPoint(geo, 'sourcePoint') : null;
      const tgtPt = geo ? findMxPoint(geo, 'targetPoint') : null;

      const fromX = parseFloat(srcPt?.getAttribute('x') ?? '0');
      const fromY = parseFloat(srcPt?.getAttribute('y') ?? '0');
      const toX = parseFloat(tgtPt?.getAttribute('x') ?? '0');
      const toY = parseFloat(tgtPt?.getAttribute('y') ?? '0');

      const isOrthogonal = style['edgeStyle'] === 'orthogonalEdgeStyle';
      const isCurved = style['curved'] === '1';
      const hasArrow = style['endArrow'] !== undefined && style['endArrow'] !== 'none';
      const edgeType: EdgeType = isOrthogonal ? 'connector' : hasArrow ? 'arrow' : 'line';
      const routing = isCurved ? 'bezier' as const : undefined;

      const edgeStroke = colorFromHex(style['strokeColor'], DEFAULT_EDGE_STYLE.stroke);
      const edgeStrokeWidth = parseFloat(style['strokeWidth'] ?? '2');
      const endShape = resolveEndpointShape(style['endArrow'], style['endFill']);
      const startShape = resolveEndpointShape(style['startArrow'], style['startFill']);

      const edgeOpacity = style['opacity'] !== undefined ? parseFloat(style['opacity']) : undefined;
      const edgeDashed = style['dashed'] === '1' ? true : undefined;

      edges.push({
        id,
        type: edgeType,
        from: { nodeId: source, x: fromX, y: fromY },
        to: { nodeId: target, x: toX, y: toY },
        style: {
          stroke: edgeStroke, strokeWidth: edgeStrokeWidth, startShape, endShape, routing,
          ...(edgeOpacity !== undefined ? { opacity: edgeOpacity } : {}),
          ...(edgeDashed ? { dashed: edgeDashed } : {}),
        },
        label: stripHtmlTags(value) || undefined,
      });
    }
  });

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
