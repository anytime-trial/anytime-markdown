import fs from 'fs/promises';
import { createNode, type GraphDocument, type GraphNode, type NodeType } from '@anytime-markdown/graph-core/types';
import { snapToGrid } from '@anytime-markdown/graph-core/src/engine/gridSnap';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface AddNodeInput {
  path: string;
  type: NodeType;
  x: number;
  y: number;
  text?: string;
  width?: number;
  height?: number;
}

export async function addNode(input: AddNodeInput, rootDir: string): Promise<GraphNode> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const doc: GraphDocument = JSON.parse(await fs.readFile(filePath, 'utf-8'));

  const overrides: Partial<GraphNode> = {};
  if (input.text !== undefined) overrides.text = input.text;
  if (input.width !== undefined) overrides.width = input.width;
  if (input.height !== undefined) overrides.height = input.height;

  const node = createNode(input.type, input.x, input.y, overrides);
  node.x = snapToGrid(node.x, 20);
  node.y = snapToGrid(node.y, 20);

  doc.nodes.push(node);
  doc.updatedAt = Date.now();
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');

  return node;
}
