/**
 * /api/c4/releases (GET) のユニットテスト
 */

const mockCreateC4ModelStore = jest.fn();
const mockFetchC4ModelEntries = jest.fn();

jest.mock('../lib/api-helpers', () => ({
  createC4ModelStore: mockCreateC4ModelStore,
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

jest.mock('@anytime-markdown/trail-core/c4', () => ({
  fetchC4ModelEntries: mockFetchC4ModelEntries,
}), { virtual: true });

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { headers?: Record<string, string> }) => ({
      _body: body,
      _headers: init?.headers ?? {},
    })),
  },
}));

import { GET } from '../app/api/c4/releases/route';

type MockResponse = { _body: unknown };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/c4/releases', () => {
  it('returns empty array when store is not available', async () => {
    mockCreateC4ModelStore.mockReturnValue(null);

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body).toEqual([]);
  });

  it('returns entries from fetchC4ModelEntries', async () => {
    const store = {};
    mockCreateC4ModelStore.mockReturnValue(store);
    const entries = [{ tag: 'v1.0.0', repoName: 'my-repo' }];
    mockFetchC4ModelEntries.mockResolvedValue(entries);

    const result = (await GET()) as unknown as MockResponse;
    expect(mockFetchC4ModelEntries).toHaveBeenCalledWith(store);
    expect(result._body).toEqual(entries);
  });

  it('returns empty array when fetchC4ModelEntries throws', async () => {
    mockCreateC4ModelStore.mockReturnValue({});
    mockFetchC4ModelEntries.mockRejectedValue(new Error('supabase error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body).toEqual([]);
    consoleSpy.mockRestore();
  });
});
