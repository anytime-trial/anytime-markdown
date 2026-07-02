/**
 * convertWebPageToMarkdown の Readability 失敗フォールバック（指摘15: レビュー
 * 20260702-markdown-editor-full-review.ja.md セクション15）のリグレッションテスト。
 *
 * 実際の @mozilla/readability は `.parse()` が null を返す場合でも内部で script/style/
 * noscript を除去済み（_removeScripts / _prepDocument）のため、実ライブラリ経由では本バグを
 * 再現できない。フォールバック分岐自身が「Readability が何をしていようと script/style/
 * noscript を除去する」という契約を守ることを検証するため、Readability をモックして
 * DOM を一切変更せず null を返すケースを再現する。
 */
jest.mock("@mozilla/readability", () => ({
  Readability: jest.fn().mockImplementation(() => ({
    parse: () => null,
  })),
}));

import { convertWebPageToMarkdown } from "../webImport/convertWebPageToMarkdown";

const now = new Date("2026-06-27T00:00:00.000Z");

describe("convertWebPageToMarkdown フォールバック（Readability 未除去シミュレーション）", () => {
  it("script/style/noscript の内容をフォールバック本文へ混入させない（指摘15）", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = convertWebPageToMarkdown(
      `
        <html>
          <body>
            <script>window.evil = "leaked-script";</script>
            <style>.leaked-style { color: red; }</style>
            <noscript>leaked-noscript-text</noscript>
            <p>Visible paragraph.</p>
          </body>
        </html>
      `,
      "https://example.com/no-article",
      now,
    );

    expect(result.markdownBody).not.toContain("leaked-script");
    expect(result.markdownBody).not.toContain("leaked-style");
    expect(result.markdownBody).not.toContain("leaked-noscript-text");
    expect(result.markdownBody).toContain("Visible paragraph.");

    warnSpy.mockRestore();
  });
});
