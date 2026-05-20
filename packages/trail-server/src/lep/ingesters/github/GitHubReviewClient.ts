/**
 * GitHub PR review 取込用の最小 REST クライアント (LEP Step 4b)。
 *
 * trail-server / trail-core に既存 GitHub クライアントは無く、web-app の API route は
 * 別パッケージで再利用不可のため新規実装する。`gh` CLI には依存せず `fetch` + token 方式。
 * Ingester はこの interface に依存し、テストでは fake を注入して実 API 非依存にする。
 */
export interface GitHubReviewClient {
  /** state=all の PR 番号一覧を更新日時降順で返す。`since` 指定時は updatedAt >= since に絞る。 */
  listPullNumbers(
    owner: string,
    repo: string,
    opts?: { since?: string; maxPrs?: number },
  ): Promise<GitHubPullSummary[]>;
  /** PR の review 一覧。 */
  listReviews(owner: string, repo: string, prNumber: number): Promise<GitHubReviewDto[]>;
  /** PR の review コメント (行コメント) 一覧。`reviewId` で review に紐づく。 */
  listReviewComments(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubReviewCommentDto[]>;
}

export interface GitHubPullSummary {
  readonly number: number;
  /** PR の更新日時 (ISO 8601 + Z) */
  readonly updatedAt: string;
}

export interface GitHubReviewDto {
  /** GitHub REST の review id */
  readonly id: number;
  /** レビュアの login (取得不能なら空文字) */
  readonly author: string;
  /** GitHub の生 state ('APPROVED' / 'CHANGES_REQUESTED' / 'COMMENTED' / 'DISMISSED' / 'PENDING') */
  readonly state: string;
  /** 提出日時 (ISO 8601 + Z)。PENDING review は null */
  readonly submittedAt: string | null;
  readonly body: string;
}

export interface GitHubReviewCommentDto {
  /** 紐づく review id (pull_request_review_id)。無ければ null */
  readonly reviewId: number | null;
  readonly path: string;
  /** 行番号 (line ?? original_line)。ファイルレベル/outdated は null */
  readonly line: number | null;
  readonly body: string;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetchGitHubReviewClientOptions {
  /** GitHub personal access token (env 経由で渡す。直書き禁止)。 */
  readonly token: string;
  /** API ベース URL (省略時 `https://api.github.com`)。 */
  readonly baseUrl?: string;
  /** fetch 実装の注入口 (テスト用)。省略時は `globalThis.fetch`。 */
  readonly fetchImpl?: FetchLike;
  /** rate limit 時のリトライ上限 (省略時 3)。 */
  readonly maxRetries?: number;
  /** リトライ待機の sleep 注入口 (テスト用に no-op 可)。省略時は実 setTimeout。 */
  readonly sleep?: (ms: number) => Promise<void>;
  /** 1 リクエストあたりの最大待機 ms (rate limit reset が遠い場合の上限)。省略時 60000。 */
  readonly maxWaitMs?: number;
  readonly logger?: { info?: (m: string) => void; warn?: (m: string) => void };
}

const DEFAULT_BASE_URL = 'https://api.github.com';
/** GitHub REST の per_page 上限。これを超える分はページネーション未実装のため取得されない。 */
const PER_PAGE = 100;

/**
 * `fetch` ベースの {@link GitHubReviewClient} 実装。
 *
 * - 認証: `Authorization: Bearer <token>`
 * - rate limit: 429、または 403 かつ `X-RateLimit-Remaining: 0` のとき、`Retry-After` /
 *   `X-RateLimit-Reset` を見て待機しリトライ (code-quality.md の Cloudflare 教訓)。
 *   Cloudflare 等の共有 IP では 429/403 を受けやすいため必須。
 * - その他の非 2xx は即 throw する。
 */
export function createFetchGitHubReviewClient(
  opts: FetchGitHubReviewClientOptions,
): GitHubReviewClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const resolvedFetch = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
  const maxRetries = opts.maxRetries ?? 3;
  const maxWaitMs = opts.maxWaitMs ?? 60_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  if (!resolvedFetch) {
    throw new Error('createFetchGitHubReviewClient: fetch is unavailable (Node 18+ or inject fetchImpl)');
  }
  // narrowing を closure に持ち込むため非 optional const に束ねる
  const doFetch: FetchLike = resolvedFetch;

  async function request<T>(pathAndQuery: string): Promise<T> {
    const url = `${baseUrl}${pathAndQuery}`;
    let attempt = 0;
    // 最大 maxRetries 回までリトライ (合計 maxRetries+1 トライ)
    for (;;) {
      const res = await doFetch(url, {
        headers: {
          Authorization: `Bearer ${opts.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'anytime-trail-lep',
        },
      });

      if (res.ok) {
        return (await res.json()) as T;
      }

      const isRateLimited =
        res.status === 429 ||
        (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');

      if (isRateLimited && attempt < maxRetries) {
        const waitMs = Math.min(rateLimitWaitMs(res), maxWaitMs);
        opts.logger?.warn?.(
          `[GitHubReviewClient] rate limited (${res.status}) on ${pathAndQuery}, retry ${attempt + 1}/${maxRetries} after ${waitMs}ms`,
        );
        await sleep(waitMs);
        attempt += 1;
        continue;
      }

      const bodyText = await safeText(res);
      throw new Error(
        `GitHub API ${res.status} ${res.statusText} for ${pathAndQuery}${bodyText ? `: ${bodyText}` : ''}`,
      );
    }
  }

  return {
    async listPullNumbers(owner, repo, listOpts) {
      const perPage = Math.min(Math.max(listOpts?.maxPrs ?? 30, 1), 100);
      const raw = await request<RawPull[]>(
        `/repos/${enc(owner)}/${enc(repo)}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}`,
      );
      const since = listOpts?.since;
      const out: GitHubPullSummary[] = [];
      for (const p of raw) {
        const updatedAt = String(p.updated_at ?? '');
        if (since && updatedAt && updatedAt < since) continue;
        out.push({ number: Number(p.number), updatedAt });
      }
      return out;
    },

    async listReviews(owner, repo, prNumber) {
      const raw = await request<RawReview[]>(
        `/repos/${enc(owner)}/${enc(repo)}/pulls/${prNumber}/reviews?per_page=${PER_PAGE}`,
      );
      warnIfTruncated(opts.logger, raw.length, `reviews of ${owner}/${repo}#${prNumber}`);
      return raw.map((r) => ({
        id: Number(r.id),
        author: String(r.user?.login ?? ''),
        state: String(r.state ?? ''),
        submittedAt: r.submitted_at ? String(r.submitted_at) : null,
        body: String(r.body ?? ''),
      }));
    },

    async listReviewComments(owner, repo, prNumber) {
      const raw = await request<RawReviewComment[]>(
        `/repos/${enc(owner)}/${enc(repo)}/pulls/${prNumber}/comments?per_page=${PER_PAGE}`,
      );
      warnIfTruncated(opts.logger, raw.length, `review comments of ${owner}/${repo}#${prNumber}`);
      return raw.map((c) => ({
        reviewId: c.pull_request_review_id == null ? null : Number(c.pull_request_review_id),
        path: String(c.path ?? ''),
        line: c.line ?? c.original_line ?? null,
        body: String(c.body ?? ''),
      }));
    },
  };
}

interface RawPull {
  number: number;
  updated_at: string;
}
interface RawReview {
  id: number;
  user?: { login?: string } | null;
  state?: string;
  submitted_at?: string | null;
  body?: string | null;
}
interface RawReviewComment {
  pull_request_review_id?: number | null;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  body?: string;
}

function enc(segment: string): string {
  return encodeURIComponent(segment);
}

/** 取得件数が per_page 上限に達した = ページネーション未取得分がある可能性を warn する。 */
function warnIfTruncated(
  logger: FetchGitHubReviewClientOptions['logger'],
  count: number,
  what: string,
): void {
  if (count >= PER_PAGE) {
    logger?.warn?.(
      `[GitHubReviewClient] ${what}: fetched ${count} (per_page=${PER_PAGE}); 追加ページは未取得です`,
    );
  }
}

/** rate limit レスポンスから待機 ms を導出する。Retry-After (秒) 優先、無ければ X-RateLimit-Reset。 */
function rateLimitWaitMs(res: Response): number {
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    const sec = Number(retryAfter);
    if (Number.isFinite(sec) && sec >= 0) return sec * 1000;
  }
  const reset = res.headers.get('x-ratelimit-reset');
  if (reset) {
    const resetMs = Number(reset) * 1000;
    if (Number.isFinite(resetMs)) {
      const delta = resetMs - Date.now();
      if (delta > 0) return delta;
    }
  }
  return 1000; // ヘッダ不明時のデフォルト
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return '';
  }
}
