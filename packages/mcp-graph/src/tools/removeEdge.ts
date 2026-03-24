import fs from 'fs/promises';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface RemoveEdgeInput {
  path: string;
  edgeId: string;
}

export async function removeEdge(input: RemoveEdgeInput, rootDir: string): Promise<void> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const doc: GraphDocument = JSON.parse(await fs.readFile(filePath, 'utf-8'));

  const idx = doc.edges.findIndex((e) => e.id === input.edgeId);
  if (idx === -1) {
    throw new Error(`Edge not found: ${input.edgeId}`);
  }

  doc.edges.splice(idx, 1);
  doc.updatedAt = Date.now();
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
}
