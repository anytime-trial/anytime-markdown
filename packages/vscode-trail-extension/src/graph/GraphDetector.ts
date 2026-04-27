import fs from 'node:fs';
import path from 'node:path';

const EXCLUDE_DIRS = new Set([
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
  constructor(private readonly rootPath: string) {}

  detectCodeFiles(): string[] {
    return this.walk(this.rootPath, CODE_EXTS);
  }

  detectDocFiles(): string[] {
    return this.walk(this.rootPath, DOC_EXTS);
  }

  private walk(dir: string, exts: Set<string>): string[] {
    const results: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) {
          results.push(...this.walk(path.join(dir, entry.name), exts));
        }
      } else if (exts.has(path.extname(entry.name))) {
        results.push(path.join(dir, entry.name));
      }
    }
    return results;
  }
}
