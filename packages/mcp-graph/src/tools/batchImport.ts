import fs from 'fs/promises';
import { batchCreateGraph } from '@anytime-markdown/graph-core/engine';
import type { BatchNodeInput, BatchEdgeInput } from '@anytime-markdown/graph-core/engine';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface BatchImportInput {
  path: string;
  name?: string;
  nodes: BatchNodeInput[];
  edges: BatchEdgeInput[];
}

export async function batchImport(input: BatchImportInput, rootDir: string): Promise<GraphDocument> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);

  const doc = batchCreateGraph({
    nodes: input.nodes,
    edges: input.edges,
    name: input.name,
  });

  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
  return doc;
}
