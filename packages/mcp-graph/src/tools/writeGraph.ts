import fs from 'fs/promises';
import path from 'path';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface WriteGraphInput {
  path: string;
  document: GraphDocument;
}

export async function writeGraph(input: WriteGraphInput, rootDir: string): Promise<void> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  input.document.updatedAt = Date.now();
  await fs.writeFile(filePath, JSON.stringify(input.document, null, 2), 'utf-8');
}
