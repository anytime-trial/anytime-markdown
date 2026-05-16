import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ResolvedRepo {
  readonly gitRoot: string;
  readonly repoName: string;
}

export interface ResolveWatchedReposOpts {
  /** anytimeTrail.workspace.path 設定値（未設定時 undefined） */
  readonly workspacePath: string | undefined;
  /** vscode.workspace.workspaceFolders[0].uri.fsPath（未開時 undefined） */
  readonly workspaceFolder: string | undefined;
  /** ファイルアクセスを差し替え可能にする（テスト用） */
  readonly fsLike?: {
    readonly existsSync: (p: string) => boolean;
    readonly readFileSync: (p: string, encoding: 'utf-8') => string;
  };
  /** git working tree 判定を差し替え可能にする（テスト用） */
  readonly isGitWorkingTree?: (cwd: string) => boolean;
  readonly logger?: { readonly warn: (msg: string) => void };
}

const HISTORY_FILE_REL = path.join('.anytime', 'anytime-history.json');

const defaultIsGitWorkingTree = (cwd: string): boolean => {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd,
      encoding: 'utf-8',
      timeout: 3_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * 監視対象 repo を解決する。
 *
 * 入力:
 * - `workspacePath` (anytimeTrail.workspace.path)
 * - `<workspaceFolder>/.anytime/anytime-history.json` の `specDocsRoots`
 *
 * 重複は path.resolve で正規化したのち除外。git working tree でないパスは warn してスキップ。
 * `repoName` は `path.basename(gitRoot)`。
 */
export function resolveWatchedRepos(opts: ResolveWatchedReposOpts): ResolvedRepo[] {
  const fsLike = opts.fsLike ?? { existsSync: fs.existsSync, readFileSync: fs.readFileSync as (p: string, e: 'utf-8') => string };
  const isGit = opts.isGitWorkingTree ?? defaultIsGitWorkingTree;
  const logger = opts.logger ?? { warn: () => { /* noop */ } };

  const candidates: string[] = [];

  if (opts.workspacePath && opts.workspacePath.trim() !== '') {
    candidates.push(opts.workspacePath);
  }

  if (opts.workspaceFolder) {
    const historyFile = path.join(opts.workspaceFolder, HISTORY_FILE_REL);
    if (fsLike.existsSync(historyFile)) {
      try {
        const raw = fsLike.readFileSync(historyFile, 'utf-8');
        const parsed = JSON.parse(raw) as { specDocsRoots?: unknown };
        if (Array.isArray(parsed.specDocsRoots)) {
          for (const entry of parsed.specDocsRoots) {
            if (typeof entry === 'string' && entry.trim() !== '') {
              candidates.push(entry);
            }
          }
        }
      } catch (e) {
        logger.warn(
          `[resolveWatchedRepos] failed to parse ${historyFile}: ${e instanceof Error ? e.message : String(e)}. Falling back to workspace.path only.`,
        );
      }
    }
  }

  // 正規化と重複排除
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of candidates) {
    const normalized = path.resolve(c);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }

  // git working tree 検証
  const result: ResolvedRepo[] = [];
  for (const gitRoot of unique) {
    if (!fsLike.existsSync(gitRoot)) {
      logger.warn(`[resolveWatchedRepos] path does not exist: ${gitRoot}`);
      continue;
    }
    if (!isGit(gitRoot)) {
      logger.warn(`[resolveWatchedRepos] not a git working tree: ${gitRoot}`);
      continue;
    }
    result.push({ gitRoot, repoName: path.basename(gitRoot) });
  }

  return result;
}
