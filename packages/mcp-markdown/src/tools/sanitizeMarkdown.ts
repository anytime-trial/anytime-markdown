import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface SanitizeInput {
  content?: string;
  path?: string;
}

let sanitizeMarkdownFn: ((md: string) => string) | null = null;

async function getSanitizeFunction(): Promise<(md: string) => string> {
  if (sanitizeMarkdownFn) return sanitizeMarkdownFn;

  // Import directly from the framework-agnostic engine (no React/MUI/next-intl)
  const mod = await import('@anytime-markdown/markdown-engine');
  // Inject a jsdom window into DOMPurify without polluting globalThis.
  mod.configureSanitizerWindow(new JSDOM('').window);
  sanitizeMarkdownFn = mod.sanitizeMarkdown;
  return sanitizeMarkdownFn;
}

export async function sanitize(input: SanitizeInput, rootDir: string): Promise<string> {
  let content: string;

  if (input.content !== undefined) {
    content = input.content;
  } else if (input.path !== undefined) {
    validateFileExtension(input.path, ALLOWED_EXTENSIONS);
    const filePath = resolveSecurePath(rootDir, input.path);
    content = await fs.readFile(filePath, 'utf-8');
  } else {
    throw new Error('Either content or path must be provided');
  }

  const fn = await getSanitizeFunction();
  return fn(content);
}
