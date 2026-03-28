/**
 * commentExtension.ts coverage tests
 * Targets 16 uncovered branches:
 * - parseHTML getAttrs string check (lines 59, 117)
 * - addComment: dispatch guard, hasSelection branches (lines 194, 203, 208)
 * - removeComment: dispatch guard, mark/point removal (lines 228, 234)
 * - resolveComment/unresolveComment/updateCommentText: dispatch guards (lines 273, 283, 293, 303)
 * - plugin state: resolve/unresolve/updateText when comment exists/missing (lines 337, 342, 347)
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  CommentHighlight,
  CommentPoint,
  CommentDataPlugin,
  commentDataPluginKey,
  generateId,
} from "../extensions/commentExtension";
import type { InlineComment } from "../utils/commentHelpers";

function createEditor(content = "<p>Hello World</p>"): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      CommentHighlight,
      CommentPoint,
      CommentDataPlugin,
    ],
    content,
  });
}

describe("generateId", () => {
  it("returns an 8-character string", () => {
    const id = generateId();
    expect(id).toHaveLength(8);
    expect(typeof id).toBe("string");
  });

  it("returns unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("CommentHighlight parseHTML", () => {
  it("parses span with data-comment-id from HTML content", () => {
    const editor = createEditor('<p><span data-comment-id="abc123" class="comment-highlight">Hello</span></p>');
    let found = false;
    editor.state.doc.descendants((node) => {
      if (node.isText && node.marks.some((m: any) => m.type.name === "commentHighlight" && m.attrs.commentId === "abc123")) {
        found = true;
      }
    });
    expect(found).toBe(true);
    editor.destroy();
  });

  it("parses span without data-comment-id as empty commentId", () => {
    const editor = createEditor('<p><span data-comment-id="" class="comment-highlight">World</span></p>');
    let commentId: string | null = null;
    editor.state.doc.descendants((node) => {
      if (node.isText) {
        const mark = node.marks.find((m: any) => m.type.name === "commentHighlight");
        if (mark) commentId = mark.attrs.commentId;
      }
    });
    expect(commentId).toBe("");
    editor.destroy();
  });
});

describe("CommentPoint parseHTML", () => {
  it("parses span with data-comment-point from HTML content", () => {
    const editor = createEditor('<p>Before<span data-comment-point="xyz789" class="comment-point-marker"></span>After</p>');
    let found = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "commentPoint" && node.attrs.commentId === "xyz789") {
        found = true;
      }
    });
    expect(found).toBe(true);
    editor.destroy();
  });
});

describe("CommentDataPlugin commands", () => {
  let editor: Editor;

  beforeEach(() => {
    editor = createEditor("<p>Hello World test text</p>");
  });

  afterEach(() => {
    editor.destroy();
  });

  it("addComment with selection creates highlight mark", () => {
    // Select "Hello"
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const result = editor.commands.addComment("Test comment");
    expect(result).toBe(true);

    // Verify comment was added to plugin state
    const state = commentDataPluginKey.getState(editor.state);
    expect(state?.comments.size).toBe(1);
    const comment = Array.from(state!.comments.values())[0] as InlineComment;
    expect(comment.text).toBe("Test comment");
    expect(comment.resolved).toBe(false);
  });

  it("addComment without selection creates point node", () => {
    // Set cursor position (no selection)
    editor.commands.setTextSelection(3);
    const result = editor.commands.addComment("Point comment");
    expect(result).toBe(true);

    const state = commentDataPluginKey.getState(editor.state);
    expect(state?.comments.size).toBe(1);
  });

  it("removeComment removes comment from state and marks/nodes from doc", () => {
    // Add a comment first
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.addComment("To be removed");

    const state1 = commentDataPluginKey.getState(editor.state);
    const commentId = Array.from(state1!.comments.keys())[0] as string;

    // Remove it
    const result = editor.commands.removeComment(commentId);
    expect(result).toBe(true);

    const state2 = commentDataPluginKey.getState(editor.state);
    expect(state2?.comments.size).toBe(0);
  });

  it("removeComment removes point nodes", () => {
    // Add point comment
    editor.commands.setTextSelection(3);
    editor.commands.addComment("Point to remove");

    const state1 = commentDataPluginKey.getState(editor.state);
    const commentId = Array.from(state1!.comments.keys())[0] as string;

    const result = editor.commands.removeComment(commentId);
    expect(result).toBe(true);

    const state2 = commentDataPluginKey.getState(editor.state);
    expect(state2?.comments.size).toBe(0);
  });

  it("resolveComment sets resolved=true", () => {
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.addComment("Resolve me");

    const state1 = commentDataPluginKey.getState(editor.state);
    const commentId = Array.from(state1!.comments.keys())[0] as string;

    const result = editor.commands.resolveComment(commentId);
    expect(result).toBe(true);

    const state2 = commentDataPluginKey.getState(editor.state);
    const comment = state2?.comments.get(commentId);
    expect(comment?.resolved).toBe(true);
  });

  it("unresolveComment sets resolved=false", () => {
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.addComment("Unresolve me");

    const state1 = commentDataPluginKey.getState(editor.state);
    const commentId = Array.from(state1!.comments.keys())[0] as string;

    editor.commands.resolveComment(commentId);
    const result = editor.commands.unresolveComment(commentId);
    expect(result).toBe(true);

    const state2 = commentDataPluginKey.getState(editor.state);
    const comment = state2?.comments.get(commentId);
    expect(comment?.resolved).toBe(false);
  });

  it("updateCommentText updates comment text", () => {
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.addComment("Original text");

    const state1 = commentDataPluginKey.getState(editor.state);
    const commentId = Array.from(state1!.comments.keys())[0] as string;

    const result = editor.commands.updateCommentText(commentId, "Updated text");
    expect(result).toBe(true);

    const state2 = commentDataPluginKey.getState(editor.state);
    const comment = state2?.comments.get(commentId);
    expect(comment?.text).toBe("Updated text");
  });

  it("initComments replaces entire comment map", () => {
    const comments = new Map<string, InlineComment>([
      ["id1", { id: "id1", text: "Comment 1", resolved: false, createdAt: new Date().toISOString() }],
      ["id2", { id: "id2", text: "Comment 2", resolved: true, createdAt: new Date().toISOString() }],
    ]);

    const result = editor.commands.initComments(comments);
    expect(result).toBe(true);

    const state = commentDataPluginKey.getState(editor.state);
    expect(state?.comments.size).toBe(2);
    expect(state?.comments.get("id1")?.text).toBe("Comment 1");
  });

  it("resolveComment on non-existent ID does not crash", () => {
    const result = editor.commands.resolveComment("nonexistent");
    expect(result).toBe(true);
  });

  it("unresolveComment on non-existent ID does not crash", () => {
    const result = editor.commands.unresolveComment("nonexistent");
    expect(result).toBe(true);
  });

  it("updateCommentText on non-existent ID does not crash", () => {
    const result = editor.commands.updateCommentText("nonexistent", "text");
    expect(result).toBe(true);
  });
});

describe("CommentHighlight renderHTML", () => {
  it("renders span with data-comment-id and class", () => {
    const editor = createEditor("<p>Hello World</p>");
    // Add a comment with highlight mark
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.addComment("Test");

    const html = editor.getHTML();
    expect(html).toContain("data-comment-id");
    expect(html).toContain("comment-highlight");
    editor.destroy();
  });
});

describe("CommentPoint renderHTML", () => {
  it("renders span with data-comment-point and class", () => {
    const editor = createEditor("<p>Hello World</p>");
    // Add a point comment
    editor.commands.setTextSelection(3);
    editor.commands.addComment("Point");

    const html = editor.getHTML();
    expect(html).toContain("data-comment-point");
    expect(html).toContain("comment-point-marker");
    editor.destroy();
  });
});
