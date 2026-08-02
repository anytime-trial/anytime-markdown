import { isMarkdownHref } from "../utils/isMarkdownHref";

describe("isMarkdownHref", () => {
  it("detects markdown file extensions", () => {
    expect(isMarkdownHref("x.md")).toBe(true);
    expect(isMarkdownHref("x.markdown")).toBe(true);
    expect(isMarkdownHref("dir/X.MD")).toBe(true);
  });

  it("ignores query strings and anchors when checking the path", () => {
    expect(isMarkdownHref("x.md#sec")).toBe(true);
    expect(isMarkdownHref("x.markdown?mode=edit")).toBe(true);
    expect(isMarkdownHref("#sec")).toBe(false);
    expect(isMarkdownHref("?mode=edit")).toBe(false);
  });

  it("rejects external or empty hrefs", () => {
    expect(isMarkdownHref("https://e.com/x.md")).toBe(false);
    expect(isMarkdownHref("http://e.com/x.md")).toBe(false);
    expect(isMarkdownHref("mailto:a@example.com")).toBe(false);
    expect(isMarkdownHref("")).toBe(false);
    expect(isMarkdownHref("   ")).toBe(false);
  });
});
