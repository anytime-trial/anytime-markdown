import fs from 'fs/promises';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';
import { exportToSvg } from '@anytime-markdown/graph-core/src/io/exportSvg';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

export interface ExportSvgInput {
  path: string;
}

export async function exportSvg(input: ExportSvgInput, rootDir: string): Promise<string> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const doc: GraphDocument = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  return exportToSvg(doc);
}
