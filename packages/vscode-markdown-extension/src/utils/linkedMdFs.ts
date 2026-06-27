import * as path from 'path';
import { buildLinkCandidates } from './linkCandidates';
import { isMarkdownPath } from './linkOpenTarget';

export interface LinkedMdToken {
  mtimeMs: number;
  size: number;
}

export function stripHrefDecorations(href: string): { path: string; anchor: string | null } {
  const hashIndex = href.indexOf('#');
  const beforeHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const rawAnchor = hashIndex >= 0 ? href.slice(hashIndex + 1) : null;
  const queryIndex = beforeHash.indexOf('?');
  const cleanPath = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  return {
    path: cleanPath,
    anchor: rawAnchor === null || rawAnchor === '' ? null : rawAnchor,
  };
}

export function isWithinRoot(resolvedPath: string, root: string | undefined): boolean {
  if (!root) return false;
  const resolvedRoot = path.resolve(root);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + path.sep);
}

export function tokensMatch(a: LinkedMdToken, b: LinkedMdToken): boolean {
  return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

export function resolveLinkedMdCandidates(
  href: string,
  docDir: string,
  workspaceRoot: string | undefined,
): string[] {
  const stripped = stripHrefDecorations(href);
  if (!stripped.path) return [];

  const candidates = buildLinkCandidates(stripped.path, docDir, workspaceRoot);
  if (!candidates) return [];

  const root = workspaceRoot ?? docDir;
  return candidates
    .map(candidate => path.resolve(candidate))
    .filter(candidate => isMarkdownPath(candidate) && isWithinRoot(candidate, root));
}
