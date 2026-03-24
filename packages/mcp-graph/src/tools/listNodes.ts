import fs from 'fs/promises';
import type { GraphDocument, GraphNode } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface ListNodesInput {
  path: string;
}

export interface NodeSummary {
  id: string;
  type: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function listNodes(input: ListNodesInput, rootDir: string): Promise<NodeSummary[]> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const doc: GraphDocument = JSON.parse(await fs.readFile(filePath, 'utf-8'));

  return doc.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    text: n.text,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  }));
}
