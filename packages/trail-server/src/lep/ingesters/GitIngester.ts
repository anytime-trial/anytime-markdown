import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';
import { ExecFileGitService, toUTC } from '@anytime-markdown/trail-db';

/**
 * `git log` を 1 行ずつパースするためのレコード。
 */
export interface GitLogEntry {
  hash: string;
  committedAt: string;
  author: string;
  message: string;
}

/**
 * テスト時にプロセス起動を差し替えるためのフック。
 *
 * - `listCommits(gitRoot)`:  該当 gitRoot の git log を取得
 * - `listTags(gitRoot)`:     該当 gitRoot の version tag 列を取得 (新→古)
 * - `getTagCommit(gitRoot, tag)`: tag が指す commit hash を取得
 */
export interface GitReader {
  listCommits(gitRoot: string, limit?: number): GitLogEntry[];
  listTags(gitRoot: string): readonly string[];
  getTagCommit(gitRoot: string, tag: string): string;
}

export interface GitIngesterOptions {
  /** 監視対象 gitRoot 群 */
  readonly gitRoots: readonly string[];
  /** 1 gitRoot あたり emit するコミット件数の上限 (省略時は 5000) */
  readonly maxCommitsPerRoot?: number;
  /** テスト用に差し替え可能な git 読み出しインタフェース */
  readonly gitReader?: GitReader;
}

/**
 * Layer 1 Ingester: 監視対象 gitRoot から `git_commit` / `git_tag` event を emit する。
 *
 * Step 2a 時点では event の subscriber は不在。Step 2b で CommitResolver,
 * Step 2c で ReleaseResolver / CodeGraphBuilder がそれぞれ購読する。
 *
 * 実装方針:
 * - 各 gitRoot で `git log --format=...` を 1 回実行し全コミットを列挙
 * - `git tag -l 'v*' --sort=-version:refname` で version tag を列挙
 * - tag は `git rev-list -1` で対応 commit hash を解決
 *
 * git コマンド失敗時はその gitRoot を skip するだけで run 全体は継続する。
 */
export class GitIngester implements Analyzer {
  readonly id = 'GitIngester';
  readonly tier = 1 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = [];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['git_commit', 'git_tag'];

  private readonly reader: GitReader;

  constructor(private readonly opts: GitIngesterOptions) {
    this.reader = opts.gitReader ?? defaultGitReader;
  }

  async onRunStart(ctx: AnalyzerContext): Promise<void> {
    const limit = this.opts.maxCommitsPerRoot ?? 5000;
    let totalCommits = 0;
    let totalTags = 0;

    for (const gitRoot of this.opts.gitRoots) {
      const repo = path.basename(gitRoot);

      let commits: readonly GitLogEntry[];
      try {
        commits = this.reader.listCommits(gitRoot, limit);
      } catch (err) {
        ctx.logger.error(
          `[GitIngester] listCommits failed for ${gitRoot}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        commits = [];
      }
      for (const c of commits) {
        await ctx.bus.publish({
          kind: 'git_commit',
          repo,
          hash: c.hash,
          committedAt: c.committedAt,
          author: c.author,
          message: c.message,
        });
        totalCommits++;
      }

      let tags: readonly string[];
      try {
        tags = this.reader.listTags(gitRoot);
      } catch (err) {
        ctx.logger.error(
          `[GitIngester] listTags failed for ${gitRoot}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        tags = [];
      }
      for (const tag of tags) {
        let commitHash = '';
        try {
          commitHash = this.reader.getTagCommit(gitRoot, tag);
        } catch (err) {
          ctx.logger.error(
            `[GitIngester] getTagCommit failed for ${gitRoot} ${tag}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        await ctx.bus.publish({
          kind: 'git_tag',
          repo,
          tag,
          commitHash,
        });
        totalTags++;
      }
    }

    ctx.logger.info(
      `[GitIngester] emitted ${totalCommits} commits, ${totalTags} tags from ${this.opts.gitRoots.length} roots`,
    );
  }
}

/**
 * デフォルトの git 実行ドライバ。
 *
 * `ExecFileGitService` は listTags / getTagCommit に相当する `getVersionTags()` /
 * `getTagCommitHash()` を既に提供しているため、それらを再利用する。
 * `listCommits` は専用 API が無いため execFileSync で直接 log を取る。
 */
export const defaultGitReader: GitReader = {
  listCommits(gitRoot: string, limit = 5000): GitLogEntry[] {
    // 列区切りに NUL (\x00) を、行区切りに RS (\x1e) を使い、commit message に
    // 改行や " が含まれてもパース崩壊しないようにする。
    const fmt = '%H%x00%aI%x00%an%x00%s';
    let stdout = '';
    try {
      stdout = execFileSync(
        'git',
        ['log', '--no-merges', `--max-count=${limit}`, `--format=${fmt}`],
        {
          encoding: 'utf-8',
          timeout: 30_000,
          cwd: gitRoot,
        },
      );
    } catch {
      return [];
    }

    const out: GitLogEntry[] = [];
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('\x00');
      if (parts.length < 4) continue;
      out.push({
        hash: parts[0],
        committedAt: toUTC(parts[1]),
        author: parts[2],
        message: parts[3],
      });
    }
    return out;
  },

  listTags(gitRoot: string): readonly string[] {
    const svc = new ExecFileGitService(gitRoot);
    return svc.getVersionTags();
  },

  getTagCommit(gitRoot: string, tag: string): string {
    const svc = new ExecFileGitService(gitRoot);
    return svc.getTagCommitHash(tag);
  },
};
