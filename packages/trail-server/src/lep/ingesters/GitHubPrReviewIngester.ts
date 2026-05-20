import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import type {
  Analyzer,
  AnalyzerContext,
  AnalyzerEvent,
} from '@anytime-markdown/memory-core';

import type {
  GitHubReviewClient,
  GitHubReviewCommentDto,
} from './github/GitHubReviewClient';
import { parseGitHubRemote, type GitHubRepoRef } from './github/parseGitHubRemote';

/** GitHubPrReviewIngester が `state` を SourceEvent の許容値に正規化する際に使う集合。 */
const ALLOWED_STATES = new Set(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']);

type EmittableState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';

/** gitRoot から origin remote URL を取得する読み出し口 (テスト差し替え可)。 */
export interface GitRemoteReader {
  getRemoteUrl(gitRoot: string): string | null;
}

export interface GitHubPrReviewIngesterOptions {
  /**
   * GitHub クライアント。`null` (token なし / opt-out) のとき Ingester は emit せず skip する
   * (LLM 不在と同じグレースフル退行。token なし環境でも他 source は動く)。
   */
  readonly client: GitHubReviewClient | null;
  /** 監視対象 gitRoot 群。origin remote から owner/name を解決する。 */
  readonly gitRoots: readonly string[];
  /** 取込下限の submitted_at / updated_at (ISO 8601 + Z)。省略時は全件 (API per_page 上限まで)。 */
  readonly since?: string;
  /** 1 repo あたり走査する PR 数上限 (省略時 30)。 */
  readonly maxPrs?: number;
  /** remote URL 読み出し口 (テスト差し替え可)。省略時は `git remote get-url origin`。 */
  readonly gitRemoteReader?: GitRemoteReader;
}

/**
 * Layer 1 Ingester (新ソース参照実装): GitHub PR review を取込み `github_pr_review` を emit する。
 *
 * - tier=1 / subscribes=[] / emits=['github_pr_review']
 * - `client` が null (token なし) の場合は warn + skip し、既存挙動を変えない (opt-in)
 * - watched gitRoot の origin remote から owner/name を解決 (GitHub 以外 / remote 不在は skip)
 * - PR ごとに review + 行コメントを取得し、APPROVED / CHANGES_REQUESTED / COMMENTED の
 *   submitted 済 review のみ emit する (DISMISSED / PENDING は除外)
 * - 冪等性: emit する event に bodyHash を含め、PrReviewImporter (Step 4c) が
 *   review_id PK + body_hash で upsert / 変更検知する
 *
 * API / 解析エラーはその repo / PR を skip して run 全体を継続する (グレースフル退行)。
 */
export class GitHubPrReviewIngester implements Analyzer {
  readonly id = 'GitHubPrReviewIngester';
  readonly tier = 1 as const;
  readonly subscribes: readonly AnalyzerEvent['kind'][] = [];
  readonly emits: readonly AnalyzerEvent['kind'][] = ['github_pr_review'];

  private readonly remoteReader: GitRemoteReader;

  constructor(private readonly opts: GitHubPrReviewIngesterOptions) {
    this.remoteReader = opts.gitRemoteReader ?? defaultGitRemoteReader;
  }

  // Ingester は Wave 実行フェーズ (onRunEnd) で source event を emit する (消費側は orchestrator Pass 1 で初期化済み)。
  async onRunEnd(ctx: AnalyzerContext): Promise<void> {
    if (!this.opts.client) {
      ctx.logger.info('[GitHubPrReviewIngester] no GitHub token configured, skipping (opt-in source)');
      return;
    }

    const repos = this.resolveRepos(ctx);
    if (repos.length === 0) {
      ctx.logger.info('[GitHubPrReviewIngester] no GitHub remotes resolved, nothing to ingest');
      return;
    }

    let emitted = 0;
    for (const repo of repos) {
      try {
        emitted += await this.ingestRepo(repo, ctx);
      } catch (err) {
        ctx.logger.error(
          `[GitHubPrReviewIngester] repo ${repo.owner}/${repo.name} failed: ${errMsg(err)}`,
        );
      }
    }
    ctx.logger.info(
      `[GitHubPrReviewIngester] emitted ${emitted} reviews from ${repos.length} repo(s)`,
    );
  }

  /** gitRoot 群から GitHub owner/name を解決し重複排除する。 */
  private resolveRepos(ctx: AnalyzerContext): GitHubRepoRef[] {
    const seen = new Set<string>();
    const repos: GitHubRepoRef[] = [];
    for (const gitRoot of this.opts.gitRoots) {
      let url: string | null = null;
      try {
        url = this.remoteReader.getRemoteUrl(gitRoot);
      } catch (err) {
        ctx.logger.warn?.(
          `[GitHubPrReviewIngester] remote read failed for ${gitRoot}: ${errMsg(err)}`,
        );
        continue;
      }
      const ref = parseGitHubRemote(url);
      if (!ref) {
        if (url) {
          ctx.logger.info(
            `[GitHubPrReviewIngester] ${gitRoot}: remote "${url}" is not a GitHub repo, skipping`,
          );
        }
        continue;
      }
      const key = `${ref.owner}/${ref.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      repos.push(ref);
    }
    return repos;
  }

  /** 1 repo の PR review を取込み emit。emit 件数を返す。 */
  private async ingestRepo(repo: GitHubRepoRef, ctx: AnalyzerContext): Promise<number> {
    const client = this.opts.client;
    if (!client) return 0;

    const pulls = await client.listPullNumbers(repo.owner, repo.name, {
      since: this.opts.since,
      maxPrs: this.opts.maxPrs,
    });

    let emitted = 0;
    for (const pull of pulls) {
      const [reviews, comments] = await Promise.all([
        client.listReviews(repo.owner, repo.name, pull.number),
        client.listReviewComments(repo.owner, repo.name, pull.number),
      ]);
      const commentsByReview = groupCommentsByReview(comments);

      for (const review of reviews) {
        if (!ALLOWED_STATES.has(review.state)) continue; // DISMISSED / PENDING を除外
        if (!review.submittedAt) continue; // 未提出 (PENDING) を除外
        if (this.opts.since && review.submittedAt < this.opts.since) continue;

        const reviewComments = (commentsByReview.get(review.id) ?? []).map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
        }));
        const bodyHash = computeBodyHash(review.body, reviewComments);

        await ctx.bus.publish({
          kind: 'github_pr_review',
          repo: `${repo.owner}/${repo.name}`,
          prNumber: pull.number,
          reviewId: String(review.id),
          author: review.author,
          state: review.state as EmittableState,
          submittedAt: review.submittedAt,
          body: review.body,
          bodyHash,
          comments: reviewComments,
        });
        emitted += 1;
      }
    }
    return emitted;
  }
}

function groupCommentsByReview(
  comments: readonly GitHubReviewCommentDto[],
): Map<number, GitHubReviewCommentDto[]> {
  const map = new Map<number, GitHubReviewCommentDto[]>();
  for (const c of comments) {
    if (c.reviewId == null) continue;
    const arr = map.get(c.reviewId);
    if (arr) arr.push(c);
    else map.set(c.reviewId, [c]);
  }
  return map;
}

/** body + comments から決定的なハッシュ (sha256 hex 16 文字) を計算する。 */
function computeBodyHash(
  body: string,
  comments: readonly { path: string; line: number | null; body: string }[],
): string {
  const h = createHash('sha256');
  h.update(body);
  for (const c of comments) {
    h.update(` ${c.path} ${c.line ?? ''} ${c.body}`);
  }
  return h.digest('hex').slice(0, 16);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** デフォルトの remote 読み出し: `git remote get-url origin`。 */
export const defaultGitRemoteReader: GitRemoteReader = {
  getRemoteUrl(gitRoot: string): string | null {
    try {
      const out = execFileSync('git', ['remote', 'get-url', 'origin'], {
        encoding: 'utf-8',
        timeout: 10_000,
        cwd: gitRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const trimmed = out.trim();
      return trimmed || null;
    } catch {
      return null;
    }
  },
};
