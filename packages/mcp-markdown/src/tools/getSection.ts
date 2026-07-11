import fs from 'node:fs/promises';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
import { selectHeadingTarget } from '../utils/headingTarget';
import { extractHeadingsFromText } from './getOutline';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface GetSectionInput {
  path: string;
  heading: string;
  /** 返却するセクション本文の最大文字数。超過分は省略マーカーで切詰める（トークン節約）。 */
  maxChars?: number;
  /** 同一見出しが複数あるときの指名（1-based）。未指定で複数一致なら曖昧エラー。 */
  occurrence?: number;
}

/**
 * Extract a section from markdown text by its heading.
 * The section includes everything from the heading to the next heading
 * of the same or higher level, or end of document.
 * Throws when the heading is ambiguous (duplicates without occurrence).
 */
export function getSectionFromText(
  markdown: string,
  heading: string,
  occurrence?: number,
): string | null {
  const headingMatch = /^(#{1,6})\s+(.+)$/.exec(heading);
  if (!headingMatch) return null;

  const targetLevel = headingMatch[1].length;
  const targetText = headingMatch[2].trimEnd();

  const lines = markdown.split('\n');
  const headings = extractHeadingsFromText(markdown);

  const matches = headings.filter(
    (h) => h.level === targetLevel && h.text === targetText,
  );
  const targetHeading = selectHeadingTarget(matches, heading, occurrence);
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
  const section = getSectionFromText(content, input.heading, input.occurrence);
  if (section === null) {
    throw new Error(`Heading not found: ${input.heading}`);
  }
  if (input.maxChars !== undefined && input.maxChars > 0) {
    // サロゲートペア（絵文字等）の中間で切らないよう書記素寄り（コードポイント単位）に切る。
    const chars = Array.from(section);
    if (chars.length > input.maxChars) {
      return chars.slice(0, input.maxChars).join('') + '\n…(truncated)';
    }
  }
  return section;
}
