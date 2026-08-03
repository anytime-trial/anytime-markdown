import robots from "../app/robots";

describe("robots", () => {
  it("returns robots.txt config", () => {
    const result = robots();
    expect(result.rules).toBeDefined();
    expect(result.sitemap).toContain("sitemap.xml");
  });

  it("allows public routes and blocks the API", () => {
    const result = robots();
    const rules = result.rules as { allow: string[]; disallow: string[] };
    expect(rules.allow).toContain("/");
    expect(rules.allow).toContain("/markdown");
    expect(rules.allow).toContain("/report");
    expect(rules.allow).toContain("/privacy");
    expect(rules.disallow).toContain("/api/");
  });

  it("does not allow routes that have no page", () => {
    const result = robots();
    const rules = result.rules as { allow: string[]; disallow: string[] };
    // app/press/ はコンポーネント置き場で、ルートとしては存在しない（/ が PressBody を描画する）
    expect(rules.allow).not.toContain("/press");
    // app/docs/ 直下に page.tsx は無い（docs/view と docs/edit のみ）
    expect(rules.allow).not.toContain("/docs");
  });

  it("keeps noindex routes crawlable", () => {
    const result = robots();
    const rules = result.rules as { allow: string[]; disallow: string[] };
    // robots.txt で遮断すると noindex メタタグ自体が読まれず、URL だけが検索結果に残る。
    // 内部ツール系は crawl を許可したうえで metadata の robots:noindex で落とす。
    for (const path of ['/trail', '/graph', '/database', '/sheet', '/cooccurrence', '/tickets', '/docs/edit']) {
      expect(rules.disallow).not.toContain(path);
    }
  });
});
