/**
 * /api/docs (GET) のユニットテスト
 *
 * S3 の ListObjectsV2Command をモックし、ドキュメント一覧取得のロジックを検証する。
 */

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  ListObjectsV2Command: jest.fn().mockImplementation((input: unknown) => input),
  GetObjectCommand: jest.fn(),
}));

jest.mock("next/server", () => {
  return {
    NextResponse: {
      json: jest.fn((body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
        body,
        status: init?.status ?? 200,
        headers: init?.headers ?? {},
      })),
    },
  };
});

// DOCS_BUCKET を制御するため、環境変数を設定してからモジュールをインポート
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, S3_DOCS_BUCKET: "test-bucket", S3_DOCS_PREFIX: "docs/" };
  mockSend.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("GET /api/docs", () => {
  async function callGET() {
    // 毎回再インポートして環境変数の変更を反映
    const mod = await import("../app/api/docs/route");
    return mod.GET();
  }

  it("S3 からドキュメント一覧を取得し、ディレクトリと .json を除外して返す", async () => {
    const lastModified = new Date("2026-01-01T00:00:00Z");
    mockSend.mockResolvedValue({
      Contents: [
        { Key: "docs/hello.md", LastModified: lastModified, Size: 1024 },
        { Key: "docs/world.md", LastModified: lastModified, Size: 2048 },
        { Key: "docs/image.png", LastModified: lastModified, Size: 512 },
        { Key: "docs/meta.json", LastModified: lastModified, Size: 128 },
        { Key: "docs/", LastModified: lastModified, Size: 0 },
      ],
    });

    const res = (await callGET()) as { body: { files: unknown[] }; status: number };
    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(3);
    expect(res.body.files).toEqual([
      { key: "docs/hello.md", name: "hello.md", lastModified: "2026-01-01T00:00:00.000Z", size: 1024 },
      { key: "docs/world.md", name: "world.md", lastModified: "2026-01-01T00:00:00.000Z", size: 2048 },
      { key: "docs/image.png", name: "image.png", lastModified: "2026-01-01T00:00:00.000Z", size: 512 },
    ]);
  });

  it("Contents が空の場合は空配列を返す", async () => {
    mockSend.mockResolvedValue({ Contents: [] });

    const res = (await callGET()) as { body: { files: unknown[] }; status: number };
    expect(res.status).toBe(200);
    expect(res.body.files).toEqual([]);
  });

  it("Contents が undefined の場合は空配列を返す", async () => {
    mockSend.mockResolvedValue({});

    const res = (await callGET()) as { body: { files: unknown[] }; status: number };
    expect(res.status).toBe(200);
    expect(res.body.files).toEqual([]);
  });

  it("S3 エラー時は 500 を返す", async () => {
    mockSend.mockRejectedValue(new Error("S3 connection failed"));

    const res = (await callGET()) as { body: { error: string }; status: number };
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to list documents");
  });

  it("DOCS_BUCKET が未設定の場合は 500 を返す", async () => {
    process.env.S3_DOCS_BUCKET = "";

    const res = (await callGET()) as { body: { error: string }; status: number };
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("S3_DOCS_BUCKET is not configured");
  });
});
