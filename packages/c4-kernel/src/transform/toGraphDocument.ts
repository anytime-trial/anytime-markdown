import type { C4Model, C4Element, C4ElementType, BoundaryInfo } from '../types';
import type {
  NodeType, NodeStyle, EdgeStyle,
  GraphNode, GraphEdge, GraphDocument,
} from '@anytime-markdown/graph-core';

// --- Node mapping ---

interface C4NodeMapping {
  type: NodeType;
  width: number;
  height: number;
}

const NODE_MAP: Readonly<Record<C4ElementType, C4NodeMapping>> = {
  person:      { type: 'ellipse',  width: 140, height: 80 },
  system:      { type: 'rect',     width: 200, height: 80 },
  container:   { type: 'rect',     width: 180, height: 70 },
  containerDb: { type: 'cylinder', width: 160, height: 80 },
  component:   { type: 'rect',     width: 160, height: 60 },
  code:        { type: 'rect',     width: 140, height: 50 },
};

// --- C4 Colors ---

const C4_COLORS: Readonly<Record<C4ElementType, { fill: string; stroke: string }>> = {
  person:      { fill: '#08427b', stroke: '#073b6f' },
  system:      { fill: '#1168bd', stroke: '#0e5aa7' },
  container:   { fill: '#438dd5', stroke: '#3c7fc0' },
  containerDb: { fill: '#438dd5', stroke: '#3c7fc0' },
  component:   { fill: '#85bbf0', stroke: '#78a8d8' },
  code:        { fill: '#b3d7ff', stroke: '#a0c4e8' },
};

const EXTERNAL_COLOR = { fill: '#999999', stroke: '#8a8a8a' };

const FRAME_COLORS: Readonly<Record<string, { fill: string; stroke: string }>> = {
  container: { fill: 'rgba(67,141,213,0.08)', stroke: '#438dd5' },
  component: { fill: 'rgba(133,187,240,0.08)', stroke: '#85bbf0' },
};

const DEFAULT_STYLE: Readonly<Omit<NodeStyle, 'fill' | 'stroke'>> = {
  strokeWidth: 1,
  fontSize: 12,
  fontFamily: 'sans-serif',
};

const DEFAULT_EDGE_STYLE: Readonly<EdgeStyle> = {
  stroke: '#707070',
  strokeWidth: 1,
  startShape: 'none',
  endShape: 'arrow',
};

/** frame（境界）として扱う型 */
const BOUNDARY_TYPES: ReadonlySet<C4ElementType> = new Set(['container', 'component']);

let idCounter = 0;
function nextId(): string {
  return `c4_${Date.now()}_${idCounter++}`;
}

function buildNodeText(elem: C4Element): string {
  const parts = [elem.name];
  if (elem.technology) parts.push(`[${elem.technology}]`);
  if (elem.description) parts.push(elem.description);
  return parts.join('\n');
}

/** C4Model を GraphDocument に変換する */
export function c4ToGraphDocument(
  model: C4Model,
  boundaries?: readonly BoundaryInfo[],
): GraphDocument {
  idCounter = 0;
  const now = Date.now();
  const doc: GraphDocument = {
    id: nextId(),
    name: model.title ?? 'C4 Diagram',
    nodes: [],
    edges: [],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    createdAt: now,
    updatedAt: now,
  };

  // --- Phase 1: BoundaryInfo からフレームを生成 ---
  const boundaryIdMap = new Map<string, string>(); // c4Id → graphNodeId
  if (boundaries) {
    for (const b of boundaries) {
      const frameId = nextId();
      boundaryIdMap.set(b.id, frameId);
      doc.nodes.push({
        id: frameId,
        type: 'frame',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        text: b.name,
        style: { fill: 'transparent', stroke: '#444444', ...DEFAULT_STYLE },
      });
    }
  }

  // --- Phase 2: container 要素をフレームとして生成 ---
  for (const elem of model.elements) {
    if (!BOUNDARY_TYPES.has(elem.type)) continue;
    if (boundaryIdMap.has(elem.id)) {
      // Phase 1 で作成済み → groupId のみ更新
      if (elem.boundaryId && boundaryIdMap.has(elem.boundaryId)) {
        const existingFrameId = boundaryIdMap.get(elem.id)!;
        const frame = doc.nodes.find(n => n.id === existingFrameId);
        if (frame) {
          frame.groupId = boundaryIdMap.get(elem.boundaryId);
        }
      }
      continue;
    }

    const frameId = nextId();
    boundaryIdMap.set(elem.id, frameId);
    const colors = FRAME_COLORS[elem.type] ?? { fill: 'transparent', stroke: '#444444' };

    const node: GraphNode = {
      id: frameId,
      type: 'frame',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      text: buildNodeText(elem),
      style: { ...DEFAULT_STYLE, fill: colors.fill, stroke: colors.stroke },
      ...(elem.boundaryId && boundaryIdMap.has(elem.boundaryId)
        ? { groupId: boundaryIdMap.get(elem.boundaryId) }
        : {}),
    };
    doc.nodes.push(node);
  }

  // --- Phase 3: その他の要素をノードとして生成 ---
  const elemIdMap = new Map<string, string>(); // c4ElementId → graphNodeId
  for (const elem of model.elements) {
    if (BOUNDARY_TYPES.has(elem.type)) continue; // フレームとして既に生成済み

    const mapping = NODE_MAP[elem.type];
    const colors = elem.external ? EXTERNAL_COLOR : C4_COLORS[elem.type];
    const nodeId = nextId();
    elemIdMap.set(elem.id, nodeId);

    const node: GraphNode = {
      id: nodeId,
      type: mapping.type,
      x: 0,
      y: 0,
      width: mapping.width,
      height: mapping.height,
      text: buildNodeText(elem),
      style: {
        ...DEFAULT_STYLE,
        fill: colors.fill,
        stroke: colors.stroke,
        ...(elem.external ? { dashed: true } : {}),
      },
      metadata: { c4Id: elem.id, c4Type: elem.type },
      ...(elem.boundaryId && boundaryIdMap.has(elem.boundaryId)
        ? { groupId: boundaryIdMap.get(elem.boundaryId) }
        : {}),
    };
    doc.nodes.push(node);
  }

  // --- Phase 4: リレーションシップからエッジを生成 ---
  // boundary として生成された要素は boundaryIdMap に、その他は elemIdMap にある
  const allIdMap = new Map([...boundaryIdMap, ...elemIdMap]);

  for (const rel of model.relationships) {
    const fromId = allIdMap.get(rel.from);
    const toId = allIdMap.get(rel.to);
    if (!fromId || !toId) continue;

    doc.edges.push({
      id: nextId(),
      type: 'connector',
      from: { nodeId: fromId, x: 0, y: 0 },
      to: { nodeId: toId, x: 0, y: 0 },
      style: DEFAULT_EDGE_STYLE,
      label: rel.label,
    });
  }

  return doc;
}
