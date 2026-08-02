import { normalizeUrl } from "../webImport/urlValidation";

describe("normalizeUrl", () => {
  it("keeps valid http and https URLs", () => {
    expect(normalizeUrl("http://example.com/path")).toBe("http://example.com/path");
    expect(normalizeUrl(" https://example.com/a?b=1#c ")).toBe("https://example.com/a?b=1#c");
  });

  it("adds https:// when the scheme is omitted", () => {
    expect(normalizeUrl("example.com/article")).toBe("https://example.com/article");
  });

  it("rejects dangerous schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,<h1>x</h1>")).toBeNull();
    expect(normalizeUrl("file:///tmp/page.html")).toBeNull();
  });

  it("rejects empty and invalid input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("https://")).toBeNull();
    expect(normalizeUrl("http://exa mple.com")).toBeNull();
  });
});
