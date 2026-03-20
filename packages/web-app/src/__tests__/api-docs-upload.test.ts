/**
 * /api/docs/upload (POST) のユニットテスト
 *
 * S3 PutObjectCommand と Basic 認証をモックし、
 * アップロード処理・認証・バリデーションを検証する。
 */

const mockSend = jest.fn();
const mockCheckBasicAuth = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
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
    _formData: unknown;
    constructor(url: string, options?: { formData?: unknown }) {
      this.nextUrl = new URL(url);
      this._headers = new Headers();
      this._formData = options?.formData ?? { get: () => null };
    }
    get headers() {
      return this._headers;
    }
    async formData() {
      return this._formData;
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
});

/** テスト用の File-like オブジェクトを作成する */
function createFile(
  name: string,
  content: string,
  size?: number,
): { name: string; size: number; text: () => Promise<string>; endsWith?: never } {
  return {
    name,
    size: size ?? Buffer.byteLength(content, "utf-8"),
    text: () => Promise.resolve(content),
  };
}

function createRequest(file?: ReturnType<typeof createFile> | null) {
  const { NextRequest } = jest.requireMock("next/server");
  const fakeFormData = {
    get: (key: string) => {
      if (key === "file" && file) return file;
      return null;
    },
  };
  return new NextRequest("http://localhost:3000/api/docs/upload", { formData: fakeFormData });
}

async function callPOST(request: unknown) {
  const mod = await import("../app/api/docs/upload/route");
  return mod.POST(request as import("next/server").NextRequest);
}

describe("POST /api/docs/upload", () => {
  it("正常にアップロードできる", async () => {
    mockSend.mockResolvedValue({});
    const file = createFile("hello.md", "# Hello");
    const req = createRequest(file);

    const res = (await callPOST(req)) as { body: string; status: number };
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ key: "docs/hello.md", name: "hello.md" });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "test-bucket",
        Key: "docs/hello.md",
        ContentType: "text/markdown; charset=utf-8",
      }),
    );
  });

  it("認証失敗時は認証エラーレスポンスを返す", async () => {
    const authErrorResponse = { body: "Unauthorized", status: 401 };
    mockCheckBasicAuth.mockReturnValue(authErrorResponse);
    const file = createFile("hello.md", "# Hello");
    const req = createRequest(file);

    const res = await callPOST(req);
    expect(res).toBe(authErrorResponse);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("ファイルサイズが 5MB を超える場合は 400 を返す", async () => {
    const file = createFile("big.md", "x", 6 * 1024 * 1024);
    const req = createRequest(file);

    const res = (await callPOST(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "File size exceeds 5MB limit" });
  });

  it("拡張子が .md 以外の場合は 400 を返す", async () => {
    const file = createFile("hello.txt", "# Hello");
    const req = createRequest(file);

    const res = (await callPOST(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Only .md files are allowed" });
  });

  it("ファイル名に不正な文字が含まれる場合は 400 を返す", async () => {
    const file = createFile("he;llo.md", "# Hello");
    const req = createRequest(file);

    const res = (await callPOST(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid file name" });
  });

  it("ファイルが未送信の場合は 400 を返す", async () => {
    const req = createRequest(null);

    const res = (await callPOST(req)) as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "No file provided" });
  });
});
