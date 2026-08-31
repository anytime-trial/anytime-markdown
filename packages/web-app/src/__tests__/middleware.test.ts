/**
 * proxy.ts のユニットテスト
 *
 * jsdom には Web API の Request/Response がないため、
 * next/server をモックして proxy のロジックを検証する。
 */

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_NONCE = Buffer.from(TEST_UUID).toString("base64");

// ロケール解決は next-intl の middleware が返す応答へ CSP を載せる形になったため、
// NextResponse.next() ではなく「next-intl へ渡された Request のヘッダ」を捕捉する。
let capturedRequestHeaders: Headers;
const mockResponseHeaders = new Headers();
let capturedRedirectUrl: string | null = null;

jest.mock("next/server", () => {
  class MockNextRequest {
    headers: Headers;
    nextUrl: { pathname: string };
    url: string;
    constructor(input: { nextUrl: { pathname: string }; url: string }, init?: { headers?: Headers }) {
      this.headers = init?.headers ?? new Headers();
      this.nextUrl = input.nextUrl;
      this.url = input.url;
    }
  }

  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      redirect: jest.fn((url: URL) => {
        capturedRedirectUrl = url.toString();
        return { headers: mockResponseHeaders };
      }),
    },
  };
});

// next-intl の middleware 本体はロケール解決だけを行う。ここでは合成の配線
// （渡された Request のヘッダ・返した応答へ CSP が載ること）だけを検証する。
jest.mock("next-intl/middleware", () => ({
  __esModule: true,
  default: () =>
    jest.fn((request: { headers: Headers }) => {
      capturedRequestHeaders = request.headers;
      return { headers: mockResponseHeaders };
    }),
}));

beforeEach(() => {
  mockResponseHeaders.forEach((_, key) => mockResponseHeaders.delete(key));
  jest.spyOn(crypto, "randomUUID").mockReturnValue(
    TEST_UUID as `${string}-${string}-${string}-${string}-${string}`
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createMockRequest(
  pathname = "/",
  search = "",
): { headers: Headers; nextUrl: { pathname: string; search: string }; url: string } {
  return {
    headers: new Headers(),
    nextUrl: { pathname, search },
    url: `http://localhost:3000${pathname}${search}`,
  };
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

  describe("/docs/edit redirect", () => {
    const env = process.env;

    beforeEach(() => {
      capturedRedirectUrl = null;
      jest.replaceProperty(process, "env", { ...env });
      delete (process.env as Record<string, string>).NEXT_PUBLIC_ENABLE_DOCS_EDIT;
    });

    afterEach(() => {
      jest.replaceProperty(process, "env", env);
    });

    it("redirects to the viewer and keeps the query string", () => {
      proxy(createMockRequest("/docs/edit", "?key=docs%2Fguide.md"));
      // クエリを落とすと閲覧側で対象ドキュメントを失う
      expect(capturedRedirectUrl).toBe("http://localhost:3000/docs/view?key=docs%2Fguide.md");
    });

    it("keeps the locale prefix when redirecting", () => {
      proxy(createMockRequest("/en/docs/edit", "?key=a"));
      expect(capturedRedirectUrl).toBe("http://localhost:3000/en/docs/view?key=a");
    });

    it("does not redirect when the editor is enabled", () => {
      (process.env as Record<string, string>).NEXT_PUBLIC_ENABLE_DOCS_EDIT = "true";
      proxy(createMockRequest("/docs/edit"));
      expect(capturedRedirectUrl).toBeNull();
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
      // ランディングの街道マップ紹介欄が本番サイトを iframe で埋め込むため、
      // frame-src から外れると欄が空白のまま描画される（CSP 違反は画面に出ない）
      expect(csp).toContain("https://travel.anytime-trial.com");
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

    it("allows the web import proxy origin in connect-src when configured", () => {
      (process.env as Record<string, string>).NEXT_PUBLIC_WEB_IMPORT_PROXY_URL =
        "https://mcp-cms-remote.example.workers.dev/";
      proxy(createMockRequest());
      const csp = mockResponseHeaders.get("Content-Security-Policy")!;
      // connect-src に proxy のオリジン（パスなし）が含まれること
      expect(csp).toMatch(/connect-src[^;]*https:\/\/mcp-cms-remote\.example\.workers\.dev(\s|;|$)/);
    });

    it("omits the web import proxy from connect-src when unset", () => {
      delete (process.env as Record<string, string>).NEXT_PUBLIC_WEB_IMPORT_PROXY_URL;
      proxy(createMockRequest());
      const csp = mockResponseHeaders.get("Content-Security-Policy")!;
      expect(csp).not.toContain("workers.dev");
    });
  });
});

describe("config", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require("../proxy");

  // 文字列に部分一致するかではなく、実際のパスに対して matcher を評価する。
  // 「除外リストに名前が載っているか」を見るだけでは、public/ 配下のアセットが
  // ロケール配下へ書き換えられて 404 になる欠陥（実機で icon.svg が 404）を検知できない。
  const matches = (pathname: string): boolean =>
    new RegExp(`^${config.matcher[0].source}$`).test(pathname);

  it("has matcher that excludes api and Next.js internals", () => {
    expect(config.matcher).toBeDefined();
    expect(config.matcher.length).toBeGreaterThan(0);
    expect(matches("/api/ogp")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
    expect(matches("/opengraph-image")).toBe(false);
    expect(matches("/twitter-image")).toBe(false);
  });

  it("excludes public assets and root-level special files", () => {
    for (const path of [
      "/favicon.ico",
      "/icon.svg",
      "/manifest.json",
      "/robots.txt",
      "/sitemap.xml",
      "/sw.js",
      "/camel_face.png",
      "/images/camel_transparent.png",
      "/icons/icon-192.png",
      "/sql/sql-wasm.wasm",
    ]) {
      expect([path, matches(path)]).toEqual([path, false]);
    }
  });

  it("still matches content routes so locales are resolved", () => {
    for (const path of ["/", "/markdown", "/en/markdown", "/report/first-post", "/docs/view"]) {
      expect([path, matches(path)]).toEqual([path, true]);
    }
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
