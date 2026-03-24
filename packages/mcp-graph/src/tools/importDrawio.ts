import fs from 'fs/promises';
import path from 'path';
import type { GraphDocument } from '@anytime-markdown/graph-core/types';
import { resolveSecurePath, validateGraphExtension } from '../utils/securePath';

// Set up DOMParser for Node.js before importing graph-core's importFromDrawio
function setupDomParser(): void {
  if (typeof globalThis.DOMParser === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DOMParser } = require('@xmldom/xmldom');
    (globalThis as Record<string, unknown>).DOMParser = DOMParser;
  }
}

export interface ImportDrawioInput {
  path: string;
  drawioContent: string;
}

export async function importDrawio(input: ImportDrawioInput, rootDir: string): Promise<GraphDocument> {
  validateGraphExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  setupDomParser();
  const { importFromDrawio } = await import('@anytime-markdown/graph-core/src/io/importDrawio');
  const doc = importFromDrawio(input.drawioContent);

  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
  return doc;
}
