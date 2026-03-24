import fs from 'fs/promises';
import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface UpdateNodeInput {
  path: string;
  nodeId: string;
  changes: Partial<GraphNode>;
}

export async function updateNode(input: UpdateNodeInput, rootDir: string): Promise<GraphNode> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const doc: GraphDocument = JSON.parse(await fs.readFile(filePath, 'utf-8'));

  const node = doc.nodes.find((n) => n.id === input.nodeId);
  if (!node) {
    throw new Error(`Node not found: ${input.nodeId}`);
  }

  Object.assign(node, input.changes);
  doc.updatedAt = Date.now();
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');

  return node;
}
