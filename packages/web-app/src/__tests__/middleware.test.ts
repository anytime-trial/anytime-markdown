/**
 * proxy.ts のユニットテスト
 *
 * jsdom には Web API の Request/Response がないため、
 * next/server をモックして proxy のロジックを検証する。
 */

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_NONCE = Buffer.from(TEST_UUID).toString("base64");

// NextResponse.next() が返すレスポンスのモック
let capturedRequestHeaders: Headers;
const mockResponseHeaders = new Headers();

jest.mock("next/server", () => {
  return {
    NextResponse: {
      next: jest.fn(({ request }: { request: { headers: Headers } }) => {
        capturedRequestHeaders = request.headers;
        return {
          headers: mockResponseHeaders,
        };
      }),
    },
  };
});

beforeEach(() => {
  mockResponseHeaders.forEach((_, key) => mockResponseHeaders.delete(key));
  jest.spyOn(crypto, "randomUUID").mockReturnValue(
    TEST_UUID as `${string}-${string}-${string}-${string}-${string}`
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createMockRequest(pathname = "/"): { headers: Headers; nextUrl: { pathname: string }; url: string } {
  return { headers: new Headers(), nextUrl: { pathname }, url: `http://localhost:3000${pathname}` };
}

describe("proxy", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { proxy } = require("../proxy");

  describe("nonce handling", () => {
    it("sets x-nonce on request headers", () => {
      proxy(createMockRequest());
      expect(capturedRequestHeaders.get("x-nonce")).toBe(TEST_NONCE);
    });

    it("includes nonce in CSP script-src", () => {
      proxy(createMockRequest());
      const csp = capturedRequestHeaders.get("Content-Security-Policy")!;
      expect(csp).toContain(`'nonce-${TEST_NONCE}'`);
    });
  });

  describe("CSP header", () => {
    it("sets CSP on response headers", () => {
      proxy(createMockRequest());
      expect(mockResponseHeaders.get("Content-Security-Policy")).toBeTruthy();
    });

    it("request and response CSP headers are identical", () => {
      proxy(createMockRequest());
      expect(capturedRequestHeaders.get("Content-Security-Policy")).toBe(
        mockResponseHeaders.get("Content-Security-Policy")
      );
    });

    it("contains all required directives", () => {
      proxy(createMockRequest());
      const csp = mockResponseHeaders.get("Content-Security-Policy")!;

      const requiredDirectives = [
        "default-src",
        "script-src",
        "style-src",
        "img-src",
        "font-src",
        "connect-src",
        "worker-src",
        "frame-src",
        "object-src",
        "base-uri",
        "form-action",
      ];

      for (const directive of requiredDirectives) {
        expect(csp).toContain(directive);
      }
    });

    it("includes self in default-src", () => {
      proxy(createMockRequest());
      const csp = mockResponseHeaders.get("Content-Security-Policy")!;
      expect(csp).toContain("default-src 'self'");
    });

    it("restricts frames to embed providers and blocks objects", () => {
      proxy(createMockRequest());
      const csp = mockResponseHeaders.get("Content-Security-Policy")!;
      expect(csp).toContain("frame-src 'self'");
      expect(csp).toContain("https://www.youtube.com");
      expect(csp).toContain("https://www.figma.com");
      expect(csp).toContain("https://open.spotify.com");
      expect(csp).toContain("https://platform.twitter.com");
      expect(csp).toContain("https://viewer.diagrams.net");
      expect(csp).toContain("object-src 'none'");
    });
  });

  describe("environment-specific CSP", () => {
    const env = process.env;

    beforeEach(() => {
      jest.replaceProperty(process, "env", { ...env });
    });

    afterEach(() => {
      jest.replaceProperty(process, "env", env);
    });

    it("excludes unsafe-eval in production", () => {
      (process.env as Record<string, string>).NODE_ENV = "production";
      proxy(createMockRequest());
      const csp = mockResponseHeaders.get("Content-Security-Policy")!;
      expect(csp).not.toContain("unsafe-eval");
    });

    it("includes unsafe-eval in development", () => {
      (process.env as Record<string, string>).NODE_ENV = "development";
      proxy(createMockRequest());
      const csp = mockResponseHeaders.get("Content-Security-Policy")!;
      expect(csp).toContain("'unsafe-eval'");
    });
  });
});

describe("config", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require("../proxy");

  it("has matcher that excludes api and static routes", () => {
    expect(config.matcher).toBeDefined();
    expect(config.matcher.length).toBeGreaterThan(0);
    const source = config.matcher[0].source;
    expect(source).toContain("api");
    expect(source).toContain("_next/static");
    expect(source).toContain("_next/image");
    expect(source).toContain("favicon");
  });

  it("excludes prefetch requests", () => {
    const missing = config.matcher[0].missing;
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "header", key: "next-router-prefetch" }),
        expect.objectContaining({ type: "header", key: "purpose", value: "prefetch" }),
      ])
    );
  });
});
