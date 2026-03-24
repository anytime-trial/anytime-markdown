import fs from 'fs/promises';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
import { extractHeadingsFromText } from './getOutline';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface GetSectionInput {
  path: string;
  heading: string;
}

/**
 * Extract a section from markdown text by its heading.
 * The section includes everything from the heading to the next heading
 * of the same or higher level, or end of document.
 */
export function getSectionFromText(markdown: string, heading: string): string | null {
  const headingMatch = heading.match(/^(#{1,6})\s+(.+)$/);
  if (!headingMatch) return null;

  const targetLevel = headingMatch[1].length;
  const targetText = headingMatch[2].trimEnd();

  const lines = markdown.split('\n');
  const headings = extractHeadingsFromText(markdown);

  const targetHeading = headings.find(
    (h) => h.level === targetLevel && h.text === targetText,
  );
  if (!targetHeading) return null;

  const startLineIdx = targetHeading.line - 1;

  // Find next heading of same or higher level
  const nextHeading = headings.find(
    (h) => h.line > targetHeading.line && h.level <= targetLevel,
  );

  const endLineIdx = nextHeading ? nextHeading.line - 1 : lines.length;

  return lines.slice(startLineIdx, endLineIdx).join('\n');
}

export async function getSection(input: GetSectionInput, rootDir: string): Promise<string> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  const section = getSectionFromText(content, input.heading);
  if (section === null) {
    throw new Error(`Heading not found: ${input.heading}`);
  }
  return section;
}
