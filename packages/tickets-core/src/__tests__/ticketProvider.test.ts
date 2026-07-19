import { GitHubContentsProvider } from '../githubContentsProvider';
import { GitHubIssuesProvider } from '../githubIssuesProvider';
import { serializeTicket, type TicketFrontmatter } from '../ticketModel';
import {
  createTicketProvider,
  isTicketProviderKind,
  providerAllowedHosts,
  providerDefaultHosts,
  TICKET_PROVIDER_KINDS,
  type TicketProviderConfig,
} from '../ticketProvider';
import { TicketConflictError } from '../ticketRepository';

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

function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
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

const T1_TEXT = serializeTicket(fm({ id: 'T-1', title: 'first', status: 'up_next' }), '## 概要 (Description)\n\nx\n');

describe('createTicketProvider / providerAllowedHosts', () => {
  it('github-contents は GitHubContentsProvider を返す', () => {
    const provider = createTicketProvider({ provider: 'github-contents', token: 't', repo: 'o/r', branch: 'main' });
    expect(provider).toBeInstanceOf(GitHubContentsProvider);
    expect(provider.kind).toBe('github-contents');
  });

  it('github-issues は GitHubIssuesProvider を返す', () => {
    const provider = createTicketProvider({ provider: 'github-issues', token: 't', repo: 'o/r' });
    expect(provider).toBeInstanceOf(GitHubIssuesProvider);
    expect(provider.kind).toBe('github-issues');
  });

  it('providerAllowedHosts は apiBaseUrl のホストを返す（既定は api.github.com）', () => {
    const base: TicketProviderConfig = { provider: 'github-contents', token: 't', repo: 'o/r', branch: 'main' };
    expect(providerAllowedHosts(base)).toEqual(['api.github.com']);
    expect(providerAllowedHosts({ ...base, apiBaseUrl: 'https://ghe.example.com/api/v3' })).toEqual([
      'ghe.example.com',
    ]);
  });

  it('providerDefaultHosts は全種別で既定ホストを返す（SSRF 許可リストの静的合成用）', () => {
    for (const kind of TICKET_PROVIDER_KINDS) {
      expect(providerDefaultHosts(kind)).toEqual(['api.github.com']);
    }
  });

  it('isTicketProviderKind は enum 値のみ許可する', () => {
    expect(isTicketProviderKind('github-contents')).toBe(true);
    expect(isTicketProviderKind('github-issues')).toBe(true);
    expect(isTicketProviderKind('backlog')).toBe(false);
    expect(isTicketProviderKind(undefined)).toBe(false);
  });
});

describe('GitHubContentsProvider（sha→version 写像）', () => {
  it('list は sha を version として返す', async () => {
    const { fetchFn } = makeFetch({
      '/repos/o/r/contents/.tickets?ref=main': [
        {
          method: 'GET',
          status: 200,
          json: [{ name: 'T-1-first.md', path: '.tickets/T-1-first.md', sha: 'dir-sha', type: 'file' }],
        },
      ],
      '/repos/o/r/contents/.tickets%2FT-1-first.md?ref=main': [
        { method: 'GET', status: 200, json: { sha: 'file-sha', content: b64(T1_TEXT) } },
      ],
    });
    const provider = createTicketProvider({ provider: 'github-contents', token: 't', repo: 'o/r', branch: 'main', fetchFn });
    const result = await provider.list();
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0].version).toBe('file-sha');
    expect(result.tickets[0].frontmatter.id).toBe('T-1');
    expect('sha' in result.tickets[0]).toBe(false);
  });

  it('update は version を sha として送信し、新 version を返す', async () => {
    const { fetchFn, calls } = makeFetch({
      '/repos/o/r/contents/.tickets%2FT-1-first.md': [
        {
          method: 'PUT',
          status: 200,
          json: { content: { path: '.tickets/T-1-first.md', sha: 'new-sha' }, commit: { sha: 'commit-1' } },
        },
      ],
    });
    const provider = createTicketProvider({ provider: 'github-contents', token: 't', repo: 'o/r', branch: 'main', fetchFn });
    const result = await provider.update({
      path: '.tickets/T-1-first.md',
      content: T1_TEXT,
      version: 'old-sha',
      message: 'ticket: update',
    });
    expect(result.version).toBe('new-sha');
    expect(result.commitId).toBe('commit-1');
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body?.sha).toBe('old-sha');
  });

  it('競合（409）は TicketConflictError のまま透過する', async () => {
    const { fetchFn } = makeFetch({
      '/repos/o/r/contents/.tickets%2FT-1-first.md': [
        { method: 'PUT', status: 409, json: { message: 'conflict' } },
      ],
    });
    const provider = createTicketProvider({ provider: 'github-contents', token: 't', repo: 'o/r', branch: 'main', fetchFn });
    await expect(
      provider.update({ path: '.tickets/T-1-first.md', content: T1_TEXT, version: 's', message: 'm' }),
    ).rejects.toBeInstanceOf(TicketConflictError);
  });
});
