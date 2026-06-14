/**
 * 対象 git リポジトリの解決と `.md` スキャン（Node fs・vscode 非依存）。
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { NoteDocInput } from './types';
import { extractNoteDoc } from './frontmatter';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.claude', '.worktrees', 'coverage']);

/** ディレクトリを上方探索して `.git` を持つリポジトリルートを返す。 */
export function findGitRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * 対象リポジトリルートを決定する。
 *
 * @param configPath 設定 `repositoryPath`（空文字なら未指定）
 * @param workspaceDir 既定の workspace フォルダパス（未指定可）
 * @returns ルートパス。解決できなければ null
 */
export function resolveRepositoryRoot(configPath: string, workspaceDir: string | undefined): string | null {
  const trimmed = configPath.trim();
  if (trimmed) {
    // 設定で明示されたパス。リポジトリルートでなくてもそのまま対象にする。
    return path.resolve(trimmed);
  }
  if (!workspaceDir) return null;
  return findGitRoot(workspaceDir) ?? workspaceDir;
}

/** ルート相対の POSIX パスへ正規化する。 */
function toPosixRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

/**
 * リポジトリ配下の `.md` を走査し、参加条件を満たすノードを返す。
 * frontmatter が無い / title が無い / `graph: false` のファイルは除外される。
 */
export async function scanRepository(root: string): Promise<NoteDocInput[]> {
  const docs: NoteDocInput[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      console.error(`[noteGraph] readdir failed: ${dir}`, err);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        try {
          const content = await fsp.readFile(full, 'utf8');
          const doc = extractNoteDoc(toPosixRel(root, full), content);
          if (doc) docs.push(doc);
        } catch (err) {
          console.error(`[noteGraph] read failed: ${full}`, err);
        }
      }
    }
  }

  await walk(root);
  // 安定した順序（パス昇順）で返す。グラフの初期配置を決定的にする。
  docs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return docs;
}

/**
 * `related` 追記対象の絶対パスを返す（リポジトリルート相対パスから解決）。
 */
export function resolveDocPath(root: string, relPath: string): string {
  return path.join(root, ...relPath.split('/'));
}
