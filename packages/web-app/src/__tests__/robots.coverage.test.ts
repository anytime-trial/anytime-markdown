import robots from "../app/robots";

describe("robots", () => {
  it("returns robots.txt config", () => {
    const result = robots();
    expect(result.rules).toBeDefined();
    expect(result.sitemap).toContain("sitemap.xml");
  });

  it("allows root, markdown, and privacy paths", () => {
    const result = robots();
    const rules = result.rules as { allow: string[]; disallow: string[] };
    expect(rules.allow).toContain("/");
    expect(rules.allow).toContain("/markdown");
    expect(rules.allow).toContain("/privacy");
    expect(rules.disallow).toContain("/api/");
  });
});
