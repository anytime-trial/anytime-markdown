import { GitHubIssuesProvider } from '../githubIssuesProvider';
import { serializeTicket, type TicketFrontmatter } from '../ticketModel';
import { TicketApiError, TicketConflictError } from '../ticketRepository';

function fm(overrides: Partial<TicketFrontmatter>): TicketFrontmatter {
  return {
    id: 'T-1',
    title: 'sample',
    status: 'backlog',
    priority: 'low',
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
}

interface Route {
  method: string;
  status: number;
  json: unknown;
}

function makeFetch(routes: Record<string, Route[]>): {
  fetchFn: typeof fetch;
  calls: { method: string; url: string; body?: Record<string, unknown> }[];
} {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  const fetchFn = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, url, body });
    const key = new URL(url).pathname + (new URL(url).search ?? '');
    const route = routes[key]?.find((r) => r.method === method);
    if (!route) {
      return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
    }
    return new Response(JSON.stringify(route.json), { status: route.status });
  }) as typeof fetch;
  return { fetchFn, calls };
}

function issueJson(overrides: {
  number: number;
  state?: 'open' | 'closed';
  title?: string;
  body?: string | null;
  updated_at?: string;
  labels?: string[];
  pull_request?: unknown;
}): Record<string, unknown> {
  return {
    number: overrides.number,
    state: overrides.state ?? 'open',
    title: overrides.title ?? 'sample',
    body: overrides.body,
    updated_at: overrides.updated_at ?? '2026-07-19T01:00:00Z',
    labels: (overrides.labels ?? ['ticket']).map((name) => ({ name })),
    ...(overrides.pull_request !== undefined ? { pull_request: overrides.pull_request } : {}),
  };
}

const LIST_OPEN = '/repos/o/r/issues?labels=ticket&state=open&per_page=100&page=1';
const LIST_ALL = '/repos/o/r/issues?labels=ticket&state=all&per_page=100&page=1';

function makeProvider(fetchFn: typeof fetch): GitHubIssuesProvider {
  return new GitHubIssuesProvider({ provider: 'github-issues', token: 'tok', repo: 'o/r', fetchFn });
}

const T1_BODY = serializeTicket(fm({ id: 'T-1', title: 'first', status: 'up_next' }), '## 概要 (Description)\n\nx\n');
const T2_BODY = serializeTicket(fm({ id: 'T-2', title: 'second' }), '');

describe('GitHubIssuesProvider.list', () => {
  it('body の frontmatter を正本として解析し、updated_at を version にする', async () => {
    const { fetchFn } = makeFetch({
      [LIST_OPEN]: [
        {
          method: 'GET',
          status: 200,
          json: [
            issueJson({ number: 10, body: T1_BODY, updated_at: '2026-07-19T02:00:00Z' }),
            issueJson({ number: 11, body: 'フロントマターなし' }),
          ],
        },
      ],
    });
    const result = await makeProvider(fetchFn).list();
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]).toMatchObject({
      path: 'issues/10',
      version: '2026-07-19T02:00:00Z',
      archived: false,
    });
    expect(result.tickets[0].frontmatter.id).toBe('T-1');
    expect(result.invalid).toEqual([
      { path: 'issues/11', version: '2026-07-19T01:00:00Z', reason: 'フロントマターがありません' },
    ]);
  });

  it('PR と ticket:deleted ラベルの issue を除外する', async () => {
    const { fetchFn } = makeFetch({
      [LIST_OPEN]: [
        {
          method: 'GET',
          status: 200,
          json: [
            issueJson({ number: 10, body: T1_BODY }),
            issueJson({ number: 12, body: T2_BODY, pull_request: { url: 'x' } }),
            issueJson({ number: 13, body: T2_BODY, labels: ['ticket', 'ticket:deleted'] }),
          ],
        },
      ],
    });
    const result = await makeProvider(fetchFn).list();
    expect(result.tickets.map((t) => t.path)).toEqual(['issues/10']);
    expect(result.invalid).toEqual([]);
  });

  it('includeArchive で closed も含め、closed は archived=true になる', async () => {
    const { fetchFn, calls } = makeFetch({
      [LIST_ALL]: [
        {
          method: 'GET',
          status: 200,
          json: [issueJson({ number: 10, body: T1_BODY, state: 'closed' })],
        },
      ],
    });
    const result = await makeProvider(fetchFn).list({ includeArchive: true });
    expect(result.tickets[0].archived).toBe(true);
    expect(calls[0].url).toContain('state=all');
  });
});

describe('GitHubIssuesProvider.create', () => {
  it('既存 frontmatter id を走査して採番し、ミラーラベル付きで POST する', async () => {
    const { fetchFn, calls } = makeFetch({
      [LIST_ALL]: [
        { method: 'GET', status: 200, json: [issueJson({ number: 10, body: T2_BODY })] },
      ],
      '/repos/o/r/issues': [
        {
          method: 'POST',
          status: 201,
          json: issueJson({ number: 20, updated_at: '2026-07-19T03:00:00Z' }),
        },
      ],
    });
    const created = await makeProvider(fetchFn).create({
      title: 'third',
      status: 'up_next',
      priority: 'high',
      assignee: 'agent',
      workspace: 'anytime-markdown',
      now: '2026-07-19T02:30:00.000Z',
    });
    expect(created.path).toBe('issues/20');
    expect(created.version).toBe('2026-07-19T03:00:00Z');
    expect(created.frontmatter.id).toBe('T-3');
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body?.title).toBe('third');
    expect(post?.body?.labels).toEqual([
      'ticket',
      'status:up_next',
      'priority:high',
      'workspace:anytime-markdown',
      'assignee:agent',
    ]);
    expect(String(post?.body?.body)).toContain('id: T-3');
  });
});

describe('GitHubIssuesProvider.update / remove / archive（check-then-act 楽観ロック）', () => {
  const CURRENT = issueJson({ number: 10, body: T1_BODY, updated_at: '2026-07-19T02:00:00Z' });

  it('version 一致なら PATCH し、新 version を返す', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/o/r/issues/10': [
        { method: 'GET', status: 200, json: CURRENT },
        {
          method: 'PATCH',
          status: 200,
          json: issueJson({ number: 10, updated_at: '2026-07-19T04:00:00Z' }),
        },
      ],
    });
    const result = await makeProvider(fetchFn).update({
      path: 'issues/10',
      content: T1_BODY,
      version: '2026-07-19T02:00:00Z',
      message: 'ticket: update',
    });
    expect(result.version).toBe('2026-07-19T04:00:00Z');
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body?.title).toBe('first');
    expect(patch?.body?.labels).toEqual(['ticket', 'status:up_next', 'priority:low']);
  });

  it('version 不一致は PATCH せず TicketConflictError', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/o/r/issues/10': [{ method: 'GET', status: 200, json: CURRENT }],
    });
    await expect(
      makeProvider(fetchFn).update({
        path: 'issues/10',
        content: T1_BODY,
        version: 'stale-version',
        message: 'm',
      }),
    ).rejects.toBeInstanceOf(TicketConflictError);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('remove は close + ticket:deleted ラベルに置き換える', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/o/r/issues/10': [
        { method: 'GET', status: 200, json: CURRENT },
        { method: 'PATCH', status: 200, json: issueJson({ number: 10, state: 'closed' }) },
      ],
    });
    await makeProvider(fetchFn).remove({ path: 'issues/10', version: '2026-07-19T02:00:00Z' });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body?.state).toBe('closed');
    expect(patch?.body?.labels).toEqual(['ticket', 'ticket:deleted']);
  });

  it('archive は close し、closed 済みは 400', async () => {
    const closed = issueJson({ number: 10, body: T1_BODY, state: 'closed', updated_at: '2026-07-19T02:00:00Z' });
    const { fetchFn } = makeFetch({
      '/repos/o/r/issues/10': [{ method: 'GET', status: 200, json: closed }],
    });
    await expect(
      makeProvider(fetchFn).archive({ path: 'issues/10', version: '2026-07-19T02:00:00Z' }),
    ).rejects.toThrow('すでにアーカイブ済みです');
  });

  it('不正なパスは 400 TicketApiError', async () => {
    const { fetchFn } = makeFetch({});
    await expect(
      makeProvider(fetchFn).get('.tickets/T-1.md'),
    ).rejects.toBeInstanceOf(TicketApiError);
  });
});
