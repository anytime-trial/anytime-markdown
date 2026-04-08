import type { TrailPromptEntry } from './types';

/**
 * Create a TrailPromptEntry from file metadata.
 * This is a pure transformation - filesystem access is handled by the server/API layer.
 */
export function createPromptEntry(
  filePath: string,
  content: string,
  modifiedTime: string,
  existingVersion?: number,
): TrailPromptEntry {
  return {
    id: generatePromptId(filePath),
    name: extractPromptName(filePath),
    content,
    version: (existingVersion ?? 0) + 1,
    tags: extractTags(filePath),
    createdAt: modifiedTime,
    updatedAt: modifiedTime,
  };
}

/** Generate stable ID from file path */
export function generatePromptId(filePath: string): string {
  return filePath
    .replace(/^[./\\]+/, '')
    .replaceAll(/[/\\. ]+/g, '-')
    .toLowerCase();
}

/** Extract display name from path */
export function extractPromptName(filePath: string): string {
  const base = filePath.split('/').at(-1) ?? filePath;
  return base.replace(/\.md$/i, '');
}

/** Extract tags from path structure */
export function extractTags(filePath: string): string[] {
  const tags: string[] = [];
  if (filePath.includes('rules/')) tags.push('rule');
  if (filePath.includes('skills/')) tags.push('skill');
  if (filePath.includes('CLAUDE.md')) tags.push('main');
  if (filePath.includes('projects/')) tags.push('project');
  return tags;
}
