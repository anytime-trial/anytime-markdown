import fs from 'fs/promises';
import { JSDOM } from 'jsdom';
import { resolveSecurePath, validateFileExtension } from '../utils/securePath';

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export interface SanitizeInput {
  content?: string;
  path?: string;
}

// Set up DOM globals for DOMPurify before importing editor-core
function setupDomGlobals(): void {
  if (typeof window === 'undefined') {
    const dom = new JSDOM('');
    const win = dom.window;
    (globalThis as Record<string, unknown>).window = win;
    (globalThis as Record<string, unknown>).document = win.document;
    (globalThis as Record<string, unknown>).HTMLElement = win.HTMLElement;
    (globalThis as Record<string, unknown>).Element = win.Element;
    (globalThis as Record<string, unknown>).Node = win.Node;
    (globalThis as Record<string, unknown>).navigator = win.navigator;
  }
}

let sanitizeMarkdownFn: ((md: string) => string) | null = null;

async function getSanitizeFunction(): Promise<(md: string) => string> {
  if (sanitizeMarkdownFn) return sanitizeMarkdownFn;

  setupDomGlobals();
  // Import directly from the util file to avoid pulling in React/Next.js dependencies
  const mod = await import('@anytime-markdown/editor-core/src/utils/sanitizeMarkdown');
  sanitizeMarkdownFn = mod.sanitizeMarkdown as (md: string) => string;
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
