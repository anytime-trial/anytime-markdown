/**
 * Additional coverage for /api/docs/upload - edge cases
 */

const mockSend = jest.fn();
const mockCheckBasicAuth = jest.fn().mockReturnValue(null);

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => input),
  GetObjectCommand: jest.fn(),
}));

jest.mock("../lib/basicAuth", () => ({
  checkBasicAuth: (...args: any[]) => mockCheckBasicAuth(...args),
}));

jest.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number }) {
      return new MockNextResponse(JSON.stringify(body), init);
    }
  }
  class MockNextRequest {
    nextUrl: URL;
    _formData: any;
    _headers: Headers;
    constructor(url: string, options?: { formData?: any }) {
      this.nextUrl = new URL(url);
      this._headers = new Headers();
      this._formData = options?.formData ?? { get: () => null };
    }
    get headers() { return this._headers; }
    async formData() { return this._formData; }
  }
  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
});

describe("api/docs/upload - edge cases", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("returns 500 when DOCS_BUCKET is empty", async () => {
    jest.mock("../lib/s3Client", () => ({
      s3Client: { send: mockSend },
      DOCS_BUCKET: "",
      DOCS_PREFIX: "docs/",
    }));

    const { POST } = require("../app/api/docs/upload/route");
    const { NextRequest } = require("next/server");
    const req = new NextRequest("http://localhost/api/docs/upload");
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 400 for filename with backslash", async () => {
    jest.mock("../lib/s3Client", () => ({
      s3Client: { send: mockSend },
      DOCS_BUCKET: "test-bucket",
      DOCS_PREFIX: "docs/",
    }));

    const { POST } = require("../app/api/docs/upload/route");
    const { NextRequest } = require("next/server");

    const file = new File(["content"], "test\\bad.md", { type: "text/markdown" });
    const formData = { get: (key: string) => key === "file" ? file : null };
    const req = new NextRequest("http://localhost/api/docs/upload", { formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for folder with invalid characters", async () => {
    jest.mock("../lib/s3Client", () => ({
      s3Client: { send: mockSend },
      DOCS_BUCKET: "test-bucket",
      DOCS_PREFIX: "docs/",
    }));

    const { POST } = require("../app/api/docs/upload/route");
    const { NextRequest } = require("next/server");

    const file = new File(["content"], "test.md", { type: "text/markdown" });
    const formData = { get: (key: string) => {
      if (key === "file") return file;
      if (key === "folder") return "bad..folder";
      return null;
    }};
    const req = new NextRequest("http://localhost/api/docs/upload", { formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("handles S3 error during upload", async () => {
    jest.mock("../lib/s3Client", () => ({
      s3Client: { send: mockSend },
      DOCS_BUCKET: "test-bucket",
      DOCS_PREFIX: "docs/",
    }));

    mockSend.mockRejectedValueOnce(new Error("S3 error"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = require("../app/api/docs/upload/route");
    const { NextRequest } = require("next/server");

    const file = new File(["content"], "test.md", { type: "text/markdown" });
    const formData = { get: (key: string) => key === "file" ? file : null };
    const req = new NextRequest("http://localhost/api/docs/upload", { formData });
    const res = await POST(req);
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});
