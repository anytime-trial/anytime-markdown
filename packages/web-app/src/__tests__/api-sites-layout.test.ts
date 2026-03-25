/**
 * /api/sites/layout (GET/PUT) のユニットテスト
 *
 * S3 と Basic 認証をモックし、レイアウトデータの取得・保存を検証する。
 */

const mockSend = jest.fn();
const mockCheckBasicAuth = jest.fn();
const mockFetchLayoutData = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
  GetObjectCommand: jest.fn(),
}));

jest.mock("../lib/s3Client", () => ({
  s3Client: { send: mockSend },
  DOCS_BUCKET: "test-bucket",
  DOCS_PREFIX: "docs/",
  fetchLayoutData: mockFetchLayoutData,
}));

jest.mock("../lib/basicAuth", () => ({
  checkBasicAuth: mockCheckBasicAuth,
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
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
    _body: unknown;
    constructor(url: string, options?: { body?: unknown }) {
      this.nextUrl = new URL(url);
      this._body = options?.body;
    }
    async json() {
      return this._body;
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
  mockCheckBasicAuth.mockReturnValue(null);
  mockFetchLayoutData.mockReset();
});

async function callGET() {
  const mod = await import("../app/api/sites/layout/route");
  return mod.GET();
}

function createPutRequest(body: unknown) {
  const { NextRequest } = jest.requireMock("next/server");
  return new NextRequest("http://localhost:3000/api/sites/layout", { body });
}

async function callPUT(request: unknown) {
  const mod = await import("../app/api/sites/layout/route");
  return mod.PUT(request as import("next/server").NextRequest);
}

describe("GET /api/sites/layout", () => {
  it("レイアウトデータを正常に返す", async () => {
    const layoutData = { categories: [{ id: "cat1", title: "Cat", description: "Desc", items: [], order: 0 }] };
    mockFetchLayoutData.mockResolvedValue(layoutData);

    const res = (await callGET()) as unknown as { body: string; status: number; headers: Record<string, string> };
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual(layoutData);
    expect(res.headers["Cache-Control"]).toContain("max-age=60");
  });

  it("fetchLayoutData がエラーの場合は 500 を返す", async () => {
    mockFetchLayoutData.mockRejectedValue(new Error("S3 error"));

    const res = (await callGET()) as unknown as { body: string; status: number };
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Failed to load layout" });
  });
});

describe("PUT /api/sites/layout", () => {
  const validLayout = {
    categories: [
      { id: "cat1", title: "Category 1", description: "Description", items: [], order: 0 },
    ],
  };

  it("正常にレイアウトを保存できる", async () => {
    mockSend.mockResolvedValue({});
    const req = createPutRequest(validLayout);

    const res = (await callPUT(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ saved: true });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "test-bucket",
        ContentType: "application/json; charset=utf-8",
      }),
    );
  });

  it("認証失敗時は認証エラーレスポンスを返す", async () => {
    const authErrorResponse = { body: "Unauthorized", status: 401 };
    mockCheckBasicAuth.mockReturnValue(authErrorResponse);
    const req = createPutRequest(validLayout);

    const res = await callPUT(req);
    expect(res).toBe(authErrorResponse);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("不正なレイアウトデータの場合は 400 を返す", async () => {
    const req = createPutRequest({ categories: "invalid" });

    const res = (await callPUT(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Invalid layout data");
    expect(body.details).toBeDefined();
  });

  it("S3 保存エラーの場合は 500 を返す", async () => {
    mockSend.mockRejectedValue(new Error("S3 write failed"));
    const req = createPutRequest(validLayout);

    const res = (await callPUT(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Failed to save layout" });
  });
});

export {};
