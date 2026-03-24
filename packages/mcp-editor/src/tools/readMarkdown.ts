import fs from 'fs/promises';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface ReadMarkdownInput {
  path: string;
}

export async function readMarkdown(input: ReadMarkdownInput, rootDir: string): Promise<string> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  return fs.readFile(filePath, 'utf-8');
}
