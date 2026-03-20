/**
 * /api/docs/content (GET) のユニットテスト
 *
 * S3 GetObjectCommand と fetchFromCdn をモックし、
 * ドキュメント取得・バリデーション・エラーハンドリングを検証する。
 */

const mockSend = jest.fn();
const mockFetchFromCdn = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

jest.mock("../lib/s3Client", () => ({
  s3Client: { send: mockSend },
  DOCS_BUCKET: "test-bucket",
  DOCS_PREFIX: "docs/",
  fetchFromCdn: mockFetchFromCdn,
}));

// NextResponse のモック — new NextResponse(body, init) と NextResponse.json() の両方に対応
jest.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Record<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = init?.headers ?? {};
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new MockNextResponse(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
    }
  }

  class MockNextRequest {
    nextUrl: URL;
    constructor(url: string) {
      this.nextUrl = new URL(url);
    }
  }

  return {
    NextResponse: MockNextResponse,
    NextRequest: MockNextRequest,
  };
});

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, S3_DOCS_BUCKET: "test-bucket", S3_DOCS_PREFIX: "docs/" };
  mockSend.mockReset();
  mockFetchFromCdn.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

// route.ts は s3Client モジュールパスが相対なので jest.mock のパスも相対で合わせる必要がある。
// ただし jest.mock は巻き上げられるため、動的インポートでテストする。
// s3Client のモックは上部の jest.mock で設定済み。

describe("GET /api/docs/content", () => {
  function createRequest(params: Record<string, string> = {}) {
    const { NextRequest } = jest.requireMock("next/server");
    const url = new URL("http://localhost:3000/api/docs/content");
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return new NextRequest(url.toString());
  }

  async function callGET(request: unknown) {
    // jest.mock で s3Client モジュールをモック済みなので直接インポート
    const mod = await import("../app/api/docs/content/route");
    return mod.GET(request as import("next/server").NextRequest);
  }

  it("CDN 経由でコンテンツを取得する", async () => {
    mockFetchFromCdn.mockResolvedValue("# Hello World");
    const req = createRequest({ key: "docs/hello.md" });

    const res = (await callGET(req)) as { body: unknown; status: number };
    expect(res.status).toBe(200);
    expect(res.body).toBe("# Hello World");
    expect(mockFetchFromCdn).toHaveBeenCalledWith("docs/hello.md");
  });

  it("CDN が null を返した場合、S3 にフォールバックする", async () => {
    mockFetchFromCdn.mockResolvedValue(null);
    mockSend.mockResolvedValue({
      Body: { transformToString: jest.fn().mockResolvedValue("# Fallback Content") },
    });
    const req = createRequest({ key: "docs/hello.md" });

    const res = (await callGET(req)) as { body: unknown; status: number };
    expect(res.status).toBe(200);
    expect(res.body).toBe("# Fallback Content");
  });

  it("S3 から空のドキュメントの場合は 404 を返す", async () => {
    mockFetchFromCdn.mockResolvedValue(null);
    mockSend.mockResolvedValue({
      Body: { transformToString: jest.fn().mockResolvedValue("") },
    });
    const req = createRequest({ key: "docs/hello.md" });

    const res = (await callGET(req)) as { body: string; status: number };
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Empty document" });
  });

  it("key パラメータが未指定の場合は 400 を返す", async () => {
    const req = createRequest({});

    const res = (await callGET(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "key parameter is required" });
  });

  it("DOCS_PREFIX で始まらないキーは 400 を返す", async () => {
    const req = createRequest({ key: "other/hello.md" });

    const res = (await callGET(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid key" });
  });

  it(".md で終わらないキーは 400 を返す", async () => {
    const req = createRequest({ key: "docs/hello.txt" });

    const res = (await callGET(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid key" });
  });

  it("パストラバーサルを含むキーは 400 を返す", async () => {
    const req = createRequest({ key: "docs/../etc/passwd.md" });

    const res = (await callGET(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid key" });
  });

  it("NoSuchKey エラーの場合は 404 を返す", async () => {
    mockFetchFromCdn.mockResolvedValue(null);
    const err = new Error("NoSuchKey");
    err.name = "NoSuchKey";
    mockSend.mockRejectedValue(err);
    const req = createRequest({ key: "docs/notfound.md" });

    const res = (await callGET(req)) as { body: string; status: number };
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Document not found" });
  });

  it("S3 の一般エラーの場合は 500 を返す", async () => {
    mockFetchFromCdn.mockResolvedValue(null);
    mockSend.mockRejectedValue(new Error("S3 error"));
    const req = createRequest({ key: "docs/hello.md" });

    const res = (await callGET(req)) as { body: string; status: number };
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Failed to load document" });
  });
});
