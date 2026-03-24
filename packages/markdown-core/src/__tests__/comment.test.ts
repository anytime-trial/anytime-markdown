/**
 * Comment Helpers テスト
 *
 * インラインコメント機能のユーティリティ関数を検証する。
 * - parseCommentData: Markdown 末尾のコメントデータブロックの解析
 * - preprocessComments: コメントマーカーの HTML タグ変換
 * - appendCommentData: コメントデータブロックの付加
 *
 * Comment Extension テスト
 * - CommentHighlight Mark: 選択テキストへのコメント付与
 * - CommentPoint Node: ポイントコメント挿入
 * - CommentDataPlugin: Plugin State + コマンド
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import type { InlineComment } from "../utils/commentHelpers";
import {
  parseCommentData,
  preprocessComments,
  appendCommentData,
} from "../utils/commentHelpers";
import {
  CommentHighlight,
  CommentPoint,
  CommentDataPlugin,
  commentDataPluginKey,
  generateId,
} from "../extensions/commentExtension";
import { getMarkdownStorage } from "../types";

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

// ============================================================
// Comment Extension テスト
// ============================================================

function createCommentEditor(md = ""): Editor {
  const preprocessed = preprocessComments(md);
  return new Editor({
    extensions: [
      StarterKit,
      CommentHighlight,
      CommentPoint,
      CommentDataPlugin,
      Markdown.configure({ html: true }),
    ],
    content: preprocessed,
  });
}

function getMarkdown(editor: Editor): string {
  return getMarkdownStorage(editor).getMarkdown();
}

interface CommentPluginState {
  comments: Map<string, InlineComment>;
}

function getCommentState(editor: Editor): CommentPluginState {
  return commentDataPluginKey.getState(editor.state) as CommentPluginState;
}

describe("generateId", () => {
  test("8 文字のランダム ID を生成する", () => {
    const id = generateId();
    expect(id).toHaveLength(8);
    expect(/^[a-z0-9]+$/.test(id)).toBe(true);
  });

  test("毎回異なる ID を生成する", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("CommentHighlight Mark", () => {
  describe("parseHTML: span[data-comment-id] 検出", () => {
    test("コメントハイライト Mark を検出する", () => {
      const md = "Hello <!-- comment-start:c1 -->world<!-- comment-end:c1 --> end.";
      const editor = createCommentEditor(md);

      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          const mark = node.marks.find((m) => m.type.name === "commentHighlight");
          if (mark) {
            found = true;
            expect(mark.attrs.commentId).toBe("c1");
          }
        }
      });
      expect(found).toBe(true);
      editor.destroy();
    });
  });

  describe("serialize: Editor → Markdown", () => {
    test("commentHighlight Mark → <!-- comment-start/end --> を出力する", () => {
      const md = "Hello <!-- comment-start:c1 -->world<!-- comment-end:c1 --> end.";
      const editor = createCommentEditor(md);
      const output = getMarkdown(editor);

      expect(output).toContain("<!-- comment-start:c1 -->");
      expect(output).toContain("<!-- comment-end:c1 -->");
      editor.destroy();
    });
  });
});

describe("CommentPoint Node", () => {
  describe("parseHTML: span[data-comment-point] 検出", () => {
    test("コメントポイント Node を検出する", () => {
      const md = "Hello <!-- comment-point:c1 --> world.";
      const editor = createCommentEditor(md);

      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "commentPoint") {
          found = true;
          expect(node.attrs.commentId).toBe("c1");
        }
      });
      expect(found).toBe(true);
      editor.destroy();
    });
  });

  describe("serialize: Editor → Markdown", () => {
    test("commentPoint Node → <!-- comment-point:id --> を出力する", () => {
      const md = "Hello <!-- comment-point:c1 --> world.";
      const editor = createCommentEditor(md);
      const output = getMarkdown(editor);

      expect(output).toContain("<!-- comment-point:c1 -->");
      editor.destroy();
    });
  });
});

describe("CommentDataPlugin コマンド", () => {
  describe("addComment", () => {
    test("テキスト選択時に Mark を付与しコメントを追加する", () => {
      const editor = createCommentEditor("Hello world.");
      // "world" を選択（paragraph 内の位置: doc > p > text）
      // doc(p("Hello world.")) → pos 1 = H, pos 7 = w, pos 12 = .
      const from = 7; // "w" of "world"
      const to = 12; // after "d" of "world"
      editor.commands.setTextSelection({ from, to });

      editor.commands.addComment("Test comment");

      // Mark が付与されていることを確認
      let markFound = false;
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          const mark = node.marks.find((m) => m.type.name === "commentHighlight");
          if (mark) {
            markFound = true;
            expect(mark.attrs.commentId).toBeTruthy();
          }
        }
      });
      expect(markFound).toBe(true);

      // Plugin State にコメントが追加されていることを確認
      const state = getCommentState(editor);
      expect(state.comments.size).toBe(1);
      const comment = [...state.comments.values()][0];
      expect(comment.text).toBe("Test comment");
      expect(comment.resolved).toBe(false);

      editor.destroy();
    });

    test("選択なし時に Point Node を挿入する", () => {
      const editor = createCommentEditor("Hello world.");
      // カーソルを配置（選択なし）
      editor.commands.setTextSelection(7);

      editor.commands.addComment("Point comment");

      // Point Node が挿入されていることを確認
      let pointFound = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "commentPoint") {
          pointFound = true;
          expect(node.attrs.commentId).toBeTruthy();
        }
      });
      expect(pointFound).toBe(true);

      // Plugin State にコメントが追加されていることを確認
      const state = getCommentState(editor);
      expect(state.comments.size).toBe(1);
      const comment = [...state.comments.values()][0];
      expect(comment.text).toBe("Point comment");

      editor.destroy();
    });
  });

  describe("resolveComment", () => {
    test("コメントを解決済みにする", () => {
      const editor = createCommentEditor("Hello world.");
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.addComment("To resolve");

      const state1 = getCommentState(editor);
      const commentId = [...state1.comments.keys()][0];
      expect(state1.comments.get(commentId)!.resolved).toBe(false);

      editor.commands.resolveComment(commentId);

      const state2 = getCommentState(editor);
      expect(state2.comments.get(commentId)!.resolved).toBe(true);

      editor.destroy();
    });
  });

  describe("unresolveComment", () => {
    test("解決済みコメントを未解決に戻す", () => {
      const editor = createCommentEditor("Hello world.");
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.addComment("To unresolve");

      const state1 = getCommentState(editor);
      const commentId = [...state1.comments.keys()][0];

      editor.commands.resolveComment(commentId);
      editor.commands.unresolveComment(commentId);

      const state2 = getCommentState(editor);
      expect(state2.comments.get(commentId)!.resolved).toBe(false);

      editor.destroy();
    });
  });

  describe("updateCommentText", () => {
    test("コメントテキストを更新する", () => {
      const editor = createCommentEditor("Hello world.");
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.addComment("Original");

      const state1 = getCommentState(editor);
      const commentId = [...state1.comments.keys()][0];

      editor.commands.updateCommentText(commentId, "Updated text");

      const state2 = getCommentState(editor);
      expect(state2.comments.get(commentId)!.text).toBe("Updated text");

      editor.destroy();
    });
  });

  describe("removeComment", () => {
    test("コメントと Mark を削除する", () => {
      const editor = createCommentEditor("Hello world.");
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.addComment("To remove");

      const state1 = getCommentState(editor);
      const commentId = [...state1.comments.keys()][0];

      editor.commands.removeComment(commentId);

      // Plugin State からコメントが削除されていることを確認
      const state2 = getCommentState(editor);
      expect(state2.comments.size).toBe(0);

      // Mark が除去されていることを確認
      let markFound = false;
      editor.state.doc.descendants((node) => {
        if (node.isText) {
          const mark = node.marks.find((m) => m.type.name === "commentHighlight");
          if (mark) markFound = true;
        }
      });
      expect(markFound).toBe(false);

      editor.destroy();
    });

    test("Point Node コメントを削除する", () => {
      const editor = createCommentEditor("Hello world.");
      editor.commands.setTextSelection(7);
      editor.commands.addComment("Point to remove");

      const state1 = getCommentState(editor);
      const commentId = [...state1.comments.keys()][0];

      editor.commands.removeComment(commentId);

      // Plugin State からコメントが削除されていることを確認
      const state2 = getCommentState(editor);
      expect(state2.comments.size).toBe(0);

      // Point Node が除去されていることを確認
      let pointFound = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "commentPoint") pointFound = true;
      });
      expect(pointFound).toBe(false);

      editor.destroy();
    });
  });

  describe("initComments", () => {
    test("Plugin State を初期化する", () => {
      const editor = createCommentEditor("Hello world.");
      const comments = new Map<string, InlineComment>([
        ["c1", { id: "c1", text: "Init comment", resolved: false, createdAt: "2026-03-04T00:00:00Z" }],
      ]);

      editor.commands.initComments(comments);

      const state = getCommentState(editor);
      expect(state.comments.size).toBe(1);
      expect(state.comments.get("c1")!.text).toBe("Init comment");

      editor.destroy();
    });
  });
});

// ============================================================
// ソースモード切替ラウンドトリップテスト
// ============================================================

import {
  sanitizeMarkdown,
  preserveBlankLines,
} from "../utils/sanitizeMarkdown";
import { getMarkdownFromEditor } from "../types";

describe("ソースモード切替ラウンドトリップ", () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  /**
   * ソースモード→WYSIWYG 切替をシミュレートする。
   * useSourceMode.handleSwitchToWysiwyg と同じフローを再現。
   */
  function sourceModeRoundTrip(sourceText: string): string {
    // 1. parseCommentData でコメントブロックを分離
    const { comments, body } = parseCommentData(sourceText);

    // 2. sanitizeMarkdown + preserveBlankLines（useSourceMode と同じ処理）
    const sanitized = preserveBlankLines(sanitizeMarkdown(body));

    // 3. エディタに setContent（ソースモード→WYSIWYG 切替相当）
    editor.commands.setContent(sanitized);

    // 4. initComments で Plugin State を復元
    if (comments.size > 0) {
      editor.commands.initComments(comments);
    }

    // 5. getMarkdownFromEditor でシリアライズ（保存時と同じ処理）
    return getMarkdownFromEditor(editor);
  }

  function createEditor(): Editor {
    return new Editor({
      extensions: [
        StarterKit,
        CommentHighlight,
        CommentPoint,
        CommentDataPlugin,
        Markdown.configure({ html: true }),
      ],
    });
  }

  test("選択コメント: ソースモード→WYSIWYG でコメントマーカーが保持される", () => {
    editor = createEditor();
    const sourceText = [
      "Hello <!-- comment-start:c1 -->world<!-- comment-end:c1 --> end.",
      "",
      "<!-- comments",
      "c1: Review this | 2026-03-04T00:00:00Z",
      "-->",
    ].join("\n");

    const result = sourceModeRoundTrip(sourceText);

    expect(result).toContain("<!-- comment-start:c1 -->");
    expect(result).toContain("<!-- comment-end:c1 -->");
    expect(result).toContain("<!-- comments");
    expect(result).toContain("c1: Review this | 2026-03-04T00:00:00Z");
  });

  test("ポイントコメント: ソースモード→WYSIWYG でコメントが保持される", () => {
    editor = createEditor();
    const sourceText = [
      "Hello <!-- comment-point:c2 --> world.",
      "",
      "<!-- comments",
      "c2: Point note | 2026-03-04T00:00:00Z",
      "-->",
    ].join("\n");

    const result = sourceModeRoundTrip(sourceText);

    expect(result).toContain("<!-- comment-point:c2 -->");
    expect(result).toContain("<!-- comments");
    expect(result).toContain("c2: Point note | 2026-03-04T00:00:00Z");
  });

  test("複数コメント: ソースモード→WYSIWYG で全コメントが保持される", () => {
    editor = createEditor();
    const sourceText = [
      "# Title",
      "",
      "Some <!-- comment-start:c1 -->highlighted<!-- comment-end:c1 --> text.",
      "",
      "Another line.<!-- comment-point:c2 -->",
      "",
      "<!-- comments",
      "c1: Highlight comment | 2026-03-04T00:00:00Z",
      "c2: Point comment | 2026-03-04T01:00:00Z",
      "-->",
    ].join("\n");

    const result = sourceModeRoundTrip(sourceText);

    expect(result).toContain("<!-- comment-start:c1 -->");
    expect(result).toContain("<!-- comment-end:c1 -->");
    expect(result).toContain("<!-- comment-point:c2 -->");
    expect(result).toContain("c1: Highlight comment");
    expect(result).toContain("c2: Point comment");
  });

  test("resolved コメント: ソースモード→WYSIWYG で resolved 状態が保持される", () => {
    editor = createEditor();
    const sourceText = [
      "Text <!-- comment-start:c1 -->here<!-- comment-end:c1 -->.",
      "",
      "<!-- comments",
      "[resolved] c1: Already done | 2026-03-04T00:00:00Z",
      "-->",
    ].join("\n");

    const result = sourceModeRoundTrip(sourceText);

    expect(result).toContain("[resolved] c1: Already done");
  });
});
