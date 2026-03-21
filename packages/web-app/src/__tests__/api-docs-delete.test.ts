/**
 * /api/docs/delete (DELETE) のユニットテスト
 *
 * S3 DeleteObjectCommand と Basic 認証をモックし、
 * 削除処理・認証・バリデーションを検証する。
 */

const mockSend = jest.fn();
const mockCheckBasicAuth = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
  GetObjectCommand: jest.fn(),
}));

jest.mock("../lib/s3Client", () => ({
  s3Client: { send: mockSend },
  DOCS_BUCKET: "test-bucket",
  DOCS_PREFIX: "docs/",
}));

jest.mock("../lib/basicAuth", () => ({
  checkBasicAuth: mockCheckBasicAuth,
}));

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
    _headers: Headers;
    constructor(url: string) {
      this.nextUrl = new URL(url);
      this._headers = new Headers();
    }
    get headers() {
      return this._headers;
    }
  }

  return {
    NextResponse: MockNextResponse,
    NextRequest: MockNextRequest,
  };
});

beforeEach(() => {
  mockSend.mockReset();
  mockCheckBasicAuth.mockReset();
  // デフォルトでは認証成功（null を返す）
  mockCheckBasicAuth.mockReturnValue(null);
});

describe("DELETE /api/docs/delete", () => {
  function createRequest(params: Record<string, string> = {}) {
    const { NextRequest } = jest.requireMock("next/server");
    const url = new URL("http://localhost:3000/api/docs/delete");
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return new NextRequest(url.toString());
  }

  async function callDELETE(request: unknown) {
    const mod = await import("../app/api/docs/delete/route");
    return mod.DELETE(request as import("next/server").NextRequest);
  }

  it("正常に削除できる", async () => {
    mockSend.mockResolvedValue({});
    const req = createRequest({ key: "docs/hello.md" });

    const res = (await callDELETE(req)) as { body: string; status: number };
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ Bucket: "test-bucket", Key: "docs/hello.md" }),
    );
  });

  it("認証失敗時は認証エラーレスポンスを返す", async () => {
    const authErrorResponse = { body: "Unauthorized", status: 401 };
    mockCheckBasicAuth.mockReturnValue(authErrorResponse);
    const req = createRequest({ key: "docs/hello.md" });

    const res = await callDELETE(req);
    expect(res).toBe(authErrorResponse);
    // S3 は呼ばれない
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("key パラメータが未指定の場合は 400 を返す", async () => {
    const req = createRequest({});

    const res = (await callDELETE(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "key parameter is required" });
  });

  it("DOCS_PREFIX で始まらないキーは 400 を返す", async () => {
    const req = createRequest({ key: "other/hello.md" });

    const res = (await callDELETE(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid key" });
  });

  it("任意の拡張子のファイルを削除できる", async () => {
    mockSend.mockResolvedValue({});
    const req = createRequest({ key: "docs/hello.txt" });

    const res = (await callDELETE(req)) as { body: string; status: number };
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
  });

  it("パストラバーサルを含むキーは 400 を返す", async () => {
    const req = createRequest({ key: "docs/../secret.md" });

    const res = (await callDELETE(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid key" });
  });

  it("S3 エラー時は 500 を返す", async () => {
    mockSend.mockRejectedValue(new Error("S3 delete failed"));
    const req = createRequest({ key: "docs/hello.md" });

    const res = (await callDELETE(req)) as { body: string; status: number };
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Failed to delete document" });
  });
});
