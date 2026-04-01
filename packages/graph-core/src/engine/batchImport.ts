import { createNode, createEdge, createDocument } from '../types';
import type { GraphDocument } from '../types';

/** Batch import input for a single node */
export interface BatchNodeInput {
  id: string;
  text: string;
  metadata?: Record<string, string | number>;
}

/** Batch import input for a single edge */
export interface BatchEdgeInput {
  fromId: string;
  toId: string;
  weight?: number;
}

/** Full batch import input */
export interface BatchImportInput {
  nodes: readonly BatchNodeInput[];
  edges: readonly BatchEdgeInput[];
  name?: string;
}

/**
 * Create a complete GraphDocument from structured batch data.
 * User-supplied IDs are mapped to generated UUIDs.
 * Edges referencing unknown node IDs are silently skipped.
 */
export function batchCreateGraph(input: BatchImportInput): GraphDocument {
  const doc = createDocument(input.name ?? 'Untitled');

  const centerX = 500;
  const centerY = 400;
  const nodeCount = input.nodes.length;
  const spreadRadius = Math.max(100, nodeCount * 40);

  // Map user-supplied IDs to generated node IDs
  const idMap = new Map<string, string>();

  for (let i = 0; i < nodeCount; i++) {
    const nodeInput = input.nodes[i];
    const angle = (2 * Math.PI * i) / Math.max(nodeCount, 1);
    const x = centerX + spreadRadius * Math.cos(angle);
    const y = centerY + spreadRadius * Math.sin(angle);

    const node = createNode('ellipse', x, y, {
      text: nodeInput.text,
      metadata: nodeInput.metadata,
    });

    idMap.set(nodeInput.id, node.id);
    doc.nodes.push(node);
  }

  for (const edgeInput of input.edges) {
    const fromNodeId = idMap.get(edgeInput.fromId);
    const toNodeId = idMap.get(edgeInput.toId);

    if (!fromNodeId || !toNodeId) {
      continue;
    }

    const fromNode = doc.nodes.find(n => n.id === fromNodeId)!;
    const toNode = doc.nodes.find(n => n.id === toNodeId)!;

    const edge = createEdge(
      'arrow',
      { nodeId: fromNodeId, x: fromNode.x, y: fromNode.y },
      { nodeId: toNodeId, x: toNode.x, y: toNode.y },
      { weight: edgeInput.weight },
    );

    doc.edges.push(edge);
  }

  return doc;
}
