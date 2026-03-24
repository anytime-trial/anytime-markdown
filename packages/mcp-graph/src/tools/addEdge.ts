import fs from 'fs/promises';
import { createEdge, type GraphDocument, type GraphEdge, type EdgeType, type EdgeEndpoint } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface AddEdgeInput {
  path: string;
  type: EdgeType;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  label?: string;
}

export async function addEdge(input: AddEdgeInput, rootDir: string): Promise<GraphEdge> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const doc: GraphDocument = JSON.parse(await fs.readFile(filePath, 'utf-8'));

  // Validate referenced nodes exist
  if (input.from.nodeId && !doc.nodes.find((n) => n.id === input.from.nodeId)) {
    throw new Error(`Source node not found: ${input.from.nodeId}`);
  }
  if (input.to.nodeId && !doc.nodes.find((n) => n.id === input.to.nodeId)) {
    throw new Error(`Target node not found: ${input.to.nodeId}`);
  }

  const overrides: Partial<GraphEdge> = {};
  if (input.label) overrides.label = input.label;

  const edge = createEdge(input.type, input.from, input.to, overrides);
  doc.edges.push(edge);
  doc.updatedAt = Date.now();
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');

  return edge;
}
