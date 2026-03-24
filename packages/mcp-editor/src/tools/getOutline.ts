import fs from 'fs/promises';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface HeadingNode {
  level: number;
  text: string;
  line: number;
}

export interface GetOutlineInput {
  path: string;
}

export function extractHeadingsFromText(markdown: string): HeadingNode[] {
  const lines = markdown.split('\n');
  const headings: HeadingNode[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trimEnd(),
        line: i + 1,
      });
    }
  }

  return headings;
}

export async function getOutline(input: GetOutlineInput, rootDir: string): Promise<HeadingNode[]> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  return extractHeadingsFromText(content);
}
