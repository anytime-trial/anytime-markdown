import fs from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  '.next',
  'out',
  'build',
  '.git',
  'coverage',
  '.vscode-test',
  '__tests__',
  '.worktrees',
]);
const CODE_EXTS = new Set(['.ts', '.tsx']);
const DOC_EXTS = new Set(['.md', '.txt']);

export class GraphDetector {
  private readonly userIgnore: Ignore;

  constructor(
    private readonly rootPath: string,
    extraExcludePatterns: readonly string[] | Ignore = [],
  ) {
    if (Array.isArray(extraExcludePatterns)) {
      this.userIgnore = ignore();
      const patterns = extraExcludePatterns
        .map(p => p.trim())
        .filter(p => p !== '');
      if (patterns.length > 0) {
        this.userIgnore.add(patterns);
      }
    } else {
      this.userIgnore = extraExcludePatterns as Ignore;
    }
  }

  detectCodeFiles(): string[] {
    return this.walk(this.rootPath, (entry) => CODE_EXTS.has(path.extname(entry.name)));
  }

  detectDocFiles(): string[] {
    return this.walk(this.rootPath, (entry) => DOC_EXTS.has(path.extname(entry.name)));
  }

  detectFilesByName(name: string): string[] {
    return this.walk(this.rootPath, (entry) => entry.name === name);
  }

  private walk(dir: string, match: (entry: fs.Dirent) => boolean): string[] {
    const results: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDE_DIRS.has(entry.name)) continue;
        const relPath = toPosixRelative(this.rootPath, fullPath);
        if (relPath !== '' && this.userIgnore.ignores(`${relPath}/`)) continue;
        results.push(...this.walk(fullPath, match));
      } else if (entry.isFile() && match(entry)) {
        const relPath = toPosixRelative(this.rootPath, fullPath);
        if (relPath !== '' && this.userIgnore.ignores(relPath)) continue;
        results.push(fullPath);
      }
    }
    return results;
  }
}

function toPosixRelative(rootPath: string, fullPath: string): string {
  const rel = path.relative(rootPath, fullPath);
  return rel.split(path.sep).join('/');
}
