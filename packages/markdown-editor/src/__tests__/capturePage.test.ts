import { isRawMarkdownPage, capturePageMarkdown } from "../webImport/capturePage";

describe("isRawMarkdownPage", () => {
  it("contentType text/plain かつ .md URL は raw md", () => {
    expect(isRawMarkdownPage("text/plain", "https://x.com/a/README.md")).toBe(true);
  });
  it("text/markdown は URL 不問で raw md", () => {
    expect(isRawMarkdownPage("text/markdown", "https://x.com/a")).toBe(true);
  });
  it("text/plain でも .md 以外の URL は記事扱い", () => {
    expect(isRawMarkdownPage("text/plain", "https://x.com/a.txt")).toBe(false);
  });
  it("text/html は記事扱い", () => {
    expect(isRawMarkdownPage("text/html", "https://x.com/a.md")).toBe(false);
  });
});

describe("capturePageMarkdown", () => {
  const now = new Date("2026-07-08T00:00:00.000Z");

  it("raw markdown ページは contentType 判定でそのまま body innerText を返す", () => {
    const doc = new DOMParser().parseFromString(
      "<html><head><title>README.md</title></head><body>【raw】\n# hello</body></html>",
      "text/html",
    );
    Object.defineProperty(doc, "contentType", { value: "text/plain", configurable: true });
    // jsdom は innerText（レイアウト依存）を実装しないため常に "" を返す（横断制約）。
    // 実ブラウザの content script 実行を模して明示的にスタブする。
    Object.defineProperty(doc.body, "innerText", {
      value: "【raw】\n# hello",
      configurable: true,
    });
    const result = capturePageMarkdown(doc, "https://x.com/a/README.md", now);
    expect(result.markdown).toContain("# hello");
    expect(result.title).toBe("README.md");
    expect(result.sourceUrl).toBe("https://x.com/a/README.md");
  });

  it("記事ページは convertWebPageToMarkdown 経由で markdownBody を markdown として返す", () => {
    const doc = new DOMParser().parseFromString(
      "<html><head><title>記事タイトル</title></head><body><article><p>本文です。もう少し長い文章にしてReadabilityの抽出対象にします。</p></article></body></html>",
      "text/html",
    );
    Object.defineProperty(doc, "contentType", { value: "text/html", configurable: true });
    const result = capturePageMarkdown(doc, "https://x.com/article", now);
    expect(result.markdown.length).toBeGreaterThan(0);
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.sourceUrl).toBe("https://x.com/article");
  });
});
