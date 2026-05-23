import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ResolvedRepo {
  readonly gitRoot: string;
  readonly repoName: string;
}

export interface ResolveWatchedReposOpts {
  /** lep.json の gitRoots（拡張・デーモン共通の監視対象リポジトリ群）。 */
  readonly gitRoots: readonly string[];
  /**
   * anytimeTrail.workspace.path（拡張のみ追加する主リポジトリ。未設定時 undefined）。
   * デーモンは gitRoots のみで解決するため undefined を渡す。
   */
  readonly workspacePath?: string;
  /** 存在確認を差し替え可能にする（テスト用）。 */
  readonly fsLike?: {
    readonly existsSync: (p: string) => boolean;
  };
  /** git working tree 判定を差し替え可能にする（テスト用）。 */
  readonly isGitWorkingTree?: (cwd: string) => boolean;
  readonly logger?: { readonly warn: (msg: string) => void };
}

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
 * - `gitRoots`: lep.json の `gitRoots`（拡張・デーモン共通）
 * - `workspacePath`: anytimeTrail.workspace.path（拡張のみ追加する主リポジトリ）
 *
 * `gitRoots` を先頭に積んだ上で `workspacePath` を追加する。空文字は除外し、
 * path.resolve で正規化したのち重複を排除する（先勝ち。`workspacePath` が
 * `gitRoots` 内の値と重複しても `gitRoots` 側の順序を維持する）。
 * 存在しない / git working tree でないパスは warn してスキップする。
 * `repoName` は `path.basename(gitRoot)`。
 */
export function resolveWatchedRepos(opts: ResolveWatchedReposOpts): ResolvedRepo[] {
  const fsLike = opts.fsLike ?? { existsSync: fs.existsSync };
  const isGit = opts.isGitWorkingTree ?? defaultIsGitWorkingTree;
  const logger = opts.logger ?? { warn: () => { /* noop */ } };

  const candidates: string[] = [...opts.gitRoots];
  if (opts.workspacePath) {
    candidates.push(opts.workspacePath);
  }

  // 正規化と重複排除（空文字は除外）
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of candidates) {
    if (typeof c !== 'string' || c.trim() === '') continue;
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
