/**
 * /api/trail/sessions/[id], /api/trail/sessions/[id]/commits,
 * /api/trail/sessions/[id]/tool-metrics,
 * /api/trail/days/[date]/tool-metrics のユニットテスト
 */

const mockTrailReaderRoute = jest.fn();

jest.mock('../lib/api-helpers', () => ({
  trailReaderRoute: mockTrailReaderRoute,
}));

const MockNextResponse = class {
  _body: unknown;
  _status: number;
  static json = jest.fn((body: unknown, init?: { status?: number }) => {
    const r = new MockNextResponse(body, init);
    return r;
  });
  constructor(body: unknown, init?: { status?: number }) {
    this._body = body;
    this._status = init?.status ?? 200;
  }
};

jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

import { GET as sessionGET } from '../app/api/trail/sessions/[id]/route';
import { GET as sessionCommitsGET } from '../app/api/trail/sessions/[id]/commits/route';
import { GET as sessionToolMetricsGET } from '../app/api/trail/sessions/[id]/tool-metrics/route';
import { GET as dayToolMetricsGET } from '../app/api/trail/days/[date]/tool-metrics/route';

type MockResp = { _body: unknown; _status: number };

beforeEach(() => {
  jest.clearAllMocks();
  mockTrailReaderRoute.mockResolvedValue({ _body: {}, _status: 200 });
});

describe('GET /api/trail/sessions/[id]', () => {
  it('returns 400 when id is empty', async () => {
    const result = (await sessionGET({} as Request, {
      params: Promise.resolve({ id: '' }),
    })) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(mockTrailReaderRoute).not.toHaveBeenCalled();
  });

  it('delegates when id is provided', async () => {
    await sessionGET({} as Request, { params: Promise.resolve({ id: 'sess-123' }) });
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, fallback, path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/sessions/sess-123');
    expect(fallback).toEqual({ messages: [] });
  });
});

describe('GET /api/trail/sessions/[id]/commits', () => {
  it('delegates with commits fallback', async () => {
    await sessionCommitsGET({} as Request, { params: Promise.resolve({ id: 'sess-456' }) });
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, fallback, path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/sessions/sess-456/commits');
    expect(fallback).toEqual({ commits: [] });
  });
});

describe('GET /api/trail/sessions/[id]/tool-metrics', () => {
  it('delegates with null fallback', async () => {
    await sessionToolMetricsGET({} as Request, { params: Promise.resolve({ id: 'sess-789' }) });
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, fallback, path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/sessions/sess-789/tool-metrics');
    expect(fallback).toBeNull();
  });
});

describe('GET /api/trail/days/[date]/tool-metrics', () => {
  it('delegates with null fallback and date in path', async () => {
    await dayToolMetricsGET({} as Request, { params: Promise.resolve({ date: '2026-05-19' }) });
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, fallback, path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/days/2026-05-19/tool-metrics');
    expect(fallback).toBeNull();
  });
});
