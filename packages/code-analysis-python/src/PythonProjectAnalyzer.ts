import fs from 'node:fs';
import path from 'node:path';
import type { Ignore } from 'ignore';

/** repo ルート配下の .py / .pyi を repo 相対 POSIX パスで列挙する（exclude で除外）。 */
export function discoverPythonFiles(root: string, exclude?: Ignore): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (exclude?.ignores(rel)) continue;
      if (entry.isDirectory()) walk(abs);
      else if (/\.pyi?$/.test(entry.name)) out.push(rel);
    }
  };
  walk(root);
  return out.sort();
}
