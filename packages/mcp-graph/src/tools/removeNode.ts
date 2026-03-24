import fs from 'fs/promises';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface RemoveNodeInput {
  path: string;
  nodeId: string;
}

export async function removeNode(input: RemoveNodeInput, rootDir: string): Promise<void> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const doc: GraphDocument = JSON.parse(await fs.readFile(filePath, 'utf-8'));

  const idx = doc.nodes.findIndex((n) => n.id === input.nodeId);
  if (idx === -1) {
    throw new Error(`Node not found: ${input.nodeId}`);
  }

  doc.nodes.splice(idx, 1);
  // Remove connected edges
  doc.edges = doc.edges.filter(
    (e) => e.from.nodeId !== input.nodeId && e.to.nodeId !== input.nodeId,
  );
  doc.updatedAt = Date.now();
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
}
