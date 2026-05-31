/**
 * sanitizeMarkdown.ts のカバレッジテスト
 * 未カバレッジのエッジケースを追加
 */
import {
  splitByCodeBlocks,
  preserveBlankLines,
  restoreBlankLines,
  sanitizeMarkdown,
  normalizeCodeSpanDelimitersInLine,
  BLANK_LINE_MARKER,
} from "../utils/sanitizeMarkdown";

describe("sanitizeMarkdown coverage", () => {
  describe("splitByCodeBlocks edge cases", () => {
    it("handles text with unclosed code block", () => {
      const result = splitByCodeBlocks("before\n```\ncode without closing");
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("handles triple backtick at end of line without newline", () => {
      const result = splitByCodeBlocks("text\n```");
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("handles code block with trailing whitespace after closing fence", () => {
      const result = splitByCodeBlocks("before\n```js\ncode\n```   \nafter");
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("preserveBlankLines edge cases", () => {
    it("handles multiple blank lines between paragraphs", () => {
      const result = preserveBlankLines("para1\n\n\n\npara2");
      expect(result).toContain(BLANK_LINE_MARKER);
    });

    it("handles tight transition between non-code and code block", () => {
      const result = preserveBlankLines("text\n```\ncode\n```\n");
      // Should process without error
      expect(result).toBeTruthy();
    });

    it("handles tight transition between code and non-code block", () => {
      const result = preserveBlankLines("```\ncode\n```\ntext");
      expect(result).toBeTruthy();
    });

    it("handles blockquote with empty line separator", () => {
      const result = preserveBlankLines("> line1\n>\n> **bold**");
      expect(result).toBeTruthy();
    });

    it("handles table cell with backslash newline", () => {
      const result = preserveBlankLines("| cell1 \\\ncontinued |");
      expect(result).toContain("<br>");
    });

    it("handles admonition blockquote spacing", () => {
      const result = preserveBlankLines("text</blockquote>\n\n\n\nmore");
      expect(result).toBeTruthy();
    });
  });

  describe("restoreBlankLines edge cases", () => {
    it("restores tight transitions with emphasis", () => {
      const result = restoreBlankLines("text* \u200C\n\nnext");
      expect(result).toBe("text*\nnext");
    });

    it("restores tight transitions (normal)", () => {
      const result = restoreBlankLines("text\u200C\n\nnext");
      expect(result).toBe("text\nnext");
    });

    it("restores code fence tight transitions", () => {
      const result = restoreBlankLines("code\n\n\u200Ctext");
      expect(result).toBe("code\ntext");
    });

    it("removes remaining ZWNJ markers", () => {
      const result = restoreBlankLines("text\u200Cmore");
      expect(result).toBe("textmore");
    });

    it("removes ZWSP markers", () => {
      const result = restoreBlankLines("line1\n\u200B\nline2");
      expect(result).toBe("line1\nline2");
    });
  });

  describe("sanitizeMarkdown edge cases", () => {
    it("sanitizes HTML in non-code parts", () => {
      const result = sanitizeMarkdown("text <script>alert(1)</script> end");
      expect(result).not.toContain("<script>");
    });

    it("preserves allowed tags", () => {
      const result = sanitizeMarkdown("text <br> <sub>sub</sub> end");
      expect(result).toContain("<br>");
      expect(result).toContain("<sub>");
    });

    it("preserves code blocks without sanitizing", () => {
      const result = sanitizeMarkdown("text\n```\n<script>code</script>\n```\nend");
      expect(result).toContain("<script>");
    });
  });

  describe("normalizeCodeSpanDelimitersInLine edge cases", () => {
    it("handles code span with nested backticks needing larger delimiter", () => {
      const result = normalizeCodeSpanDelimitersInLine("``code`with`ticks``");
      expect(result).toContain("code`with`ticks");
    });

    it("handles unclosed backtick sequence", () => {
      const result = normalizeCodeSpanDelimitersInLine("text ``unclosed");
      expect(result).toBe("text ``unclosed");
    });

    it("handles simple code span", () => {
      const result = normalizeCodeSpanDelimitersInLine("`simple`");
      expect(result).toBe("`simple`");
    });

    it("handles code span with no backticks in content", () => {
      const result = normalizeCodeSpanDelimitersInLine("``code``");
      expect(result).toBe("`code`");
    });
  });
});
