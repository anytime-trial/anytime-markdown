/**
 * /api/github-trending (GET) のユニットテスト
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown) => ({ _body: body })),
  },
}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.DOCS_GITHUB_TOKEN;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

function makeFakeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    full_name: 'owner/repo',
    description: 'A repo',
    html_url: 'https://github.com/owner/repo',
    stargazers_count: 100,
    language: 'TypeScript',
    owner: { login: 'owner' },
    name: 'repo',
    ...overrides,
  };
}

function makeFetchMock(items: unknown[]) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ items }),
  });
}

import { GET } from '../app/api/github-trending/route';

type MockResponse = { _body: { daily: unknown[]; weekly: unknown[]; monthly: unknown[] } };

describe('GET /api/github-trending', () => {
  it('returns daily, weekly, monthly trending repos', async () => {
    const repo = makeFakeRepo();
    global.fetch = makeFetchMock([repo]);

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.daily).toHaveLength(1);
    expect(result._body.daily[0]).toMatchObject({ fullName: 'owner/repo', stars: 100 });
    expect(result._body.weekly).toHaveLength(1);
    expect(result._body.monthly).toHaveLength(1);
  });

  it('maps repo fields correctly', async () => {
    const repo = makeFakeRepo({ description: null, language: null });
    global.fetch = makeFetchMock([repo]);

    const result = (await GET()) as unknown as MockResponse;
    const mapped = result._body.daily[0] as Record<string, unknown>;
    expect(mapped.description).toBeNull();
    expect(mapped.language).toBeNull();
    expect(mapped.owner).toBe('owner');
    expect(mapped.name).toBe('repo');
  });

  it('includes Authorization header when DOCS_GITHUB_TOKEN is set', async () => {
    process.env.DOCS_GITHUB_TOKEN = 'ghp_token';
    const repo = makeFakeRepo();
    const mockFetch = makeFetchMock([repo]);
    global.fetch = mockFetch;

    await GET();
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ghp_token');
  });

  it('omits Authorization header when no token', async () => {
    const repo = makeFakeRepo();
    const mockFetch = makeFetchMock([repo]);
    global.fetch = mockFetch;

    await GET();
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('returns empty lists when GitHub API returns error status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.daily).toEqual([]);
    expect(result._body.weekly).toEqual([]);
    expect(result._body.monthly).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('returns empty lists when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.daily).toEqual([]);
    consoleSpy.mockRestore();
  });
});
