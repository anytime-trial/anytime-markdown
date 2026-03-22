// s3Client.ts のテスト

// AWS SDK モック
jest.mock("@aws-sdk/client-s3", () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn(() => ({ send: mockSend })),
    GetObjectCommand: jest.fn(),
    __mockSend: mockSend,
  };
});

// 環境変数設定
const originalEnv = process.env;
beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv };
});
afterAll(() => {
  process.env = originalEnv;
});

describe("s3Client", () => {
  test("S3Client がデフォルトリージョンで作成される", () => {
    delete process.env.ANYTIME_AWS_REGION;
    delete process.env.ANYTIME_AWS_ACCESS_KEY_ID;
    delete process.env.ANYTIME_AWS_SECRET_ACCESS_KEY;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3Client } = require("@aws-sdk/client-s3");
    jest.isolateModules(() => {
      require("../lib/s3Client");
    });
    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({ region: "ap-northeast-1" }));
  });

  test("環境変数で認証情報を設定する", () => {
    process.env.ANYTIME_AWS_ACCESS_KEY_ID = "test-key";
    process.env.ANYTIME_AWS_SECRET_ACCESS_KEY = "test-secret";
    process.env.ANYTIME_AWS_REGION = "us-east-1";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { S3Client } = require("@aws-sdk/client-s3");
    jest.isolateModules(() => {
      require("../lib/s3Client");
    });
    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
      region: "us-east-1",
      credentials: { accessKeyId: "test-key", secretAccessKey: "test-secret" },
    }));
  });
});

describe("fetchFromCdn", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("CLOUDFRONT_URL が未設定の場合 null を返す", async () => {
    process.env.CLOUDFRONT_DOCS_URL = "";
    jest.isolateModules(async () => {
      const { fetchFromCdn } = require("../lib/s3Client");
      const result = await fetchFromCdn("test-key");
      expect(result).toBeNull();
    });
  });

  test("パストラバーサルを含むキーを拒否する", async () => {
    process.env.CLOUDFRONT_DOCS_URL = "https://cdn.example.com";
    jest.isolateModules(async () => {
      const { fetchFromCdn } = require("../lib/s3Client");
      expect(await fetchFromCdn("../etc/passwd")).toBeNull();
      expect(await fetchFromCdn("key\0null")).toBeNull();
      expect(await fetchFromCdn("http://evil.com")).toBeNull();
    });
  });

  test("正常なキーでCDNからコンテンツを取得する", async () => {
    process.env.CLOUDFRONT_DOCS_URL = "https://cdn.example.com";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("# Hello"),
    });

    jest.isolateModules(async () => {
      const { fetchFromCdn } = require("../lib/s3Client");
      const result = await fetchFromCdn("docs/test.md");
      expect(result).toBe("# Hello");
    });
  });

  test("CDNが404を返す場合 null を返す", async () => {
    process.env.CLOUDFRONT_DOCS_URL = "https://cdn.example.com";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    jest.isolateModules(async () => {
      const { fetchFromCdn } = require("../lib/s3Client");
      const result = await fetchFromCdn("docs/missing.md");
      expect(result).toBeNull();
    });
  });
});

describe("fetchLayoutData", () => {
  test("DOCS_BUCKET と CLOUDFRONT_URL が未設定の場合空のカテゴリを返す", async () => {
    process.env.S3_DOCS_BUCKET = "";
    process.env.CLOUDFRONT_DOCS_URL = "";
    jest.isolateModules(async () => {
      const { fetchLayoutData } = require("../lib/s3Client");
      const result = await fetchLayoutData();
      expect(result).toEqual({ categories: [] });
    });
  });

  test("S3 から layout データを取得してソートする", async () => {
    process.env.S3_DOCS_BUCKET = "test-bucket";
    process.env.CLOUDFRONT_DOCS_URL = "";

    const mockBody = JSON.stringify({
      categories: [
        { id: "2", title: "B", description: "", items: [], order: 1 },
        { id: "1", title: "A", description: "", items: [], order: 0 },
      ],
      siteDescription: "Test",
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const awsMock = require("@aws-sdk/client-s3");
    awsMock.__mockSend.mockResolvedValue({
      Body: { transformToString: () => Promise.resolve(mockBody) },
    });

    jest.isolateModules(async () => {
      const { fetchLayoutData } = require("../lib/s3Client");
      const result = await fetchLayoutData();
      expect(result.categories[0].id).toBe("1");
      expect(result.categories[1].id).toBe("2");
      expect(result.siteDescription).toBe("Test");
    });
  });

  test("NoSuchKey エラーの場合空のカテゴリを返す", async () => {
    process.env.S3_DOCS_BUCKET = "test-bucket";
    process.env.CLOUDFRONT_DOCS_URL = "";

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const awsMock = require("@aws-sdk/client-s3");
    const error = new Error("NoSuchKey");
    error.name = "NoSuchKey";
    awsMock.__mockSend.mockRejectedValue(error);

    jest.isolateModules(async () => {
      const { fetchLayoutData } = require("../lib/s3Client");
      const result = await fetchLayoutData();
      expect(result).toEqual({ categories: [] });
    });
  });
});
