import { GraphNode, GraphEdge } from '../types';

export function nodeCenter(node: GraphNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function rectIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = node.width / 2;
  const hh = node.height / 2;
  const scaleX = hw / Math.abs(dx || 1);
  const scaleY = hh / Math.abs(dy || 1);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function ellipseIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const rx = node.width / 2;
  const ry = node.height / 2;
  const angle = Math.atan2(dy, dx);
  return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

function diamondIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const hw = node.width / 2;
  const hh = node.height / 2;
  // Diamond edge equation: |dx/hw| + |dy/hh| = 1
  const scale = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function nodeIntersection(
  node: GraphNode,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  if (node.type === 'ellipse') return ellipseIntersection(node, targetX, targetY);
  if (node.type === 'diamond') return diamondIntersection(node, targetX, targetY);
  // parallelogram and cylinder use rectIntersection (default)
  return rectIntersection(node, targetX, targetY);
}

export function resolveConnectorEndpoints(
  edge: GraphEdge,
  nodes: GraphNode[],
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const fromNode = edge.from.nodeId ? nodes.find((n) => n.id === edge.from.nodeId) : null;
  const toNode = edge.to.nodeId ? nodes.find((n) => n.id === edge.to.nodeId) : null;
  let fromPt = { x: edge.from.x, y: edge.from.y };
  let toPt = { x: edge.to.x, y: edge.to.y };
  if (fromNode && toNode) {
    const fromCenter = nodeCenter(fromNode);
    const toCenter = nodeCenter(toNode);
    fromPt = nodeIntersection(fromNode, toCenter.x, toCenter.y);
    toPt = nodeIntersection(toNode, fromCenter.x, fromCenter.y);
  } else if (fromNode) {
    fromPt = nodeIntersection(fromNode, toPt.x, toPt.y);
  } else if (toNode) {
    toPt = nodeIntersection(toNode, fromPt.x, fromPt.y);
  }
  return { from: fromPt, to: toPt };
}
