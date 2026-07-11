import fs from 'node:fs/promises';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
import { selectHeadingTarget } from '../utils/headingTarget';
import { extractHeadingsFromText } from './getOutline';
import { getSectionFromText } from './getSection';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface UpdateSectionInput {
  path: string;
  heading: string;
  content: string;
  /** 同一見出しが複数あるときの指名（1-based）。未指定で複数一致なら曖昧エラー。 */
  occurrence?: number;
}

/** update_section の差分サマリ（本文を返さずに検証できるようにする）。 */
export interface UpdateSectionSummary {
  path: string;
  heading: string;
  occurrence?: number;
  /** 置換前セクションの行数。 */
  oldLines: number;
  /** 新 content の行数。 */
  newLines: number;
  /** ファイル全体のバイト増減（UTF-8）。 */
  bytesDelta: number;
  warnings: string[];
}

/**
 * Replace a section in markdown text identified by its heading.
 * Throws when the heading is ambiguous (duplicates without occurrence).
 */
export function updateSectionInText(
  markdown: string,
  heading: string,
  newContent: string,
  occurrence?: number,
): string {
  const headingMatch = /^(#{1,6})\s+(.+)$/.exec(heading);
  if (!headingMatch) {
    throw new Error(`Invalid heading format: ${heading}`);
  }

  const targetLevel = headingMatch[1].length;
  const targetText = headingMatch[2].trimEnd();

  const lines = markdown.split('\n');
  const headings = extractHeadingsFromText(markdown);

  const matches = headings.filter(
    (h) => h.level === targetLevel && h.text === targetText,
  );
  const targetHeading = selectHeadingTarget(matches, heading, occurrence);
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

/** content の先頭行を点検し、見出し欠落・見出し変更（リネーム）を警告として返す。 */
function collectContentWarnings(heading: string, newContent: string): string[] {
  const warnings: string[] = [];
  const firstLine = newContent.split('\n').find((l) => l.trim() !== '') ?? '';
  if (!/^#{1,6}\s+/.test(firstLine)) {
    warnings.push(
      `content does not start with a heading line; the section heading "${heading}" will be removed`,
    );
  } else if (firstLine.trimEnd() !== heading.trimEnd()) {
    warnings.push(
      `content starts with a different heading ("${firstLine.trimEnd()}"); the section heading "${heading}" will be renamed`,
    );
  }
  return warnings;
}

export async function updateSection(
  input: UpdateSectionInput,
  rootDir: string,
): Promise<UpdateSectionSummary> {
  validateFileExtension(input.path, ALLOWED_EXTENSIONS);
  const filePath = resolveSecurePath(rootDir, input.path);
  const content = await fs.readFile(filePath, 'utf-8');
  const oldSection = getSectionFromText(content, input.heading, input.occurrence);
  const updated = updateSectionInText(content, input.heading, input.content, input.occurrence);
  await fs.writeFile(filePath, updated, 'utf-8');
  return {
    path: input.path,
    heading: input.heading,
    ...(input.occurrence !== undefined ? { occurrence: input.occurrence } : {}),
    oldLines: oldSection === null ? 0 : oldSection.split('\n').length,
    newLines: input.content.split('\n').length,
    bytesDelta: Buffer.byteLength(updated, 'utf-8') - Buffer.byteLength(content, 'utf-8'),
    warnings: collectContentWarnings(input.heading, input.content),
  };
}
