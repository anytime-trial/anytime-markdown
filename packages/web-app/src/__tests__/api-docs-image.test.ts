/**
 * /api/docs/image (GET) のユニットテスト
 *
 * S3 GetObjectCommand をモックし、画像取得・バリデーションを検証する。
 */

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
}));

jest.mock("../lib/s3Client", () => ({
  s3Client: { send: mockSend },
  DOCS_BUCKET: "test-bucket",
  DOCS_PREFIX: "docs/",
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
    constructor(url: string) {
      this.nextUrl = new URL(url);
    }
  }

  return {
    NextResponse: MockNextResponse,
    NextRequest: MockNextRequest,
  };
});

beforeEach(() => {
  mockSend.mockReset();
});

function createRequest(params?: Record<string, string>) {
  const { NextRequest } = jest.requireMock("next/server");
  const url = new URL("http://localhost:3000/api/docs/image");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url.toString());
}

async function callGET(request: unknown) {
  const mod = await import("../app/api/docs/image/route");
  return mod.GET(request as import("next/server").NextRequest);
}

describe("GET /api/docs/image", () => {
  it("正常に画像を取得できる", async () => {
    const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    mockSend.mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(imageBytes) },
    });

    const req = createRequest({ key: "docs/folder/image.png" });
    const res = (await callGET(req)) as unknown as { body: unknown; status: number; headers: Record<string, string> };
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("image/png");
    expect(res.headers["Cache-Control"]).toContain("max-age=86400");
  });

  it("key パラメータが未指定の場合は 400 を返す", async () => {
    const req = createRequest();
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "key parameter is required" });
  });

  it("key が docs/ で始まらない場合は 400 を返す", async () => {
    const req = createRequest({ key: "other/image.png" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid key" });
  });

  it("パストラバーサルを含む key は 400 を返す", async () => {
    const req = createRequest({ key: "docs/../etc/passwd.png" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Invalid key" });
  });

  it("許可されていない拡張子の場合は 400 を返す", async () => {
    const req = createRequest({ key: "docs/file.pdf" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "Unsupported image format" });
  });

  it("S3 から Body が空の場合は 404 を返す", async () => {
    mockSend.mockResolvedValue({ Body: { transformToByteArray: () => Promise.resolve(undefined) } });

    const req = createRequest({ key: "docs/missing.png" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Image not found" });
  });

  it("S3 NoSuchKey エラーの場合は 404 を返す", async () => {
    const err = new Error("NoSuchKey");
    err.name = "NoSuchKey";
    mockSend.mockRejectedValue(err);

    const req = createRequest({ key: "docs/notfound.png" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Image not found" });
  });

  it("S3 の予期しないエラーの場合は 500 を返す", async () => {
    mockSend.mockRejectedValue(new Error("S3 connection failed"));

    const req = createRequest({ key: "docs/image.jpg" });
    const res = (await callGET(req)) as unknown as { body: string; status: number };
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Failed to load image" });
  });

  it.each([
    ["docs/img.jpg", "image/jpeg"],
    ["docs/img.jpeg", "image/jpeg"],
    ["docs/img.gif", "image/gif"],
    ["docs/img.webp", "image/webp"],
    ["docs/img.svg", "image/svg+xml"],
  ])("拡張子 %s に正しい Content-Type %s を返す", async (key, expectedType) => {
    const imageBytes = new Uint8Array([0x00]);
    mockSend.mockResolvedValue({
      Body: { transformToByteArray: () => Promise.resolve(imageBytes) },
    });

    const req = createRequest({ key });
    const res = (await callGET(req)) as unknown as { headers: Record<string, string> };
    expect(res.headers["Content-Type"]).toBe(expectedType);
  });
});

export {};
