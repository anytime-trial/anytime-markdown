import fs from 'fs/promises';
import path from 'path';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface WriteMarkdownInput {
  path: string;
  content: string;
}

export async function writeMarkdown(input: WriteMarkdownInput, rootDir: string): Promise<void> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, input.content, 'utf-8');
}
