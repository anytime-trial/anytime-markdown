/**
 * /api/press-reports (GET) のユニットテスト
 */

const mockListReports = jest.fn();
const mockExtractErrorMessage = jest.fn((e: unknown) => (e instanceof Error ? e.message : 'Unknown error'));

jest.mock('../lib/reportClient', () => ({
  listReports: mockListReports,
}));

jest.mock('../lib/api-helpers', () => ({
  extractErrorMessage: mockExtractErrorMessage,
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: unknown, init?: { status?: number }) => ({ _body: body, _init: init })),
  },
}));

import { GET } from '../app/api/press-reports/route';

type MockResponse = {
  _body: { daily: unknown; weekly: unknown };
  _init?: { status?: number };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/press-reports', () => {
  it('returns daily and weekly reports from matching categories', async () => {
    mockListReports.mockResolvedValue([
      { slug: 'd', date: '2026-05-19', title: 'Daily News', key: 'r/d.md', category: 'daily' },
      { slug: 'w', date: '2026-05-12', title: 'Weekly Digest', key: 'r/w.md', category: 'Weekly' },
      { slug: 'o', date: '2026-05-10', title: 'Other', key: 'r/o.md', category: 'tech' },
    ]);

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.daily).toMatchObject({ slug: 'd' });
    expect(result._body.weekly).toMatchObject({ slug: 'w' });
  });

  it('returns null for categories not found', async () => {
    mockListReports.mockResolvedValue([
      { slug: 'x', date: '2026-05-01', title: 'X', key: 'r/x.md', category: 'tech' },
    ]);

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.daily).toBeNull();
    expect(result._body.weekly).toBeNull();
  });

  it('returns 503 with empty payload on listReports error', async () => {
    mockListReports.mockRejectedValue(new Error('s3 error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = (await GET()) as unknown as MockResponse;
    // 形状は成功時と同じに保ち、クライアントの型を壊さない
    expect(result._body.daily).toBeNull();
    expect(result._body.weekly).toBeNull();
    // 「0 件」と「取得失敗」をクライアントが区別できるよう status で表す
    expect(result._init?.status).toBe(503);
    consoleSpy.mockRestore();
  });

  it('returns no error status on success', async () => {
    mockListReports.mockResolvedValue([]);

    const result = (await GET()) as unknown as MockResponse;
    expect(result._init?.status).toBeUndefined();
  });

  it('handles reports with no category', async () => {
    mockListReports.mockResolvedValue([
      { slug: 'n', date: '2026-05-01', title: 'No Cat', key: 'r/n.md' },
    ]);

    const result = (await GET()) as unknown as MockResponse;
    expect(result._body.daily).toBeNull();
    expect(result._body.weekly).toBeNull();
  });
});
