/**
 * 対象 git リポジトリの解決と `.md` スキャン（Node fs・vscode 非依存）。
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { NoteDocInput } from './types';
import { extractNoteDoc } from './frontmatter';

type Log = (line: string) => void;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.claude', '.worktrees', 'coverage']);

function nowIso(): string {
  return new Date().toISOString();
}

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
 * @param configPath 設定 `anytimeMarkdown.docsRoot`（空文字なら未指定）
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
export async function scanRepository(root: string, log?: Log): Promise<NoteDocInput[]> {
  const docs: NoteDocInput[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      log?.(`[${nowIso()}] [ERROR] [noteGraph] readdir failed: ${dir} ${String(err)}`);
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
          const doc = extractNoteDoc(
            toPosixRel(root, full),
            content,
            (message) => log?.(`[${nowIso()}] [WARN] [noteGraph] ${message} (${full})`),
          );
          if (doc) docs.push(doc);
        } catch (err) {
          log?.(`[${nowIso()}] [ERROR] [noteGraph] read failed: ${full} ${String(err)}`);
        }
      }
    }
  }

  await walk(root);

  // 本文リンクの target を既知ノード集合に対して解決する（ファイル相対 / root 相対の両対応）。
  const known = new Set(docs.map((d) => d.path));
  for (const d of docs) {
    if (!d.bodyLinks || d.bodyLinks.length === 0) continue;
    const resolved = d.bodyLinks
      .map((t) => resolveBodyLinkTarget(d.path, t, known))
      .filter((t) => t !== d.path); // 自己参照は除外
    d.bodyLinks = resolved.length > 0 ? [...new Set(resolved)] : undefined;
  }

  // 安定した順序（パス昇順）で返す。グラフの初期配置を決定的にする。
  docs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return docs;
}

/**
 * 本文リンク target を root 相対パスへ解決する。
 *
 * ファイル相対（markdown 仕様）と root 相対（本コーパスの慣習）の両候補を試し、
 * 既知ノードに一致した方を返す。どちらも未知ならファイル相対解決形（プレースホルダ用）。
 */
export function resolveBodyLinkTarget(docRelPath: string, rawTarget: string, known: Set<string>): string {
  const dir = path.posix.dirname(docRelPath);
  const stripped = rawTarget.replace(/^\.?\//, '');
  const fileRel = path.posix.normalize(path.posix.join(dir, rawTarget)).replace(/^\.\//, '');
  if (known.has(fileRel)) return fileRel;
  const rootRel = path.posix.normalize(stripped);
  if (known.has(rootRel)) return rootRel;
  return fileRel;
}

/**
 * リポジトリルート相対パスから絶対パスを解決する。
 *
 * リポジトリルート外を指すパス（`..` トラバーサル・絶対パス）は拒否して例外を投げる。
 * webview 由来のパスをファイル読み書きに使う前の境界チェック（多層防御の最終段）。
 */
export function resolveDocPath(root: string, relPath: string): string {
  const rootResolved = path.resolve(root);
  const resolved = path.resolve(rootResolved, ...relPath.split('/'));
  const rootNorm = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (resolved !== rootResolved && !resolved.startsWith(rootNorm)) {
    throw new Error(`[noteGraph] path traversal rejected: ${relPath}`);
  }
  return resolved;
}
