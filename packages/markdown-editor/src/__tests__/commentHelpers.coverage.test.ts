/**
 * commentHelpers.ts のカバレッジテスト
 * 未カバレッジ: parseCommentLine edge cases, convertCommentMarkers branches
 */
import { parseCommentData, preprocessComments, appendCommentData } from "../utils/commentHelpers";

describe("commentHelpers coverage", () => {
  describe("parseCommentData edge cases", () => {
    it("handles comment block with text after end marker", () => {
      const md = "body\n<!-- comments\nid1: text | 2024-01-01\n-->extra text";
      const { comments, body } = parseCommentData(md);
      expect(comments.size).toBe(0);
      expect(body).toBe(md);
    });

    it("handles comment block with no end marker", () => {
      const md = "body\n<!-- comments\nid1: text | 2024-01-01";
      const { comments, body } = parseCommentData(md);
      expect(comments.size).toBe(0);
      expect(body).toBe(md);
    });

    it("handles empty lines in comment block", () => {
      const md = "body\n<!-- comments\n\nid1: text | 2024-01-01\n\n-->";
      const { comments } = parseCommentData(md);
      expect(comments.size).toBe(1);
    });

    it("handles malformed comment lines (no colon)", () => {
      const md = "body\n<!-- comments\nmalformed line\n-->";
      const { comments } = parseCommentData(md);
      expect(comments.size).toBe(0);
    });

    it("handles malformed comment lines (no pipe)", () => {
      const md = "body\n<!-- comments\nid1: text without pipe\n-->";
      const { comments } = parseCommentData(md);
      expect(comments.size).toBe(0);
    });

    it("handles malformed comment lines (empty createdAt)", () => {
      const md = "body\n<!-- comments\nid1: text | \n-->";
      const { comments } = parseCommentData(md);
      expect(comments.size).toBe(0);
    });

    it("handles resolved comments", () => {
      const md = "body\n<!-- comments\n[resolved] id1: text | 2024-01-01\n-->";
      const { comments } = parseCommentData(md);
      expect(comments.get("id1")?.resolved).toBe(true);
    });

    it("unescapes newlines in comment text", () => {
      const md = "body\n<!-- comments\nid1: line1\\nline2 | 2024-01-01\n-->";
      const { comments } = parseCommentData(md);
      expect(comments.get("id1")?.text).toBe("line1\nline2");
    });

    it("handles text with pipe characters", () => {
      const md = "body\n<!-- comments\nid1: text | with | pipes | 2024-01-01\n-->";
      const { comments } = parseCommentData(md);
      expect(comments.get("id1")?.text).toBe("text | with | pipes");
      expect(comments.get("id1")?.createdAt).toBe("2024-01-01");
    });
  });

  describe("preprocessComments edge cases", () => {
    it("skips comments inside code blocks", () => {
      const md = "```\n<!-- comment-start:id1 -->text<!-- comment-end:id1 -->\n```";
      const result = preprocessComments(md);
      expect(result).not.toContain('data-comment-id');
    });

    it("converts comment-start/end markers to spans", () => {
      const md = "before <!-- comment-start:id1 -->highlighted<!-- comment-end:id1 --> after";
      const result = preprocessComments(md);
      expect(result).toContain('<span data-comment-id="id1">highlighted</span>');
    });

    it("converts comment-point markers to spans", () => {
      const md = "text <!-- comment-point:id2 --> more";
      const result = preprocessComments(md);
      expect(result).toContain('<span data-comment-point="id2"></span>');
    });

    it("handles comment-start without matching end", () => {
      const md = "text <!-- comment-start:id1 -->content without end";
      const result = preprocessComments(md);
      expect(result).not.toContain('data-comment-id');
    });

    it("handles comment-start with whitespace in id", () => {
      const md = "text <!-- comment-start:bad id -->content<!-- comment-end:bad id --> end";
      const result = preprocessComments(md);
      expect(result).not.toContain('data-comment-id="bad id"');
    });

    it("handles comment-start without suffix", () => {
      const md = "text <!-- comment-start:id1 no end suffix";
      const result = preprocessComments(md);
      expect(result).toBe(md);
    });
  });

  describe("appendCommentData edge cases", () => {
    it("escapes backslashes in comment text", () => {
      const comments = new Map([
        ["id1", { id: "id1", text: "text with \\ backslash", resolved: false, createdAt: "2024-01-01" }],
      ]);
      const result = appendCommentData("body", comments);
      expect(result).toContain("\\\\");
    });

    it("escapes newlines in comment text", () => {
      const comments = new Map([
        ["id1", { id: "id1", text: "line1\nline2", resolved: false, createdAt: "2024-01-01" }],
      ]);
      const result = appendCommentData("body", comments);
      expect(result).toContain("\\n");
    });

    it("adds resolved prefix for resolved comments", () => {
      const comments = new Map([
        ["id1", { id: "id1", text: "resolved comment", resolved: true, createdAt: "2024-01-01" }],
      ]);
      const result = appendCommentData("body", comments);
      expect(result).toContain("[resolved]");
    });
  });
});
