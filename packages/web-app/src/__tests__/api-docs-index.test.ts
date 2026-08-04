/**
 * /api/docs-index (GET) のユニットテスト
 *
 * フロントマター解析（c4Scope のインライン記法 / ブロック記法 / 引用符 / CRLF）と、
 * repo 指定時の C4 要素 ID による絞り込み（完全一致・親パス一致）を固定する。
 *
 * ルートはモジュールスコープに 5 分キャッシュ (`cachedIndex`) を持つため、
 * ケースごとに jest.isolateModulesAsync で読み直してキャッシュを分離する。
 */

// トップレベルの import/export が無いとスクリプト扱いになり、他のテストファイルと
// グローバルスコープを共有して識別子が衝突する（tsc のみが検知する）。
export {};

const mockCreateC4ModelStore = jest.fn();
const mockFetchC4Model = jest.fn();

jest.mock('../lib/api-helpers', () => ({
  createC4ModelStore: mockCreateC4ModelStore,
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

jest.mock('@anytime-markdown/trail-core/c4', () => ({
  fetchC4Model: mockFetchC4Model,
}));

class MockNextResponse {
  static json = jest.fn(
    (body: unknown, init?: { headers?: Record<string, string> }) =>
      ({ _body: body, _headers: init?.headers ?? {} }) as MockResp,
  );
}

jest.mock('next/server', () => ({
  NextResponse: MockNextResponse,
}));

type MockResp = { _body: { docs: Array<{ path: string }> }; _headers: Record<string, string> };

/** GitHub API の tree / contents 応答を返す fetch スタブを組む。 */
type FetchInit = { headers: Record<string, string> };

function stubGitHub(files: Record<string, string>, opts: { treeOk?: boolean } = {}) {
  const fetchMock = jest.fn(async (url: string, _init?: FetchInit) => {
    if (url.includes('/git/trees/')) {
      if (opts.treeOk === false) return { ok: false, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          tree: [
            ...Object.keys(files).map((path) => ({ path, type: 'blob' })),
            { path: 'spec/not-markdown.txt', type: 'blob' },
            { path: 'spec', type: 'tree' },
          ],
        }),
      };
    }
    const match = /\/contents\/(.+)\?ref=main$/.exec(url);
    const filePath = match ? decodeURI(match[1]) : '';
    const raw = files[filePath];
    if (raw === undefined) return { ok: false, json: async () => ({}) };
    return {
      ok: true,
      json: async () => ({ content: Buffer.from(raw, 'utf-8').toString('base64') }),
    };
  });
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  return fetchMock;
}

function makeRequest(params: Record<string, string> = {}): import('next/server').NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as unknown as import('next/server').NextRequest;
}

/** モジュールキャッシュを分離してルートの GET を読み込み、1 リクエストを処理する。 */
async function callGet(params: Record<string, string> = {}): Promise<MockResp> {
  let result!: MockResp;
  await jest.isolateModulesAsync(async () => {
    const { GET } = (await import('../app/api/docs-index/route')) as {
      GET: (req: import('next/server').NextRequest) => Promise<unknown>;
    };
    result = (await GET(makeRequest(params))) as MockResp;
  });
  return result;
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  process.env['DOCS_GITHUB_REPO'] = 'anytime-trial/anytime-markdown-docs';
  delete process.env['DOCS_GITHUB_TOKEN'];
  mockCreateC4ModelStore.mockReturnValue(null);
});

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

describe('GET /api/docs-index — 取得できないとき', () => {
  it('DOCS_GITHUB_REPO 未設定なら空配列を返す', async () => {
    delete process.env['DOCS_GITHUB_REPO'];
    const res = await callGet();
    expect(res._body.docs).toEqual([]);
    // Cache-Control を付けない（取得失敗をキャッシュさせない）
    expect(res._headers).toEqual({});
  });

  it('owner/repo として解釈できない値なら空配列を返す', async () => {
    process.env['DOCS_GITHUB_REPO'] = 'not a repo at all';
    const res = await callGet();
    expect(res._body.docs).toEqual([]);
  });

  it('GitHub の tree 取得が失敗したら空配列を返す', async () => {
    stubGitHub({}, { treeOk: false });
    const res = await callGet();
    expect(res._body.docs).toEqual([]);
  });
});

describe('GET /api/docs-index — repo 指定の解釈', () => {
  it('GitHub の URL 形式から owner/repo を抽出する', async () => {
    process.env['DOCS_GITHUB_REPO'] = 'https://github.com/anytime-trial/docs';
    const fetchMock = stubGitHub({});
    await callGet();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/repos/anytime-trial/docs/git/trees/main');
  });

  it('DOCS_GITHUB_TOKEN があれば Authorization ヘッダを付ける', async () => {
    process.env['DOCS_GITHUB_TOKEN'] = 'pat-123';
    const fetchMock = stubGitHub({});
    await callGet();
    const init = fetchMock.mock.calls[0][1] as FetchInit;
    expect(init.headers['Authorization']).toBe('Bearer pat-123');
  });

  it('トークンが無ければ Authorization ヘッダを付けない', async () => {
    const fetchMock = stubGitHub({});
    await callGet();
    const init = fetchMock.mock.calls[0][1] as FetchInit;
    expect(init.headers['Authorization']).toBeUndefined();
  });
});

describe('GET /api/docs-index — フロントマター解析', () => {
  it('c4Scope のインライン記法・ブロック記法の両方を読む', async () => {
    stubGitHub({
      'spec/inline.md': ['---', 'title: "Inline"', 'c4Scope: [pkg_a, "pkg_b"]', '---', '本文'].join('\n'),
      'spec/block.md': ['---', 'title: Block', 'c4Scope:', '  - pkg_c', "  - 'pkg_d'", 'type: spec', '---'].join('\n'),
    });
    const res = await callGet();
    const byPath = Object.fromEntries(
      (res._body.docs as unknown as Array<{ path: string; c4Scope: string[] }>).map((d) => [d.path, d]),
    );
    expect(byPath['spec/inline.md'].c4Scope).toEqual(['pkg_a', 'pkg_b']);
    expect(byPath['spec/block.md'].c4Scope).toEqual(['pkg_c', 'pkg_d']);
  });

  it('title / type / date が無ければ既定値を埋める', async () => {
    stubGitHub({ 'spec/bare.md': ['---', 'c4Scope: [pkg_a]', '---'].join('\n') });
    const res = await callGet();
    expect(res._body.docs[0]).toMatchObject({
      title: 'Untitled',
      type: 'unknown',
      date: '',
      path: 'spec/bare.md',
    });
  });

  it('CRLF 改行のフロントマターも解析する', async () => {
    stubGitHub({ 'spec/crlf.md': '---\r\ntitle: CRLF\r\nc4Scope: [pkg_a]\r\n---\r\n' });
    const res = await callGet();
    expect(res._body.docs).toHaveLength(1);
    expect(res._body.docs[0]).toMatchObject({ title: 'CRLF' });
  });

  it('c4Scope を持たない・フロントマターが閉じない・冒頭が --- でない文書は除外する', async () => {
    stubGitHub({
      'spec/no-scope.md': ['---', 'title: NoScope', '---'].join('\n'),
      'spec/unterminated.md': ['---', 'c4Scope: [pkg_a]'].join('\n'),
      'spec/no-frontmatter.md': '# 見出しだけ',
      'spec/ok.md': ['---', 'c4Scope: [pkg_a]', '---'].join('\n'),
    });
    const res = await callGet();
    expect(res._body.docs.map((d) => d.path)).toEqual(['spec/ok.md']);
  });

  it('blob の取得に失敗したファイルは黙って落とす', async () => {
    const files = { 'spec/ok.md': ['---', 'c4Scope: [pkg_a]', '---'].join('\n') };
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('/git/trees/')) {
        return {
          ok: true,
          json: async () => ({
            tree: [
              { path: 'spec/ok.md', type: 'blob' },
              { path: 'spec/broken.md', type: 'blob' },
              { path: 'spec/empty.md', type: 'blob' },
            ],
          }),
        };
      }
      if (url.includes('broken.md')) return { ok: false, json: async () => ({}) };
      if (url.includes('empty.md')) return { ok: true, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({ content: Buffer.from(files['spec/ok.md'], 'utf-8').toString('base64') }),
      };
    });
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const res = await callGet();
    expect(res._body.docs.map((d) => d.path)).toEqual(['spec/ok.md']);
  });

  it('20 件を超えるファイルもバッチ処理で全件返す', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 45; i += 1) {
      files[`spec/doc-${i}.md`] = ['---', 'c4Scope: [pkg_a]', '---'].join('\n');
    }
    stubGitHub(files);
    const res = await callGet();
    expect(res._body.docs).toHaveLength(45);
  });
});

describe('GET /api/docs-index — repo 指定時の絞り込み', () => {
  const files = {
    'spec/a.md': ['---', 'c4Scope: [pkg_alpha]', '---'].join('\n'),
    'spec/b.md': ['---', 'c4Scope: [pkg_beta]', '---'].join('\n'),
    'spec/parent.md': ['---', 'c4Scope: [pkg_alpha/sub]', '---'].join('\n'),
  };

  it('repo 指定なしなら全件を Cache-Control 付きで返す', async () => {
    stubGitHub(files);
    const res = await callGet();
    expect(res._body.docs).toHaveLength(3);
    expect(res._headers['Cache-Control']).toBe('public, max-age=300');
    expect(mockCreateC4ModelStore).not.toHaveBeenCalled();
  });

  it('C4 ストアが無ければ絞り込まず全件返す', async () => {
    stubGitHub(files);
    mockCreateC4ModelStore.mockReturnValue(null);
    const res = await callGet({ repo: 'my-repo' });
    expect(res._body.docs).toHaveLength(3);
  });

  it('要素 ID と完全一致する c4Scope の文書だけ返す', async () => {
    stubGitHub(files);
    mockCreateC4ModelStore.mockReturnValue({});
    mockFetchC4Model.mockResolvedValue({ model: { elements: [{ id: 'pkg_alpha' }] } });
    const res = await callGet({ repo: 'my-repo' });
    expect(res._body.docs.map((d) => d.path)).toEqual(['spec/a.md']);
    expect(mockFetchC4Model).toHaveBeenCalledWith({}, 'current', 'my-repo');
  });

  it('c4Scope が要素 ID の親パスならヒットする', async () => {
    stubGitHub(files);
    mockCreateC4ModelStore.mockReturnValue({});
    mockFetchC4Model.mockResolvedValue({ model: { elements: [{ id: 'pkg_alpha/sub/leaf' }] } });
    const res = await callGet({ repo: 'my-repo' });
    expect(res._body.docs.map((d) => d.path)).toEqual(['spec/a.md', 'spec/parent.md']);
  });

  it('要素が 0 件なら空配列を返す', async () => {
    stubGitHub(files);
    mockCreateC4ModelStore.mockReturnValue({});
    mockFetchC4Model.mockResolvedValue({ model: { elements: [] } });
    const res = await callGet({ repo: 'my-repo' });
    expect(res._body.docs).toEqual([]);
  });

  it('payload が null なら要素 0 件として扱う', async () => {
    stubGitHub(files);
    mockCreateC4ModelStore.mockReturnValue({});
    mockFetchC4Model.mockResolvedValue(null);
    const res = await callGet({ repo: 'my-repo' });
    expect(res._body.docs).toEqual([]);
  });

  it('C4 モデル取得が投げたら絞り込まず全件返す', async () => {
    stubGitHub(files);
    mockCreateC4ModelStore.mockReturnValue({});
    mockFetchC4Model.mockRejectedValue(new Error('boom'));
    const res = await callGet({ repo: 'my-repo' });
    expect(res._body.docs).toHaveLength(3);
  });
});

describe('GET /api/docs-index — キャッシュ', () => {
  it('2 回目のリクエストは GitHub を再取得しない', async () => {
    const fetchMock = stubGitHub({ 'spec/a.md': ['---', 'c4Scope: [pkg_a]', '---'].join('\n') });
    await jest.isolateModulesAsync(async () => {
      const { GET } = (await import('../app/api/docs-index/route')) as {
        GET: (req: import('next/server').NextRequest) => Promise<unknown>;
      };
      await GET(makeRequest());
      const callsAfterFirst = fetchMock.mock.calls.length;
      await GET(makeRequest());
      expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    });
  });
});
