import fs from 'fs/promises';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface ReadGraphInput {
  path: string;
}

export async function readGraph(input: ReadGraphInput, rootDir: string): Promise<GraphDocument> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as GraphDocument;
}
