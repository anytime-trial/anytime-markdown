import type {
  AnalyzerContext,
  AnalyzerEvent,
  EventBusPublisher,
} from '@anytime-markdown/memory-core';

import { GitHubPrReviewIngester, type GitRemoteReader } from '../GitHubPrReviewIngester';
import type {
  GitHubReviewClient,
  GitHubReviewCommentDto,
  GitHubReviewDto,
} from '../github/GitHubReviewClient';

function makeCtx(): { ctx: AnalyzerContext; events: AnalyzerEvent[]; logs: string[] } {
  const events: AnalyzerEvent[] = [];
  const logs: string[] = [];
  const bus: EventBusPublisher = { publish: async (e) => { events.push(e); } };
  return {
    events,
    logs,
    ctx: {
      runId: 'r1',
      reason: 'manual',
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(`ERR ${m}`), warn: (m) => logs.push(`WARN ${m}`) },
      bus,
    },
  };
}

function remoteReader(map: Record<string, string | null>): GitRemoteReader {
  return { getRemoteUrl: (gitRoot) => map[gitRoot] ?? null };
}

interface FakeRepoData {
  pulls: { number: number; updatedAt: string }[];
  reviews: Record<number, GitHubReviewDto[]>;
  comments: Record<number, GitHubReviewCommentDto[]>;
}

function fakeClient(byRepo: Record<string, FakeRepoData>, onCall?: (m: string) => void): GitHubReviewClient {
  return {
    async listPullNumbers(owner, repo, opts) {
      onCall?.(`pulls:${owner}/${repo}`);
      const data = byRepo[`${owner}/${repo}`];
      if (!data) return [];
      const since = opts?.since;
      return data.pulls.filter((p) => !since || p.updatedAt >= since);
    },
    async listReviews(owner, repo, prNumber) {
      const data = byRepo[`${owner}/${repo}`];
      return data?.reviews[prNumber] ?? [];
    },
    async listReviewComments(owner, repo, prNumber) {
      const data = byRepo[`${owner}/${repo}`];
      return data?.comments[prNumber] ?? [];
    },
  };
}

const PR_REVIEW = (id: number, state: string, submittedAt: string | null, body = ''): GitHubReviewDto => ({
  id,
  author: 'alice',
  state,
  submittedAt,
  body,
});

describe('GitHubPrReviewIngester', () => {
  it('exposes a tier=1 ingester emitting github_pr_review', () => {
    const ing = new GitHubPrReviewIngester({ client: null, gitRoots: [] });
    expect(ing.id).toBe('GitHubPrReviewIngester');
    expect(ing.tier).toBe(1);
    expect(ing.subscribes).toEqual([]);
    expect(ing.emits).toEqual(['github_pr_review']);
  });

  it('skips entirely when no client (no token)', async () => {
    const ing = new GitHubPrReviewIngester({ client: null, gitRoots: ['/repo'] });
    const { ctx, events, logs } = makeCtx();
    await ing.onRunStart(ctx);
    expect(events).toEqual([]);
    expect(logs.join('\n')).toContain('no GitHub token configured');
  });

  it('skips non-GitHub remotes', async () => {
    const ing = new GitHubPrReviewIngester({
      client: fakeClient({}),
      gitRoots: ['/repo'],
      gitRemoteReader: remoteReader({ '/repo': 'git@gitlab.com:acme/widget.git' }),
    });
    const { ctx, events } = makeCtx();
    await ing.onRunStart(ctx);
    expect(events).toEqual([]);
  });

  it('emits reviews for allowed states with comments + bodyHash, skipping DISMISSED/PENDING', async () => {
    const client = fakeClient({
      'acme/widget': {
        pulls: [{ number: 7, updatedAt: '2026-01-10T00:00:00Z' }],
        reviews: {
          7: [
            PR_REVIEW(100, 'APPROVED', '2026-01-10T00:00:00Z', 'lgtm'),
            PR_REVIEW(101, 'CHANGES_REQUESTED', '2026-01-09T00:00:00Z', 'please fix'),
            PR_REVIEW(102, 'DISMISSED', '2026-01-08T00:00:00Z'),
            PR_REVIEW(103, 'PENDING', null),
          ],
        },
        comments: {
          7: [
            { reviewId: 101, path: 'src/a.ts', line: 12, body: 'null check' },
            { reviewId: 999, path: 'x.ts', line: 1, body: 'orphan' },
          ],
        },
      },
    });
    const ing = new GitHubPrReviewIngester({
      client,
      gitRoots: ['/repo'],
      gitRemoteReader: remoteReader({ '/repo': 'https://github.com/acme/widget.git' }),
    });
    const { ctx, events } = makeCtx();
    await ing.onRunStart(ctx);

    expect(events).toHaveLength(2);
    const approved = events.find((e) => e.kind === 'github_pr_review' && e.reviewId === '100');
    const changes = events.find((e) => e.kind === 'github_pr_review' && e.reviewId === '101');
    expect(approved).toMatchObject({
      kind: 'github_pr_review',
      repo: 'acme/widget',
      prNumber: 7,
      state: 'APPROVED',
      author: 'alice',
      body: 'lgtm',
      comments: [],
    });
    expect(changes).toMatchObject({
      reviewId: '101',
      state: 'CHANGES_REQUESTED',
      comments: [{ path: 'src/a.ts', line: 12, body: 'null check' }],
    });
    if (changes?.kind === 'github_pr_review') {
      expect(changes.bodyHash).toHaveLength(16);
    }
  });

  it('filters reviews by since', async () => {
    const client = fakeClient({
      'acme/widget': {
        pulls: [{ number: 7, updatedAt: '2026-02-01T00:00:00Z' }],
        reviews: {
          7: [
            PR_REVIEW(100, 'APPROVED', '2026-01-01T00:00:00Z'), // since 前
            PR_REVIEW(101, 'COMMENTED', '2026-02-05T00:00:00Z'), // since 後
          ],
        },
        comments: {},
      },
    });
    const ing = new GitHubPrReviewIngester({
      client,
      gitRoots: ['/repo'],
      since: '2026-02-01T00:00:00Z',
      gitRemoteReader: remoteReader({ '/repo': 'https://github.com/acme/widget' }),
    });
    const { ctx, events } = makeCtx();
    await ing.onRunStart(ctx);
    expect(events.map((e) => e.kind === 'github_pr_review' && e.reviewId)).toEqual(['101']);
  });

  it('deduplicates repos resolved from multiple gitRoots', async () => {
    const calls: string[] = [];
    const client = fakeClient(
      { 'acme/widget': { pulls: [], reviews: {}, comments: {} } },
      (m) => calls.push(m),
    );
    const ing = new GitHubPrReviewIngester({
      client,
      gitRoots: ['/a', '/b'],
      gitRemoteReader: remoteReader({
        '/a': 'https://github.com/acme/widget.git',
        '/b': 'git@github.com:acme/widget.git',
      }),
    });
    const { ctx } = makeCtx();
    await ing.onRunStart(ctx);
    expect(calls).toEqual(['pulls:acme/widget']); // 1 回だけ
  });

  it('continues to other repos when one repo API call fails', async () => {
    const base = fakeClient({
      'acme/good': {
        pulls: [{ number: 1, updatedAt: '2026-01-10T00:00:00Z' }],
        reviews: { 1: [PR_REVIEW(200, 'APPROVED', '2026-01-10T00:00:00Z')] },
        comments: {},
      },
    });
    const client: GitHubReviewClient = {
      ...base,
      listPullNumbers: async (owner, repo, opts) => {
        if (repo === 'bad') throw new Error('boom');
        return base.listPullNumbers(owner, repo, opts);
      },
    };
    const ing = new GitHubPrReviewIngester({
      client,
      gitRoots: ['/bad', '/good'],
      gitRemoteReader: remoteReader({
        '/bad': 'https://github.com/acme/bad',
        '/good': 'https://github.com/acme/good',
      }),
    });
    const { ctx, events, logs } = makeCtx();
    await ing.onRunStart(ctx);

    expect(events).toHaveLength(1);
    expect(logs.join('\n')).toContain('acme/bad failed: boom');
  });
});
