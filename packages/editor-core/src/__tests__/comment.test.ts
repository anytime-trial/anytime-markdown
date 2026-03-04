/**
 * Comment Helpers テスト
 *
 * インラインコメント機能のユーティリティ関数を検証する。
 * - parseCommentData: Markdown 末尾のコメントデータブロックの解析
 * - preprocessComments: コメントマーカーの HTML タグ変換
 * - appendCommentData: コメントデータブロックの付加
 */
import type { InlineComment } from "../utils/commentHelpers";
import {
  parseCommentData,
  preprocessComments,
  appendCommentData,
} from "../utils/commentHelpers";

describe("parseCommentData", () => {
  test("末尾の <!-- comments --> ブロックからコメント Map を生成する", () => {
    const md = [
      "# Hello",
      "",
      "Some text.",
      "",
      "<!-- comments",
      "c1: First comment | 2026-03-04T00:00:00Z",
      "c2: Second comment | 2026-03-04T01:00:00Z",
      "-->",
    ].join("\n");

    const { comments, body } = parseCommentData(md);
    expect(comments.size).toBe(2);
    expect(comments.get("c1")).toEqual({
      id: "c1",
      text: "First comment",
      resolved: false,
      createdAt: "2026-03-04T00:00:00Z",
    });
    expect(comments.get("c2")).toEqual({
      id: "c2",
      text: "Second comment",
      resolved: false,
      createdAt: "2026-03-04T01:00:00Z",
    });
  });

  test("[resolved] プレフィックスで resolved=true を設定", () => {
    const md = [
      "Text.",
      "",
      "<!-- comments",
      "[resolved] c1: Done comment | 2026-03-04T00:00:00Z",
      "-->",
    ].join("\n");

    const { comments } = parseCommentData(md);
    expect(comments.get("c1")).toEqual({
      id: "c1",
      text: "Done comment",
      resolved: true,
      createdAt: "2026-03-04T00:00:00Z",
    });
  });

  test("コメントデータがない場合は空 Map を返す", () => {
    const md = "# Hello\n\nSome text.";
    const { comments, body } = parseCommentData(md);
    expect(comments.size).toBe(0);
    expect(body).toBe(md);
  });

  test("body はコメントデータブロック除去後の本文", () => {
    const md = [
      "# Hello",
      "",
      "Some text.",
      "",
      "<!-- comments",
      "c1: A comment | 2026-03-04T00:00:00Z",
      "-->",
    ].join("\n");

    const { body } = parseCommentData(md);
    expect(body).toBe("# Hello\n\nSome text.");
  });
});

describe("preprocessComments", () => {
  test("comment-start/end を span タグに変換する", () => {
    const input =
      "Hello <!-- comment-start:c1 -->world<!-- comment-end:c1 --> end.";
    const result = preprocessComments(input);
    expect(result).toBe(
      'Hello <span data-comment-id="c1">world</span> end.',
    );
  });

  test("comment-point を span タグに変換する", () => {
    const input = "Hello <!-- comment-point:c1 --> world.";
    const result = preprocessComments(input);
    expect(result).toBe('Hello <span data-comment-point="c1"></span> world.');
  });

  test("コードブロック内のコメントマーカーは変換しない", () => {
    const input = [
      "```",
      "<!-- comment-start:c1 -->text<!-- comment-end:c1 -->",
      "```",
    ].join("\n");
    const result = preprocessComments(input);
    expect(result).toBe(input);
  });

  test("複数のマーカーを変換する", () => {
    const input = [
      "<!-- comment-start:c1 -->first<!-- comment-end:c1 -->",
      "<!-- comment-point:c2 -->",
      "<!-- comment-start:c3 -->third<!-- comment-end:c3 -->",
    ].join("\n");
    const result = preprocessComments(input);
    expect(result).toContain('<span data-comment-id="c1">first</span>');
    expect(result).toContain('<span data-comment-point="c2"></span>');
    expect(result).toContain('<span data-comment-id="c3">third</span>');
  });
});

describe("appendCommentData", () => {
  test("コメント Map を末尾の <!-- comments --> ブロックとして付加する", () => {
    const md = "# Hello\n\nSome text.";
    const comments = new Map<string, InlineComment>([
      [
        "c1",
        {
          id: "c1",
          text: "A comment",
          resolved: false,
          createdAt: "2026-03-04T00:00:00Z",
        },
      ],
    ]);

    const result = appendCommentData(md, comments);
    expect(result).toContain("<!-- comments");
    expect(result).toContain("c1: A comment | 2026-03-04T00:00:00Z");
    expect(result).toContain("-->");
    expect(result.startsWith("# Hello\n\nSome text.")).toBe(true);
  });

  test("resolved コメントに [resolved] プレフィックスを付ける", () => {
    const md = "Text.";
    const comments = new Map<string, InlineComment>([
      [
        "c1",
        {
          id: "c1",
          text: "Done",
          resolved: true,
          createdAt: "2026-03-04T00:00:00Z",
        },
      ],
    ]);

    const result = appendCommentData(md, comments);
    expect(result).toContain("[resolved] c1: Done | 2026-03-04T00:00:00Z");
  });

  test("コメントが空の場合はデータブロックを付加しない", () => {
    const md = "# Hello\n\nSome text.";
    const comments = new Map<string, InlineComment>();

    const result = appendCommentData(md, comments);
    expect(result).toBe(md);
    expect(result).not.toContain("<!-- comments");
  });
});

describe("ラウンドトリップ", () => {
  test("appendCommentData の出力を parseCommentData で復元できる", () => {
    const original = new Map<string, InlineComment>([
      ["c1", { id: "c1", text: "Review this", resolved: false, createdAt: "2026-03-04T00:00:00Z" }],
      ["c2", { id: "c2", text: "Done", resolved: true, createdAt: "2026-03-04T01:00:00Z" }],
    ]);
    const serialized = appendCommentData("# Title", original);
    const { comments, body } = parseCommentData(serialized);
    expect(body).toBe("# Title");
    expect(comments.size).toBe(2);
    expect(comments.get("c1")).toEqual(original.get("c1"));
    expect(comments.get("c2")).toEqual(original.get("c2"));
  });

  test("パイプ文字を含むコメントテキストのラウンドトリップ", () => {
    const original = new Map<string, InlineComment>([
      ["c1", { id: "c1", text: "A | B | C", resolved: false, createdAt: "2026-03-04T00:00:00Z" }],
    ]);
    const serialized = appendCommentData("text", original);
    const { comments } = parseCommentData(serialized);
    expect(comments.get("c1")?.text).toBe("A | B | C");
  });
});
