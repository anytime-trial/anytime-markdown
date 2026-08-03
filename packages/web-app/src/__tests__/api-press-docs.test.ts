/**
 * /api/press-docs (GET) のユニットテスト
 */

const mockFetchLayoutData = jest.fn();
const mockExtractErrorMessage = jest.fn((e: unknown) => (e instanceof Error ? e.message : 'Unknown error'));

jest.mock('../lib/s3Client', () => ({
  fetchLayoutData: mockFetchLayoutData,
  s3Client: { send: jest.fn() },
  DOCS_BUCKET: 'test-bucket',
  DOCS_PREFIX: 'docs/',
}));

jest.mock('../lib/api-helpers', () => ({
  extractErrorMessage: mockExtractErrorMessage,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ _body: body, _init: init })),
  },
}));

import { GET } from '../app/api/press-docs/route';

type MockResponse = { _body: unknown; _init?: { status?: number } };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/press-docs', () => {
  it('returns layout data on success', async () => {
    const layout = { categories: [{ id: 'a', label: 'A', order: 1, items: [] }] };
    mockFetchLayoutData.mockResolvedValue(layout);

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body).toEqual(layout);
  });

  it('returns 503 with empty categories on fetchLayoutData error', async () => {
    mockFetchLayoutData.mockRejectedValue(new Error('s3 error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body).toEqual({ categories: [] });
    // 「カテゴリが 0 件」と「取得失敗」をクライアントが区別できるようにする
    expect(result._init?.status).toBe(503);
    consoleSpy.mockRestore();
  });

  it('returns no error status on success', async () => {
    mockFetchLayoutData.mockResolvedValue({ categories: [] });

    const result = (await GET()) as unknown as MockResponse;
    expect(result._init?.status).toBeUndefined();
  });
});
