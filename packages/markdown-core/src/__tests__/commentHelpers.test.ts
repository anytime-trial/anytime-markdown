import {
  InlineComment,
  parseCommentData,
  preprocessComments,
  appendCommentData,
} from "../utils/commentHelpers";

describe("parseCommentData", () => {
  test("コメントブロックなし: 空のMapと本文がそのまま返る", () => {
    const md = "# Hello\n\nSome content";
    const { comments, body } = parseCommentData(md);
    expect(comments.size).toBe(0);
    expect(body).toBe(md);
  });

  test("未解決コメント1件をパースできる", () => {
    const md = "# Hello\n\n<!-- comments\nabc123: テストコメント | 2026-01-01T00:00:00Z\n-->";
    const { comments, body } = parseCommentData(md);
    expect(comments.size).toBe(1);
    const c = comments.get("abc123")!;
    expect(c.id).toBe("abc123");
    expect(c.text).toBe("テストコメント");
    expect(c.resolved).toBe(false);
    expect(c.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(body).toBe("# Hello");
  });

  test("解決済みコメントはresolved=trueになる", () => {
    const md = "body\n\n<!-- comments\n[resolved] id1: 解決済み | 2026-01-01T00:00:00Z\n-->";
    const { comments } = parseCommentData(md);
    const c = comments.get("id1")!;
    expect(c.resolved).toBe(true);
    expect(c.text).toBe("解決済み");
  });

  test("複数コメントをパースできる", () => {
    const md = "body\n\n<!-- comments\na: text A | 2026-01-01\nb: text B | 2026-01-02\nc: text C | 2026-01-03\n-->";
    const { comments } = parseCommentData(md);
    expect(comments.size).toBe(3);
    expect(comments.get("a")!.text).toBe("text A");
    expect(comments.get("b")!.text).toBe("text B");
    expect(comments.get("c")!.text).toBe("text C");
  });

  test("テキストにパイプ文字を含む場合、最後のパイプで分割する", () => {
    const md = "body\n\n<!-- comments\nid1: A | B | C | 2026-01-01\n-->";
    const { comments } = parseCommentData(md);
    const c = comments.get("id1")!;
    expect(c.text).toBe("A | B | C");
    expect(c.createdAt).toBe("2026-01-01");
  });

  test("エスケープされた改行とバックスラッシュを復元する", () => {
    const md = "body\n\n<!-- comments\nid1: line1\\nline2\\\\end | 2026-01-01\n-->";
    const { comments } = parseCommentData(md);
    const c = comments.get("id1")!;
    expect(c.text).toBe("line1\nline2\\end");
  });

  test("コメントブロックが末尾にない場合は無視される", () => {
    const md = "<!-- comments\nid1: text | 2026-01-01\n-->\n\n# After";
    const { comments, body } = parseCommentData(md);
    expect(comments.size).toBe(0);
    expect(body).toBe(md);
  });
});

describe("preprocessComments", () => {
  test("マーカーなし: 変換なし", () => {
    const md = "# Hello\n\nSome text";
    expect(preprocessComments(md)).toBe(md);
  });

  test("範囲コメントをspanに変換する", () => {
    const md = "before <!-- comment-start:id1 -->highlighted<!-- comment-end:id1 --> after";
    const result = preprocessComments(md);
    expect(result).toBe('before <span data-comment-id="id1">highlighted</span> after');
  });

  test("ポイントコメントをspanに変換する", () => {
    const md = "text <!-- comment-point:id2 --> more";
    const result = preprocessComments(md);
    expect(result).toBe('text <span data-comment-point="id2"></span> more');
  });

  test("コードブロック内のマーカーは変換しない", () => {
    const md = "```\n<!-- comment-start:id1 -->text<!-- comment-end:id1 -->\n<!-- comment-point:id2 -->\n```";
    const result = preprocessComments(md);
    expect(result).toBe(md);
  });
});

describe("appendCommentData", () => {
  test("空のMapでは本文がそのまま返る", () => {
    const md = "# Hello";
    const comments = new Map<string, InlineComment>();
    expect(appendCommentData(md, comments)).toBe(md);
  });

  test("コメント1件のブロックを末尾に付加する", () => {
    const md = "# Hello";
    const comments = new Map<string, InlineComment>([
      ["id1", { id: "id1", text: "コメント", resolved: false, createdAt: "2026-01-01" }],
    ]);
    const result = appendCommentData(md, comments);
    expect(result).toBe("# Hello\n\n<!-- comments\nid1: コメント | 2026-01-01\n-->");
  });

  test("解決済みコメントには[resolved]プレフィックスが付く", () => {
    const md = "body";
    const comments = new Map<string, InlineComment>([
      ["id1", { id: "id1", text: "done", resolved: true, createdAt: "2026-01-01" }],
    ]);
    const result = appendCommentData(md, comments);
    expect(result).toContain("[resolved] id1: done | 2026-01-01");
  });

  test("テキスト内の改行は\\nにエスケープされる", () => {
    const md = "body";
    const comments = new Map<string, InlineComment>([
      ["id1", { id: "id1", text: "line1\nline2", resolved: false, createdAt: "2026-01-01" }],
    ]);
    const result = appendCommentData(md, comments);
    expect(result).toContain("id1: line1\\nline2 | 2026-01-01");
  });
});

describe("ラウンドトリップ", () => {
  test("appendしてparseすると元のコメントデータが復元される", () => {
    const original = new Map<string, InlineComment>([
      ["a", { id: "a", text: "hello\nworld", resolved: false, createdAt: "2026-01-01" }],
      ["b", { id: "b", text: "pipe | test", resolved: true, createdAt: "2026-02-01" }],
      ["c", { id: "c", text: "back\\slash", resolved: false, createdAt: "2026-03-01" }],
    ]);
    const md = appendCommentData("# Doc", original);
    const { comments, body } = parseCommentData(md);

    expect(body).toBe("# Doc");
    expect(comments.size).toBe(3);
    for (const [id, orig] of original) {
      const restored = comments.get(id)!;
      expect(restored.id).toBe(orig.id);
      expect(restored.text).toBe(orig.text);
      expect(restored.resolved).toBe(orig.resolved);
      expect(restored.createdAt).toBe(orig.createdAt);
    }
  });
});
