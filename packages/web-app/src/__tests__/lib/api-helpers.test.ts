/**
 * api-helpers.ts のユニットテスト
 *
 * next/server と trail-viewer/supabase をモックし、
 * extractErrorMessage / trailReaderRoute / createC4ModelStore を検証する。
 */

const mockResolveSupabaseEnv = jest.fn();
const mockFetcher = jest.fn();
const mockTrailReaderInstance = { fetchSomething: jest.fn() };
const mockC4ModelStoreInstance = {};

const MockSupabaseTrailReader = jest.fn().mockImplementation(() => mockTrailReaderInstance);
const MockSupabaseC4ModelStore = jest.fn().mockImplementation(() => mockC4ModelStoreInstance);

jest.mock('../../lib/supabase-env', () => ({
  resolveSupabaseEnv: mockResolveSupabaseEnv,
}));

jest.mock('@anytime-markdown/trail-viewer/supabase', () => ({
  SupabaseTrailReader: MockSupabaseTrailReader,
  SupabaseC4ModelStore: MockSupabaseC4ModelStore,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { headers?: Record<string, string> }) => ({
      _body: body,
      _headers: init?.headers ?? {},
    })),
  },
}));

import { createC4ModelStore, extractErrorMessage, NO_STORE_HEADERS, trailReaderRoute } from '../../lib/api-helpers';

beforeEach(() => {
  jest.clearAllMocks();
});

// ────────────────────────────────────────────────────────────
// extractErrorMessage
// ────────────────────────────────────────────────────────────
describe('extractErrorMessage', () => {
  it('returns message from Error instance', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns "Unknown error" for non-Error values', () => {
    expect(extractErrorMessage('string error')).toBe('Unknown error');
    expect(extractErrorMessage(42)).toBe('Unknown error');
    expect(extractErrorMessage(null)).toBe('Unknown error');
    expect(extractErrorMessage(undefined)).toBe('Unknown error');
    expect(extractErrorMessage({ message: 'obj' })).toBe('Unknown error');
  });
});

// ────────────────────────────────────────────────────────────
// NO_STORE_HEADERS
// ────────────────────────────────────────────────────────────
describe('NO_STORE_HEADERS', () => {
  it('contains Cache-Control: no-store header', () => {
    expect(NO_STORE_HEADERS['Cache-Control']).toContain('no-store');
  });
});

// ────────────────────────────────────────────────────────────
// trailReaderRoute
// ────────────────────────────────────────────────────────────
describe('trailReaderRoute', () => {
  it('returns fallback wrapped in NextResponse when env is not configured', async () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    const result = await trailReaderRoute(mockFetcher, [], 'test-label');
    expect(mockFetcher).not.toHaveBeenCalled();
    expect((result as unknown as { _body: unknown })._body).toEqual([]);
  });

  it('calls fetcher with SupabaseTrailReader and returns result', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'https://x.co', anonKey: 'k' });
    const data = [{ id: 1 }];
    mockFetcher.mockResolvedValue(data);

    const result = await trailReaderRoute(mockFetcher, [], 'test-label');
    expect(MockSupabaseTrailReader).toHaveBeenCalledWith('https://x.co', 'k');
    expect(mockFetcher).toHaveBeenCalledWith(mockTrailReaderInstance);
    expect((result as unknown as { _body: unknown })._body).toEqual(data);
  });

  it('returns fallback when fetcher throws', async () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'https://x.co', anonKey: 'k' });
    mockFetcher.mockRejectedValue(new Error('fetch failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await trailReaderRoute(mockFetcher, null, 'err-label');
    expect((result as unknown as { _body: unknown })._body).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('[err-label] error', expect.any(Error));
    consoleSpy.mockRestore();
  });
});

// ────────────────────────────────────────────────────────────
// createC4ModelStore
// ────────────────────────────────────────────────────────────
describe('createC4ModelStore', () => {
  it('returns null when env is not configured', () => {
    mockResolveSupabaseEnv.mockReturnValue(null);
    expect(createC4ModelStore()).toBeNull();
  });

  it('returns SupabaseC4ModelStore instance when env is configured', () => {
    mockResolveSupabaseEnv.mockReturnValue({ url: 'https://x.co', anonKey: 'k' });
    const store = createC4ModelStore();
    expect(MockSupabaseC4ModelStore).toHaveBeenCalledWith('https://x.co', 'k');
    expect(store).toBe(mockC4ModelStoreInstance);
  });
});
