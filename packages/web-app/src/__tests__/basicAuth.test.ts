/**
 * checkBasicAuth のユニットテスト
 *
 * next/server の NextRequest/NextResponse をモックして検証する。
 */

// NextRequest/NextResponse モック
class MockNextRequest {
  headers: Headers;
  constructor(url: string, init?: { headers?: Record<string, string> }) {
    this.headers = new Headers(init?.headers);
  }
}

class MockNextResponse {
  body: string;
  status: number;
  headers: Headers;
  constructor(body: string, init: { status: number; headers?: Record<string, string> }) {
    this.body = body;
    this.status = init.status;
    this.headers = new Headers(init.headers);
  }
  static json(data: unknown, init: { status: number }) {
    return new MockNextResponse(JSON.stringify(data), init);
  }
}

jest.mock("next/server", () => ({
  NextRequest: MockNextRequest,
  NextResponse: MockNextResponse,
}));

function makeBasicHeader(user: string, password: string): string {
  return "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
}

// 環境変数を動的に設定するため、テストごとに re-import
function importFresh() {
  jest.resetModules();
  // next/server モックを再登録
  jest.mock("next/server", () => ({
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  }));
  return require("../lib/basicAuth") as typeof import("../lib/basicAuth");
}

describe("checkBasicAuth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("有効な認証情報 → null を返す", () => {
    process.env.CMS_BASIC_USER = "admin";
    process.env.CMS_BASIC_PASSWORD = "secret";
    const { checkBasicAuth } = importFresh();

    const req = new MockNextRequest("http://localhost/api/test", {
      headers: { Authorization: makeBasicHeader("admin", "secret") },
    });

    const result = checkBasicAuth(req as any);
    expect(result).toBeNull();
  });

  test("無効な認証情報 → 401 を返す", () => {
    process.env.CMS_BASIC_USER = "admin";
    process.env.CMS_BASIC_PASSWORD = "secret";
    const { checkBasicAuth } = importFresh();

    const req = new MockNextRequest("http://localhost/api/test", {
      headers: { Authorization: makeBasicHeader("admin", "wrong") },
    });

    const result = checkBasicAuth(req as any) as any;
    expect(result).not.toBeNull();
    expect(result.status).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: "Invalid credentials" });
  });

  test("Authorization ヘッダーなし → 401 を返す", () => {
    process.env.CMS_BASIC_USER = "admin";
    process.env.CMS_BASIC_PASSWORD = "secret";
    const { checkBasicAuth } = importFresh();

    const req = new MockNextRequest("http://localhost/api/test");

    const result = checkBasicAuth(req as any) as any;
    expect(result).not.toBeNull();
    expect(result.status).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: "Authentication required" });
  });

  test("Bearer トークン (Basic でない) → 401 を返す", () => {
    process.env.CMS_BASIC_USER = "admin";
    process.env.CMS_BASIC_PASSWORD = "secret";
    const { checkBasicAuth } = importFresh();

    const req = new MockNextRequest("http://localhost/api/test", {
      headers: { Authorization: "Bearer some-token" },
    });

    const result = checkBasicAuth(req as any) as any;
    expect(result).not.toBeNull();
    expect(result.status).toBe(401);
  });

  test("環境変数が空 → 500 を返す", () => {
    delete process.env.CMS_BASIC_USER;
    delete process.env.CMS_BASIC_PASSWORD;
    const { checkBasicAuth } = importFresh();

    const req = new MockNextRequest("http://localhost/api/test", {
      headers: { Authorization: makeBasicHeader("admin", "secret") },
    });

    const result = checkBasicAuth(req as any) as any;
    expect(result).not.toBeNull();
    expect(result.status).toBe(500);
  });
});
