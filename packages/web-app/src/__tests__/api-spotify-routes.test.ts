/**
 * /api/spotify/charts, /api/spotify/new-releases のユニットテスト
 */

const mockGetClientCredentialsToken = jest.fn();

jest.mock('../lib/spotify', () => ({
  getClientCredentialsToken: mockGetClientCredentialsToken,
  chunkArray: jest.fn(<T>(arr: T[], size: number) => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }),
}));

const mockGetSpotifyToken = jest.fn();
jest.mock('../lib/githubAuth', () => ({
  getSpotifyToken: mockGetSpotifyToken,
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
  NextRequest: class {
    nextUrl: { searchParams: URLSearchParams };
    constructor(_url: string) {
      this.nextUrl = { searchParams: new URLSearchParams() };
    }
  },
  NextResponse: MockNextResponse,
}));

import { GET as chartsGET } from '../app/api/spotify/charts/route';
import { GET as newReleasesGET } from '../app/api/spotify/new-releases/route';

type MockResp = { _body: Record<string, unknown>; _status: number };

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  const sp = new URLSearchParams(params);
  return { nextUrl: { searchParams: sp } } as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetClientCredentialsToken.mockResolvedValue('test-token');
});

// ─────────────────────────────────────────────────────
// GET /api/spotify/charts
// ─────────────────────────────────────────────────────
describe('GET /api/spotify/charts', () => {
  it('returns tracks from featured playlist', async () => {
    const tracks = [
      { id: 'track1', name: 'Track One', artists: [{ name: 'Artist A' }] },
      { id: 'track2', name: 'Track Two', artists: [{ name: 'Artist B' }] },
    ];
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          playlists: { items: [{ id: 'pl-001' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          items: tracks.map((track) => ({ track })),
        }),
      });

    const result = (await chartsGET()) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect(result._body.tracks).toEqual(tracks);
  });

  it('returns empty tracks when no featured playlist', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        playlists: { items: [] },
      }),
    });

    const result = (await chartsGET()) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect(result._body.tracks).toEqual([]);
  });

  it('returns error when featured playlists fetch fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = (await chartsGET()) as unknown as MockResp;
    expect(result._status).toBe(401);
    expect(result._body.error).toBeDefined();
  });

  it('returns error when tracks fetch fails', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          playlists: { items: [{ id: 'pl-001' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

    const result = (await chartsGET()) as unknown as MockResp;
    expect(result._status).toBe(503);
  });

  it('returns 500 when token fetch throws', async () => {
    mockGetClientCredentialsToken.mockRejectedValue(new Error('auth error'));

    const result = (await chartsGET()) as unknown as MockResp;
    expect(result._status).toBe(500);
    expect(result._body.error).toBe('auth error');
  });

  it('filters null tracks from items', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          playlists: { items: [{ id: 'pl-001' }] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          items: [{ track: null }, { track: { id: 'track1', name: 'T1' } }],
        }),
      });

    const result = (await chartsGET()) as unknown as MockResp;
    const tracks = result._body.tracks as unknown[];
    // null track is filtered
    expect(tracks).toEqual([{ id: 'track1', name: 'T1' }]);
  });
});

// ─────────────────────────────────────────────────────
// GET /api/spotify/new-releases
// ─────────────────────────────────────────────────────
describe('GET /api/spotify/new-releases', () => {
  const albums = [
    {
      id: 'album1', name: 'Album One', uri: 'spotify:album:album1',
      artists: [{ name: 'Artist A' }],
      images: [{ url: 'https://img', width: 300, height: 300 }],
      release_date: '2026-01-01',
      external_urls: { spotify: 'https://open.spotify.com/album/album1' },
    },
  ];

  it('returns albums for JP market by default', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ albums: { items: albums } }),
    });

    const req = makeRequest({});
    const result = (await newReleasesGET(req)) as unknown as MockResp;
    expect(result._status).toBe(200);
    expect(result._body.albums).toEqual(albums);
    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('market=JP');
  });

  it('accepts valid market parameter', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ albums: { items: albums } }),
    });

    const req = makeRequest({ market: 'US' });
    await newReleasesGET(req);
    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('market=US');
  });

  it('falls back to JP for invalid market', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ albums: { items: [] } }),
    });

    const req = makeRequest({ market: 'INVALID' });
    await newReleasesGET(req);
    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('market=JP');
  });

  it('returns error when Spotify API fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });

    const req = makeRequest({});
    const result = (await newReleasesGET(req)) as unknown as MockResp;
    expect(result._status).toBe(429);
  });

  it('returns 500 on thrown error', async () => {
    mockGetClientCredentialsToken.mockRejectedValue(new Error('token error'));

    const req = makeRequest({});
    const result = (await newReleasesGET(req)) as unknown as MockResp;
    expect(result._status).toBe(500);
    expect(result._body.error).toBe('token error');
  });
});
