/**
 * ドキュメントルート配下の `.md` を走査する（Node fs）。
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.claude', '.anytime']);

export interface DiscoveredDoc {
  /** 絶対パス。 */
  absPath: string;
  /** docsRoot 相対の POSIX パス（例 `spec/51.graph-core/graph-core.ja.md`）。 */
  relPath: string;
}

/**
 * `docsRoot/subDir` 配下の `.md` を再帰収集する。relPath は docsRoot 相対 POSIX。
 *
 * @param docsRoot ドキュメントリポジトリのルート（relPath の基準）
 * @param subDir 走査対象サブディレクトリ（既定 `spec`）
 */
export async function discoverDocs(docsRoot: string, subDir = 'spec'): Promise<DiscoveredDoc[]> {
  const out: DiscoveredDoc[] = [];
  const start = path.join(docsRoot, subDir);

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(full);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        out.push({ absPath: full, relPath: path.relative(docsRoot, full).split(path.sep).join('/') });
      }
    }
  }

  await walk(start);
  out.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return out;
}
