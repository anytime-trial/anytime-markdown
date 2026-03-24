import fs from 'fs/promises';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';
import { exportToDrawio } from '@anytime-markdown/graph-core/src/io/exportDrawio';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface ExportDrawioInput {
  path: string;
}

export async function exportDrawio(input: ExportDrawioInput, rootDir: string): Promise<string> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const doc: GraphDocument = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  return exportToDrawio(doc);
}
