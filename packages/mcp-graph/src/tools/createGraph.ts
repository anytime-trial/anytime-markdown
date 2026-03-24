import fs from 'fs/promises';
import path from 'path';
import { createDocument, type GraphDocument } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface CreateGraphInput {
  path: string;
  name: string;
}

export async function createGraphFile(input: CreateGraphInput, rootDir: string): Promise<GraphDocument> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const doc = createDocument(input.name);
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
  return doc;
}
