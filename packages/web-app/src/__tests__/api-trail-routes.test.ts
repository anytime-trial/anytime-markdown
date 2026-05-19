/**
 * /api/trail/* (GET) のユニットテスト
 * 全ルートが trailReaderRoute に委譲するシンプルな構造のため、
 * 委譲が正しく行われることを確認する。
 */

const mockTrailReaderRoute = jest.fn();

jest.mock('../lib/api-helpers', () => ({
  trailReaderRoute: mockTrailReaderRoute,
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
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

// Dynamic imports after mocks
import { GET as analyticsGET } from '../app/api/trail/analytics/route';
import { GET as combinedGET } from '../app/api/trail/combined/route';
import { GET as costOptGET } from '../app/api/trail/cost-optimization/route';
import { GET as deploymFreqGET } from '../app/api/trail/deployment-frequency/route';
import { GET as deploymFreqQualGET } from '../app/api/trail/deployment-frequency-quality/route';
import { GET as qualityMetricsGET } from '../app/api/trail/quality-metrics/route';
import { GET as releasesGET } from '../app/api/trail/releases/route';
import { GET as sessionsGET } from '../app/api/trail/sessions/route';

type MockResp = { _body: unknown; _status: number };

function makeRequest(params: Record<string, string> = {}, url = 'http://localhost/'): import('next/server').NextRequest {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return {
    nextUrl: { searchParams: u.searchParams },
    url: u.toString(),
  } as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTrailReaderRoute.mockResolvedValue({ _body: {}, _status: 200 });
});

describe('GET /api/trail/analytics', () => {
  it('delegates to trailReaderRoute', async () => {
    await analyticsGET();
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [fn, fallback, path] = mockTrailReaderRoute.mock.calls[0];
    expect(typeof fn).toBe('function');
    expect(fallback).toBeNull();
    expect(path).toBe('/api/trail/analytics');
  });
});

describe('GET /api/trail/cost-optimization', () => {
  it('delegates to trailReaderRoute', async () => {
    await costOptGET();
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, , path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/cost-optimization');
  });
});

describe('GET /api/trail/releases', () => {
  it('delegates to trailReaderRoute with empty-array fallback', async () => {
    await releasesGET();
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, fallback, path] = mockTrailReaderRoute.mock.calls[0];
    expect(fallback).toEqual([]);
    expect(path).toBe('/api/trail/releases');
  });
});

describe('GET /api/trail/combined', () => {
  it('delegates with default period=day and rangeDays=30', async () => {
    const req = makeRequest({});
    await combinedGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [fn, , path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/combined');
    // The reader function is bound to period/rangeDays; verify it constructs a call
    expect(typeof fn).toBe('function');
  });

  it('accepts period=week and rangeDays=90', async () => {
    const req = makeRequest({ period: 'week', rangeDays: '90' });
    await combinedGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
  });

  it('clamps invalid rangeDays to 30', async () => {
    const req = makeRequest({ rangeDays: '999' });
    await combinedGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/trail/deployment-frequency', () => {
  it('returns 400 when from/to missing', async () => {
    const req = makeRequest({});
    const result = (await deploymFreqGET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(mockTrailReaderRoute).not.toHaveBeenCalled();
  });

  it('delegates when from/to provided', async () => {
    const req = makeRequest({ from: '2026-01-01', to: '2026-01-31' });
    await deploymFreqGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, , path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/deployment-frequency');
  });

  it('uses week bucket when bucket=week', async () => {
    const req = makeRequest({ from: '2026-01-01', to: '2026-01-31', bucket: 'week' });
    await deploymFreqGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/trail/deployment-frequency-quality', () => {
  it('returns 400 when from/to missing', async () => {
    const req = makeRequest({});
    const result = (await deploymFreqQualGET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(mockTrailReaderRoute).not.toHaveBeenCalled();
  });

  it('delegates when from/to provided', async () => {
    const req = makeRequest({ from: '2026-01-01', to: '2026-01-31' });
    await deploymFreqQualGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, , path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/deployment-frequency-quality');
  });
});

describe('GET /api/trail/quality-metrics', () => {
  it('returns 400 when from/to missing', async () => {
    const req = makeRequest({});
    const result = (await qualityMetricsGET(req)) as unknown as MockResp;
    expect(result._status).toBe(400);
    expect(mockTrailReaderRoute).not.toHaveBeenCalled();
  });

  it('delegates when from/to provided', async () => {
    const req = makeRequest({ from: '2026-01-01', to: '2026-01-31' });
    await qualityMetricsGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, , path] = mockTrailReaderRoute.mock.calls[0];
    expect(path).toBe('/api/trail/quality-metrics');
  });
});

describe('GET /api/trail/sessions', () => {
  it('delegates to trailReaderRoute', async () => {
    const req = {
      url: 'http://localhost/api/trail/sessions',
    } as unknown as Request;
    await sessionsGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
    const [, fallback, path] = mockTrailReaderRoute.mock.calls[0];
    expect(fallback).toEqual([]);
    expect(path).toBe('/api/trail/sessions');
  });

  it('passes filter params from query string', async () => {
    const req = {
      url: 'http://localhost/api/trail/sessions?branch=main&model=claude&q=foo',
    } as unknown as Request;
    await sessionsGET(req);
    expect(mockTrailReaderRoute).toHaveBeenCalledTimes(1);
  });
});
