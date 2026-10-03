import fs from 'node:fs/promises';
import matter from 'gray-matter';
import { resolveSecurePath, validateFileExtension } from './securePath';

export type TrustBoundary = 'workspace' | 'external' | 'unknown';
export interface UntrustedSegment {
  kind: 'comment' | 'embed';
  /** 1-based, inclusive file line numbers. */
  startLine: number;
  endLine: number;
}
export interface TrustInfo {
  boundary: TrustBoundary;
  untrustedSegments: UntrustedSegment[];
}

export function detectTrust(markdown: string): TrustInfo {
  let boundary: TrustBoundary;
  try {
    // Disable gray-matter's cache: failed parses otherwise leave cached empty data.
    boundary = matter(markdown, {}).data.trust === 'external' ? 'external' : 'workspace';
  } catch {
    boundary = 'unknown';
  }
  const untrustedSegments: UntrustedSegment[] = [];
  // Keep the exact trailing-block rules of markdown-engine/commentHelpers.
  const commentStart = '\n<!-- comments\n';
  const commentEnd = '\n-->';
  const start = markdown.lastIndexOf(commentStart);
  if (start !== -1) {
    const end = markdown.indexOf(commentEnd, start + commentStart.length);
    if (end !== -1 && markdown.slice(end + commentEnd.length).trim() === '') {
      untrustedSegments.push({
        kind: 'comment',
        startLine: markdown.slice(0, start + 1).split('\n').length,
        endLine: markdown.slice(0, end + 1).split('\n').length,
      });
    }
  }

  let fence: { char: string; length: number } | undefined;
  markdown.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fence) {
      if (marker && marker[1].startsWith(fence.char) && marker[1].length >= fence.length
        && trimmed.slice(marker[1].length).trim() === '') {
        fence = undefined;
      }
      return;
    }
    if (marker && (!marker[1].startsWith('`') || !trimmed.slice(marker[1].length).includes('`'))) {
      fence = { char: marker[1][0], length: marker[1].length };
      return;
    }
    if (/^https?:\/\/\S+$/.test(trimmed)
      || /^\[[^[\]\r\n]*\]\(https?:\/\/[^\s)]+\)$/.test(trimmed)
      || /^<https?:\/\/[^\s<>]+>$/.test(trimmed)) {
      untrustedSegments.push({ kind: 'embed', startLine: index + 1, endLine: index + 1 });
    }
  });
  untrustedSegments.sort((a, b) => a.startLine - b.startLine);
  return { boundary, untrustedSegments };
}

export function clipSegments(segments: UntrustedSegment[], startLine: number, endLine: number): UntrustedSegment[] {
  return segments.flatMap(segment => {
    const start = Math.max(segment.startLine, startLine);
    const end = Math.min(segment.endLine, endLine);
    return start <= end ? [{ ...segment, startLine: start, endLine: end }] : [];
  });
}

/**
 * 検索ヒットのパスは catalog.db を ingest した文書ルート基準で、mcp-markdown の rootDir とは
 * 別のことがある（`.mcp.json` の cwd が /anytime-markdown、文書ルートが docsRoot 等。
 * レビュー指摘 #3）。rootDir で見つからなければ環境変数 ANYTIME_MARKDOWN_DOC_ROOT の
 * ルートでも試す。どちらのルートでも rootDir 外への脱出は securePath が拒否する。
 */
export const DOC_ROOT_ENV = 'ANYTIME_MARKDOWN_DOC_ROOT';

async function readBoundaryUnderRoot(rootDir: string, relPath: string): Promise<TrustBoundary | null> {
  try {
    validateFileExtension(relPath, ['.md', '.markdown']);
    const file = resolveSecurePath(rootDir, relPath);
    const [realRoot, realFile] = await Promise.all([fs.realpath(rootDir), fs.realpath(file)]);
    resolveSecurePath(realRoot, realFile);
    return detectTrust(await fs.readFile(realFile, 'utf-8')).boundary;
  } catch {
    return null;
  }
}

export async function resolveBoundaryForFile(rootDir: string, relPath: string): Promise<TrustBoundary> {
  const roots = [rootDir];
  const docRoot = process.env[DOC_ROOT_ENV];
  if (docRoot !== undefined && docRoot !== '' && docRoot !== rootDir) roots.push(docRoot);
  for (const root of roots) {
    const boundary = await readBoundaryUnderRoot(root, relPath);
    if (boundary !== null) return boundary;
  }
  return 'unknown';
}
