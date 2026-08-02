import { sanitizeTweetHtml } from "../../utils/tweetSanitize";

describe("sanitizeTweetHtml", () => {
    test("blockquote と a を残す", () => {
        const html = `<blockquote class="twitter-tweet"><p lang="en">hello</p><a href="https://twitter.com/u/status/1">link</a></blockquote>`;
        const r = sanitizeTweetHtml(html);
        expect(r).toContain("twitter-tweet");
        expect(r).toContain("href=\"https://twitter.com/u/status/1\"");
    });
    test("script 除去", () => {
        const html = `<blockquote><script>alert(1)</script></blockquote>`;
        expect(sanitizeTweetHtml(html)).not.toContain("<script");
    });
    test("iframe 除去", () => {
        expect(sanitizeTweetHtml(`<iframe src="evil"></iframe>`)).not.toContain("<iframe");
    });
});
