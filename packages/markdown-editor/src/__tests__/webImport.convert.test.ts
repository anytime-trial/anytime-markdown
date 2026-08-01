import { convertWebPageToMarkdown } from "../webImport/convertWebPageToMarkdown";

const now = new Date("2026-06-27T00:00:00.000Z");

describe("convertWebPageToMarkdown", () => {
  it("converts article headings, paragraphs, lists, links, and code to Markdown", () => {
    const result = convertWebPageToMarkdown(
      `
        <html>
          <head><title>Import Guide</title></head>
          <body>
            <article>
              <h1>Import Guide</h1>
              <p>Read the <a href="https://example.com/docs">docs</a>.</p>
              <ul>
                <li>First item</li>
                <li>Use <code>npm test</code></li>
              </ul>
            </article>
          </body>
        </html>
      `,
      "https://example.com/import-guide",
      now,
    );

    expect(result.title).toBe("Import Guide");
    expect(result.sourceUrl).toBe("https://example.com/import-guide");
    expect(result.fetchedAt).toBe("2026-06-27T00:00:00.000Z");
    // markdownBody は本文のみ。タイトル見出しは composer 側が付与するため body には重複させない。
    expect(result.markdownBody).toContain("Read the");
    expect(result.markdownBody).toContain("[docs](https://example.com/docs)");
    expect(result.markdownBody).toContain("First item");
    expect(result.markdownBody).toContain("`npm test`");
  });

  it("extracts article body without nav, aside, or script content", () => {
    const result = convertWebPageToMarkdown(
      `
        <html>
          <body>
            <nav>Global navigation</nav>
            <main>
              <article>
                <h1>Readable Story</h1>
                <p>This paragraph should remain.</p>
              </article>
            </main>
            <aside>Related links</aside>
            <script>window.evil = true;</script>
          </body>
        </html>
      `,
      "https://example.com/story",
      now,
    );

    expect(result.markdownBody).toContain("This paragraph should remain.");
    expect(result.markdownBody).not.toContain("Global navigation");
    expect(result.markdownBody).not.toContain("Related links");
    expect(result.markdownBody).not.toContain("window.evil");
  });

  it("falls back without throwing when readability cannot extract an article", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() =>
      convertWebPageToMarkdown("<html><body></body></html>", "https://example.com/empty", now),
    ).not.toThrow();

    const result = convertWebPageToMarkdown(
      "<html><body></body></html>",
      "https://example.com/empty",
      now,
    );

    expect(result.markdownBody).toBe("");
    expect(result.sourceUrl).toBe("https://example.com/empty");
    expect(warnSpy).toHaveBeenCalledWith(
      "[webImport] readability failed, fallback to body: https://example.com/empty",
    );

    warnSpy.mockRestore();
  });
});
