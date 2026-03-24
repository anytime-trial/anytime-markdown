import fs from 'fs/promises';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
import { extractHeadingsFromText } from './getOutline';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface UpdateSectionInput {
  path: string;
  heading: string;
  content: string;
}

/**
 * Replace a section in markdown text identified by its heading.
 */
export function updateSectionInText(markdown: string, heading: string, newContent: string): string {
  const headingMatch = heading.match(/^(#{1,6})\s+(.+)$/);
  if (!headingMatch) {
    throw new Error(`Invalid heading format: ${heading}`);
  }

  const targetLevel = headingMatch[1].length;
  const targetText = headingMatch[2].trimEnd();

  const lines = markdown.split('\n');
  const headings = extractHeadingsFromText(markdown);

  const targetHeading = headings.find(
    (h) => h.level === targetLevel && h.text === targetText,
  );
  if (!targetHeading) {
    throw new Error(`Heading not found: ${heading}`);
  }

  const startLineIdx = targetHeading.line - 1;

  const nextHeading = headings.find(
    (h) => h.line > targetHeading.line && h.level <= targetLevel,
  );

  const endLineIdx = nextHeading ? nextHeading.line - 1 : lines.length;

  const before = lines.slice(0, startLineIdx).join('\n');
  const after = lines.slice(endLineIdx).join('\n');

  if (before && after) {
    return before + '\n' + newContent + after;
  } else if (before) {
    return before + '\n' + newContent;
  } else if (after) {
    return newContent + after;
  }
  return newContent;
}

export async function updateSection(input: UpdateSectionInput, rootDir: string): Promise<void> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  const updated = updateSectionInText(content, input.heading, input.content);
  await fs.writeFile(filePath, updated, 'utf-8');
}
