/**
 * /api/note-graph (GET) のユニットテスト
 *
 * 認証・パラメータ検証（パストラバーサル拒否）・slash 付きブランチの SHA 解決・
 * MAX_FILES による打ち切りと truncated 通知・バッチ取得を固定する。
 */

const mockFetchWithRetry = jest.fn();
const mockValidateGitHubRepo = jest.fn();
const mockGetGitHubToken = jest.fn();
const mockParseNoteGraphDoc = jest.fn();

jest.mock('../lib/fetchWithRetry', () => ({
  fetchWithRetry: mockFetchWithRetry,
  validateGitHubRepo: mockValidateGitHubRepo,
}));
jest.mock('../lib/githubAuth', () => ({ getGitHubToken: mockGetGitHubToken }));
jest.mock('../lib/noteGraphDoc', () => ({ parseNoteGraphDoc: mockParseNoteGraphDoc }));

type MockResp = { _body: Record<string, unknown>; _status: number; _headers: Record<string, string> };

class MockNextResponse {
  static json = jest.fn(
    (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
      ({ _body: body, _status: init?.status ?? 200, _headers: init?.headers ?? {} }) as MockResp,
  );
}
jest.mock('next/server', () => ({ NextResponse: MockNextResponse }));

import { GET } from '../app/api/note-graph/route';

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as unknown as import('next/server').NextRequest;
}

const call = async (params: Record<string, string> = {}): Promise<MockResp> =>
  (await GET(makeRequest(params))) as unknown as MockResp;

/** ref → tree → contents の 3 種の GitHub 応答を組み立てる。 */
function stubGitHub(opts: {
  sha?: string | null;
  refOk?: boolean;
  treeOk?: boolean;
  treeStatus?: number;
  paths?: string[];
  truncated?: boolean;
  blobFor?: (path: string) => string | null;
}) {
  mockFetchWithRetry.mockImplementation(async (url: string) => {
    if (url.includes('/git/ref/heads/')) {
      if (opts.refOk === false) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ object: { sha: opts.sha ?? 'sha-1' } }) };
    }
    if (url.includes('/git/trees/')) {
      if (opts.treeOk === false) {
        return { ok: false, status: opts.treeStatus ?? 500, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          truncated: opts.truncated ?? false,
          tree: [
            ...(opts.paths ?? []).map((path) => ({ path, type: 'blob' })),
            { path: 'notes/image.png', type: 'blob' },
            { path: 'notes', type: 'tree' },
          ],
        }),
      };
    }
    const match = /\/contents\/(.+)\?ref=/.exec(url);
    const path = match ? decodeURIComponent(match[1]) : '';
    const raw = opts.blobFor ? opts.blobFor(path) : '# doc';
    if (raw === null) return { ok: false, status: 404, json: async () => ({}) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: Buffer.from(raw, 'utf-8').toString('base64') }),
    };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGitHubToken.mockResolvedValue('gh-token');
  mockValidateGitHubRepo.mockReturnValue(true);
  mockParseNoteGraphDoc.mockImplementation((_raw: string, path: string) => ({ path, title: path, related: [] }));
});

describe('GET /api/note-graph — 認証とパラメータ検証', () => {
  it('トークンが無ければ 401', async () => {
    mockGetGitHubToken.mockResolvedValue(null);
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._status).toBe(401);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('repo 未指定は 400', async () => {
    const res = await call({ branch: 'main' });
    expect(res._status).toBe(400);
  });

  it('branch 未指定は 400', async () => {
    const res = await call({ repo: 'o/r' });
    expect(res._status).toBe(400);
  });

  it('repo が検証に落ちたら 400', async () => {
    mockValidateGitHubRepo.mockReturnValue(false);
    const res = await call({ repo: 'bad repo', branch: 'main' });
    expect(res._status).toBe(400);
  });

  it.each(['../etc/passwd', 'feat/..%2Fx', 'a..b', 'main;rm -rf', 'ブランチ'])(
    'branch=%s はパストラバーサル/不正文字として 400',
    async (branch) => {
      const res = await call({ repo: 'o/r', branch });
      expect(res._status).toBe(400);
    },
  );

  it('slash を含むブランチ名は許容する', async () => {
    stubGitHub({ paths: ['notes/a.md'] });
    const res = await call({ repo: 'o/r', branch: 'feature/foo' });
    expect(res._status).toBe(200);
    expect(String(mockFetchWithRetry.mock.calls[0][0])).toContain('/git/ref/heads/feature/foo');
  });
});

describe('GET /api/note-graph — GitHub 応答', () => {
  it('ブランチが解決できなければ 404', async () => {
    stubGitHub({ refOk: false });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._status).toBe(404);
  });

  it('ref に sha が無ければ 404', async () => {
    mockFetchWithRetry.mockResolvedValue({ ok: true, status: 200, json: async () => ({ object: {} }) });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._status).toBe(404);
  });

  it('tree 取得の失敗は GitHub のステータスをそのまま返す', async () => {
    stubGitHub({ treeOk: false, treeStatus: 403 });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._status).toBe(403);
  });

  it('.md 以外は除外し、解決した SHA で tree を叩く', async () => {
    stubGitHub({ sha: 'sha-xyz', paths: ['notes/a.md', 'notes/b.md'] });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(String(mockFetchWithRetry.mock.calls[1][0])).toContain('/git/trees/sha-xyz?recursive=1');
    expect(res._body['docs']).toHaveLength(2);
  });

  it('blob 取得に失敗した md は落とす', async () => {
    stubGitHub({
      paths: ['notes/a.md', 'notes/broken.md'],
      blobFor: (p) => (p.includes('broken') ? null : '# ok'),
    });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._body['docs']).toHaveLength(1);
  });

  it('content が空の blob は落とす', async () => {
    mockFetchWithRetry.mockImplementation(async (url: string) => {
      if (url.includes('/git/ref/')) return { ok: true, json: async () => ({ object: { sha: 's' } }) };
      if (url.includes('/git/trees/')) {
        return { ok: true, json: async () => ({ tree: [{ path: 'notes/a.md', type: 'blob' }] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._body['docs']).toEqual([]);
  });

  it('parseNoteGraphDoc が null を返した md は落とす', async () => {
    stubGitHub({ paths: ['notes/a.md', 'notes/b.md'] });
    mockParseNoteGraphDoc.mockImplementation((_raw: string, path: string) =>
      path.endsWith('a.md') ? { path, title: 'A', related: [] } : null,
    );
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._body['docs']).toHaveLength(1);
  });

  it('パスの各セグメントを URL エンコードして取得する', async () => {
    stubGitHub({ paths: ['notes/日本語 file.md'] });
    await call({ repo: 'o/r', branch: 'main' });
    const blobUrl = String(mockFetchWithRetry.mock.calls.at(-1)?.[0]);
    expect(blobUrl).toContain('/contents/notes/');
    expect(blobUrl).not.toContain(' ');
  });

  it('private キャッシュヘッダを付ける', async () => {
    stubGitHub({ paths: ['notes/a.md'] });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._headers['Cache-Control']).toBe('private, max-age=300');
  });
});

describe('GET /api/note-graph — 件数上限', () => {
  it('GitHub tree 自体が truncated なら truncated:true を返す', async () => {
    stubGitHub({ paths: ['notes/a.md'], truncated: true });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._body['truncated']).toBe(true);
  });

  it('500 件を超える md は 500 件へ切り捨て、truncated と警告で通知する', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubGitHub({ paths: Array.from({ length: 512 }, (_, i) => `notes/doc-${i}.md`) });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._body['docs']).toHaveLength(500);
    expect(res._body['truncated']).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('512'));
    warn.mockRestore();
  });

  it('上限内なら truncated:false', async () => {
    stubGitHub({ paths: ['notes/a.md'] });
    const res = await call({ repo: 'o/r', branch: 'main' });
    expect(res._body['truncated']).toBe(false);
  });
});
