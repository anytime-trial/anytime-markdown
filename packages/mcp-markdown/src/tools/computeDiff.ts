import fs from 'fs/promises';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';
// Import directly to avoid React/Next.js barrel export dependencies
import { computeDiff as coreComputeDiff } from '@anytime-markdown/markdown-core/src/utils/diffEngine';
import type { DiffResult } from '@anytime-markdown/markdown-core/src/utils/diffEngine';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface ComputeDiffInput {
  contentA?: string;
  contentB?: string;
  pathA?: string;
  pathB?: string;
}

export type { DiffResult };

export async function diff(input: ComputeDiffInput, rootDir: string): Promise<DiffResult> {
  let contentA: string;
  let contentB: string;

  if (input.contentA !== undefined && input.contentB !== undefined) {
    contentA = input.contentA;
    contentB = input.contentB;
  } else if (input.pathA !== undefined && input.pathB !== undefined) {
    validateFileExtension(input.pathA, ALLOWED_EXTENSIONS);
    validateFileExtension(input.pathB, ALLOWED_EXTENSIONS);
    const fileA = resolveSecurePath(rootDir, input.pathA);
    const fileB = resolveSecurePath(rootDir, input.pathB);
    [contentA, contentB] = await Promise.all([
      fs.readFile(fileA, 'utf-8'),
      fs.readFile(fileB, 'utf-8'),
    ]);
  } else {
    throw new Error('Provide either (contentA, contentB) or (pathA, pathB)');
  }

  return coreComputeDiff(contentA, contentB);
}
