# Inline Comments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** AI レビュー結果やレビュー指摘を Markdown 内に保存・表示するインラインコメント機能を実装する。

**Architecture:** commentHighlight Mark（テキスト範囲）と commentPoint Node（カーソル位置）で位置をマーク。ProseMirror Plugin State でコメントデータを管理。sanitizeMarkdown 前処理で `<!-- comment-* -->` を HTML に変換し、serialize 後処理で末尾に `<!-- comments -->` データブロックを付加する。

**Tech Stack:** Tiptap Extension (Mark + Node + Plugin), React (MUI), ProseMirror, nanoid

---

## Task 1: commentHelpers ユーティリティ

**Files:**
- Create: `packages/editor-core/src/utils/commentHelpers.ts`
- Test: `packages/editor-core/src/__tests__/comment.test.ts`

### Step 1: テスト作成（preprocessComments）

`packages/editor-core/src/__tests__/comment.test.ts`:

```typescript
import {
  preprocessComments,
  appendCommentData,
  parseCommentData,
  type InlineComment,
} from "../utils/commentHelpers";

describe("commentHelpers", () => {
  describe("parseCommentData", () => {
    test("末尾の <!-- comments --> ブロックからコメント Map を生成する", () => {
      const md = `# Title\n\nContent\n\n<!-- comments\nabc: Review this\nxyz: [resolved] Done\n-->`;
      const { comments, body } = parseCommentData(md);
      expect(comments.size).toBe(2);
      expect(comments.get("abc")?.text).toBe("Review this");
      expect(comments.get("abc")?.resolved).toBe(false);
      expect(comments.get("xyz")?.text).toBe("Done");
      expect(comments.get("xyz")?.resolved).toBe(true);
      expect(body).toBe("# Title\n\nContent");
    });

    test("コメントデータがない場合は空 Map を返す", () => {
      const md = "# Title\n\nContent";
      const { comments, body } = parseCommentData(md);
      expect(comments.size).toBe(0);
      expect(body).toBe("# Title\n\nContent");
    });

    test("複数行コメント本文を扱える", () => {
      const md = `text\n\n<!-- comments\nabc: Line one\n-->`;
      const { comments } = parseCommentData(md);
      expect(comments.get("abc")?.text).toBe("Line one");
    });
  });

  describe("preprocessComments", () => {
    test("comment-start/end を span タグに変換する", () => {
      const md = "text <!-- comment-start:abc -->word<!-- comment-end:abc --> after";
      const result = preprocessComments(md);
      expect(result).toBe('text <span data-comment-id="abc">word</span> after');
    });

    test("comment-point を span タグに変換する", () => {
      const md = "text <!-- comment-point:xyz --> after";
      const result = preprocessComments(md);
      expect(result).toBe('text <span data-comment-point="xyz"></span> after');
    });

    test("コードブロック内のコメントマーカーは変換しない", () => {
      const md = "```\n<!-- comment-start:abc -->word<!-- comment-end:abc -->\n```";
      const result = preprocessComments(md);
      expect(result).toBe(md);
    });

    test("複数のコメントマーカーを変換する", () => {
      const md = "<!-- comment-start:a -->foo<!-- comment-end:a --> and <!-- comment-point:b -->";
      const result = preprocessComments(md);
      expect(result).toContain('data-comment-id="a"');
      expect(result).toContain('data-comment-point="b"');
    });
  });

  describe("appendCommentData", () => {
    test("コメント Map を末尾に付加する", () => {
      const comments = new Map<string, InlineComment>([
        ["abc", { id: "abc", text: "Review this", resolved: false, createdAt: "2026-01-01T00:00:00Z" }],
      ]);
      const result = appendCommentData("# Title", comments);
      expect(result).toContain("<!-- comments");
      expect(result).toContain("abc: Review this");
      expect(result).toContain("-->");
    });

    test("resolved コメントに [resolved] プレフィックスを付ける", () => {
      const comments = new Map<string, InlineComment>([
        ["xyz", { id: "xyz", text: "Done", resolved: true, createdAt: "2026-01-01T00:00:00Z" }],
      ]);
      const result = appendCommentData("# Title", comments);
      expect(result).toContain("xyz: [resolved] Done");
    });

    test("コメントが空の場合はデータブロックを付加しない", () => {
      const result = appendCommentData("# Title", new Map());
      expect(result).toBe("# Title");
    });
  });
});
```

### Step 2: テスト実行（FAIL 確認）

Run: `npx jest comment`
Expected: FAIL (module not found)

### Step 3: commentHelpers 実装

`packages/editor-core/src/utils/commentHelpers.ts`:

```typescript
import { splitByCodeBlocks } from "./sanitizeMarkdown";

export interface InlineComment {
  id: string;
  text: string;
  resolved: boolean;
  createdAt: string;
}

/**
 * Markdown 末尾の <!-- comments --> ブロックからコメントデータを抽出する。
 * 戻り値の body はコメントデータブロックを除去した本文。
 */
export function parseCommentData(md: string): {
  comments: Map<string, InlineComment>;
  body: string;
} {
  const comments = new Map<string, InlineComment>();
  // 末尾の <!-- comments ... --> ブロックを検出
  const match = md.match(/\n*<!-- comments\n([\s\S]*?)\n-->\s*$/);
  if (!match) return { comments, body: md };

  const body = md.slice(0, match.index!).replace(/\n+$/, "");
  const lines = match[1].split("\n");
  for (const line of lines) {
    const m = line.match(/^(\S+):\s*(?:\[resolved\]\s*)?(.+)$/);
    if (!m) continue;
    const id = m[1];
    const resolved = line.includes("[resolved]");
    const text = m[2];
    comments.set(id, {
      id,
      text,
      resolved,
      createdAt: new Date().toISOString(),
    });
  }
  return { comments, body };
}

/**
 * Markdown 内の <!-- comment-start:id -->, <!-- comment-end:id -->,
 * <!-- comment-point:id --> を HTML タグに変換する。
 * コードブロック内は変換しない。
 */
export function preprocessComments(md: string): string {
  const parts = splitByCodeBlocks(md);
  return parts
    .map((part) => {
      if (/^```/.test(part)) return part;
      return part
        .replace(/<!-- comment-start:(\S+?) -->/g, '<span data-comment-id="$1">')
        .replace(/<!-- comment-end:\S+? -->/g, "</span>")
        .replace(/<!-- comment-point:(\S+?) -->/g, '<span data-comment-point="$1"></span>');
    })
    .join("");
}

/**
 * serialize 後の Markdown にコメントデータブロックを付加する。
 */
export function appendCommentData(
  md: string,
  comments: Map<string, InlineComment>,
): string {
  if (comments.size === 0) return md;
  const lines = Array.from(comments.values()).map((c) => {
    const prefix = c.resolved ? "[resolved] " : "";
    return `${c.id}: ${prefix}${c.text}`;
  });
  return md + "\n\n<!-- comments\n" + lines.join("\n") + "\n-->\n";
}
```

### Step 4: テスト実行（PASS 確認）

Run: `npx jest comment`
Expected: ALL PASS

### Step 5: tsc 確認

Run: `npx tsc --noEmit`
Expected: エラーなし

### Step 6: コミット

```bash
git add packages/editor-core/src/utils/commentHelpers.ts packages/editor-core/src/__tests__/comment.test.ts
git commit -m "feat: add comment helpers for parsing and serializing inline comments"
```

---

## Task 2: commentExtension（Mark + Node + Plugin State + コマンド）

**Files:**
- Create: `packages/editor-core/src/extensions/commentExtension.ts`
- Test: `packages/editor-core/src/__tests__/comment.test.ts` (追記)

### Step 1: テスト追記（commentExtension）

`packages/editor-core/src/__tests__/comment.test.ts` に追記:

```typescript
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import {
  CommentHighlight,
  CommentPoint,
  CommentDataPlugin,
  commentPluginKey,
} from "../extensions/commentExtension";
import type { InlineComment } from "../utils/commentHelpers";

function createCommentEditor(content = ""): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      CommentHighlight,
      CommentPoint,
      CommentDataPlugin,
      Markdown.configure({ html: true }),
    ],
    content,
  });
}

describe("commentExtension", () => {
  describe("addComment コマンド", () => {
    test("テキスト選択時に Mark を付与しコメントを追加する", () => {
      const editor = createCommentEditor("<p>hello world</p>");
      // "world" を選択（pos 7-12）
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.addComment("test comment");

      const state = commentPluginKey.getState(editor.state);
      expect(state.comments.size).toBe(1);
      const comment = Array.from(state.comments.values())[0];
      expect(comment.text).toBe("test comment");
      expect(comment.resolved).toBe(false);

      // Mark が付与されていることを確認
      const marks = editor.state.doc.nodeAt(6)?.marks ?? [];
      expect(marks.some((m) => m.type.name === "commentHighlight")).toBe(true);

      editor.destroy();
    });

    test("選択なし（カーソル位置）で Point Node を挿入する", () => {
      const editor = createCommentEditor("<p>hello</p>");
      editor.commands.setTextSelection(3);
      editor.commands.addComment("point comment");

      const state = commentPluginKey.getState(editor.state);
      expect(state.comments.size).toBe(1);

      // commentPoint Node が存在することを確認
      let found = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "commentPoint") found = true;
      });
      expect(found).toBe(true);

      editor.destroy();
    });
  });

  describe("resolveComment コマンド", () => {
    test("コメントを解決済みにする", () => {
      const editor = createCommentEditor("<p>hello world</p>");
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.addComment("test");

      const id = Array.from(commentPluginKey.getState(editor.state).comments.keys())[0];
      editor.commands.resolveComment(id);

      const state = commentPluginKey.getState(editor.state);
      expect(state.comments.get(id)?.resolved).toBe(true);

      editor.destroy();
    });
  });

  describe("removeComment コマンド", () => {
    test("コメントと Mark を削除する", () => {
      const editor = createCommentEditor("<p>hello world</p>");
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.addComment("test");

      const id = Array.from(commentPluginKey.getState(editor.state).comments.keys())[0];
      editor.commands.removeComment(id);

      const state = commentPluginKey.getState(editor.state);
      expect(state.comments.size).toBe(0);

      editor.destroy();
    });
  });

  describe("serialize", () => {
    test("commentHighlight Mark を <!-- comment-start/end --> に変換する", () => {
      const editor = createCommentEditor("<p>hello world</p>");
      editor.commands.setTextSelection({ from: 7, to: 12 });
      editor.commands.addComment("test");

      const md = (editor.storage as any).markdown.getMarkdown();
      const id = Array.from(commentPluginKey.getState(editor.state).comments.keys())[0];
      expect(md).toContain(`<!-- comment-start:${id} -->`);
      expect(md).toContain(`<!-- comment-end:${id} -->`);

      editor.destroy();
    });

    test("commentPoint Node を <!-- comment-point:id --> に変換する", () => {
      const editor = createCommentEditor("<p>hello</p>");
      editor.commands.setTextSelection(3);
      editor.commands.addComment("point");

      const md = (editor.storage as any).markdown.getMarkdown();
      const id = Array.from(commentPluginKey.getState(editor.state).comments.keys())[0];
      expect(md).toContain(`<!-- comment-point:${id} -->`);

      editor.destroy();
    });
  });
});
```

### Step 2: テスト実行（FAIL 確認）

Run: `npx jest comment`
Expected: FAIL

### Step 3: commentExtension 実装

`packages/editor-core/src/extensions/commentExtension.ts`:

```typescript
import { Mark, Node, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { InlineComment } from "../utils/commentHelpers";

export const commentPluginKey = new PluginKey("commentData");

// ---- nanoid 代替（軽量 ID 生成） ----
function generateId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const arr = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) result += chars[arr[i] % chars.length];
  return result;
}

// ---- Plugin State 型 ----
interface CommentDataState {
  comments: Map<string, InlineComment>;
}

interface CommentAction {
  type: "add" | "remove" | "resolve" | "unresolve" | "update" | "init";
  id?: string;
  comment?: InlineComment;
  comments?: Map<string, InlineComment>;
  text?: string;
}

// ---- commentHighlight Mark ----
export const CommentHighlight = Mark.create({
  name: "commentHighlight",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      commentId: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]", getAttrs: (el) => ({ commentId: (el as HTMLElement).getAttribute("data-comment-id") || "" }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { "data-comment-id": HTMLAttributes.commentId, class: "comment-highlight" }, 0];
  },
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (state: unknown, mark: { attrs: { commentId: string } }) =>
            `<!-- comment-start:${mark.attrs.commentId} -->`,
          close: (state: unknown, mark: { attrs: { commentId: string } }) =>
            `<!-- comment-end:${mark.attrs.commentId} -->`,
        },
        parse: {},
      },
    };
  },
});

// ---- commentPoint Node ----
export const CommentPoint = Node.create({
  name: "commentPoint",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      commentId: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-point]", getAttrs: (el) => ({ commentId: (el as HTMLElement).getAttribute("data-comment-point") || "" }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { "data-comment-point": HTMLAttributes.commentId, class: "comment-point-marker" }];
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { commentId: string } }) {
          state.write(`<!-- comment-point:${node.attrs.commentId} -->`);
        },
        parse: {},
      },
    };
  },
});

// ---- CommentDataPlugin (コマンド + Plugin State) ----

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentData: {
      addComment: (text: string) => ReturnType;
      removeComment: (id: string) => ReturnType;
      resolveComment: (id: string) => ReturnType;
      unresolveComment: (id: string) => ReturnType;
      updateCommentText: (id: string, text: string) => ReturnType;
      initComments: (comments: Map<string, InlineComment>) => ReturnType;
    };
  }
}

export const CommentDataPlugin = Extension.create({
  name: "commentData",

  addCommands() {
    return {
      addComment:
        (text: string) =>
        ({ tr, state, dispatch }) => {
          const id = generateId();
          const { from, to, empty } = state.selection;

          if (dispatch) {
            if (empty) {
              // ポイントコメント: Node 挿入
              const node = state.schema.nodes.commentPoint.create({ commentId: id });
              tr.insert(from, node);
            } else {
              // 選択コメント: Mark 付与
              const mark = state.schema.marks.commentHighlight.create({ commentId: id });
              tr.addMark(from, to, mark);
            }
            const comment: InlineComment = {
              id,
              text,
              resolved: false,
              createdAt: new Date().toISOString(),
            };
            tr.setMeta(commentPluginKey, { type: "add", id, comment } as CommentAction);
          }
          return true;
        },

      removeComment:
        (id: string) =>
        ({ tr, state, dispatch }) => {
          if (dispatch) {
            // Mark を除去
            const markType = state.schema.marks.commentHighlight;
            state.doc.descendants((node, pos) => {
              if (node.isText) {
                const mark = node.marks.find(
                  (m) => m.type === markType && m.attrs.commentId === id,
                );
                if (mark) {
                  tr.removeMark(pos, pos + node.nodeSize, mark);
                }
              }
              // Point Node を削除
              if (node.type.name === "commentPoint" && node.attrs.commentId === id) {
                tr.delete(pos, pos + node.nodeSize);
              }
            });
            tr.setMeta(commentPluginKey, { type: "remove", id } as CommentAction);
          }
          return true;
        },

      resolveComment:
        (id: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(commentPluginKey, { type: "resolve", id } as CommentAction);
          }
          return true;
        },

      unresolveComment:
        (id: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(commentPluginKey, { type: "unresolve", id } as CommentAction);
          }
          return true;
        },

      updateCommentText:
        (id: string, text: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(commentPluginKey, { type: "update", id, text } as CommentAction);
          }
          return true;
        },

      initComments:
        (comments: Map<string, InlineComment>) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(commentPluginKey, { type: "init", comments } as CommentAction);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: commentPluginKey,
        state: {
          init(): CommentDataState {
            return { comments: new Map() };
          },
          apply(tr, value: CommentDataState): CommentDataState {
            const action = tr.getMeta(commentPluginKey) as CommentAction | undefined;
            if (!action) return value;

            const next = new Map(value.comments);
            switch (action.type) {
              case "add":
                if (action.id && action.comment) next.set(action.id, action.comment);
                break;
              case "remove":
                if (action.id) next.delete(action.id);
                break;
              case "resolve": {
                const c = action.id ? next.get(action.id) : undefined;
                if (c) next.set(action.id!, { ...c, resolved: true });
                break;
              }
              case "unresolve": {
                const c = action.id ? next.get(action.id) : undefined;
                if (c) next.set(action.id!, { ...c, resolved: false });
                break;
              }
              case "update": {
                const c = action.id ? next.get(action.id) : undefined;
                if (c && action.text !== undefined) next.set(action.id!, { ...c, text: action.text });
                break;
              }
              case "init":
                return { comments: action.comments ?? new Map() };
            }
            return { comments: next };
          },
        },
      }),
    ];
  },
});
```

### Step 4: テスト実行（PASS 確認）

Run: `npx jest comment`
Expected: ALL PASS

### Step 5: tsc 確認

Run: `npx tsc --noEmit`
Expected: エラーなし

### Step 6: コミット

```bash
git add packages/editor-core/src/extensions/commentExtension.ts packages/editor-core/src/__tests__/comment.test.ts
git commit -m "feat: add comment extension with Mark, Node, and Plugin State"
```

---

## Task 3: エディタ統合（editorExtensions, sanitizeMarkdown, BubbleMenu, ショートカット）

**Files:**
- Modify: `packages/editor-core/src/editorExtensions.ts`
- Modify: `packages/editor-core/src/utils/sanitizeMarkdown.ts`
- Modify: `packages/editor-core/src/components/EditorBubbleMenu.tsx`
- Modify: `packages/editor-core/src/hooks/useEditorConfig.ts`
- Modify: `packages/editor-core/src/types.ts`

### Step 1: editorExtensions.ts に登録

```typescript
// import 追加
import { CommentHighlight, CommentPoint, CommentDataPlugin } from "./extensions/commentExtension";

// getBaseExtensions() の配列に追加（FootnoteRef の後）
CommentHighlight,
CommentPoint,
CommentDataPlugin,
```

### Step 2: sanitizeMarkdown.ts に前処理追加

```typescript
// import 追加
import { preprocessComments } from "./commentHelpers";

// sanitizeMarkdown 関数内、preprocessFootnoteRefs の後に追加
md = preprocessComments(md);

// DOMPurify プレースホルダ保護: fnSpans の後に追加
// comment span を DOMPurify から保護
const cmtSpans: string[] = [];
inner = inner.replace(/<span data-comment-id="[^"]*">/g, (m) => {
  cmtSpans.push(m); return `\x00CMTS${cmtSpans.length - 1}\x00`;
});
inner = inner.replace(/<\/span>/g, (m, offset) => {
  // comment-id の閉じタグのみ保護（他の </span> と区別するため前方に CMTS マーカーがあるか確認）
  // 簡易実装: 全 </span> を保護すると壊れるので、comment 用の閉じタグは </cspan> に変換して保護
  return m;
});
// → 代替案: comment-start/end タグを一括で保護
const cmtBlocks: string[] = [];
inner = inner.replace(/<span data-comment-id="[^"]*">[\s\S]*?<\/span>/g, (m) => {
  cmtBlocks.push(m); return `\x00CMT${cmtBlocks.length - 1}\x00`;
});
const cmtPoints: string[] = [];
inner = inner.replace(/<span data-comment-point="[^"]*"><\/span>/g, (m) => {
  cmtPoints.push(m); return `\x00CMTP${cmtPoints.length - 1}\x00`;
});

// 復元（sanitized の後に追加）
sanitized = sanitized.replace(/\x00CMT(\d+)\x00/g, (_, i) => cmtBlocks[Number(i)]);
sanitized = sanitized.replace(/\x00CMTP(\d+)\x00/g, (_, i) => cmtPoints[Number(i)]);
```

**注意**: `<span data-comment-id>...</span>` の保護は、内容にネストされた `</span>` が含まれない前提。コメントハイライトは純粋なテキスト範囲のみなので問題ない。

### Step 3: EditorBubbleMenu.tsx にコメントボタン追加

```typescript
// import 追加
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

// TOOLTIP_SHORTCUTS に追加
comment: `${modKey}+Shift+M`,

// link ボタンの後に追加（</Tooltip> の後、</Paper> の前）
<Tooltip title={tip(t, "comment")}>
  <IconButton
    size="small"
    aria-label={t("comment")}
    onClick={() => {
      const text = prompt(t("commentPrompt") || "Comment:");
      if (text) editor.chain().focus().addComment(text).run();
    }}
    color={editor.isActive("commentHighlight") ? "primary" : "default"}
    sx={{ p: 0.5 }}
  >
    <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />
  </IconButton>
</Tooltip>
```

**注意**: 初期実装では `prompt()` で入力。Task 4 で CommentPopover に置き換える。

### Step 4: useEditorConfig.ts にショートカット追加

```typescript
// commentExtension の addKeyboardShortcuts は CommentDataPlugin に追加するか、
// または useEditorConfig の editorProps.handleKeyDown で処理する。
// → CommentDataPlugin の addKeyboardShortcuts() として実装する方がクリーン。
```

`commentExtension.ts` の CommentDataPlugin に `addKeyboardShortcuts()` を追加:

```typescript
addKeyboardShortcuts() {
  return {
    "Mod-Shift-m": () => {
      const text = prompt("Comment:");
      if (text) this.editor.commands.addComment(text);
      return true;
    },
  };
},
```

### Step 5: types.ts の getMarkdownFromEditor にコメントデータ付加

```typescript
// import 追加
import { appendCommentData } from "./utils/commentHelpers";
import { commentPluginKey } from "./extensions/commentExtension";

// getMarkdownFromEditor 関数の return md の前に追加:
// コメントデータを末尾に付加
const commentState = commentPluginKey.getState(editor.state);
if (commentState?.comments?.size > 0) {
  md = appendCommentData(md, commentState.comments);
}
```

### Step 6: useEditorConfig.ts の onCreate にコメントデータ初期化追加

コメントデータは sanitizeMarkdown の前処理で parseCommentData により抽出される。
抽出されたデータを editor の Plugin State に注入する必要がある。

**方法**: `sanitizeMarkdown` の前に `parseCommentData` を呼び、body だけを sanitize に渡す。
コメント Map は外部に保持し、onCreate で `initComments` コマンドで注入する。

これは MarkdownEditorPage レベルで処理する（Task 4 で実装）。

### Step 7: tsc + テスト確認

Run: `npx tsc --noEmit && npx jest comment`
Expected: ALL PASS

### Step 8: コミット

```bash
git add packages/editor-core/src/editorExtensions.ts \
  packages/editor-core/src/utils/sanitizeMarkdown.ts \
  packages/editor-core/src/components/EditorBubbleMenu.tsx \
  packages/editor-core/src/extensions/commentExtension.ts \
  packages/editor-core/src/types.ts
git commit -m "feat: integrate comment extension with editor pipeline"
```

---

## Task 4: CommentPanel + CommentPopover + ツールバー統合

**Files:**
- Create: `packages/editor-core/src/components/CommentPanel.tsx`
- Create: `packages/editor-core/src/components/CommentPopover.tsx`
- Modify: `packages/editor-core/src/components/EditorToolbar.tsx`
- Modify: `packages/editor-core/src/MarkdownEditorPage.tsx`

### Step 1: CommentPopover 作成

`packages/editor-core/src/components/CommentPopover.tsx`:

コメント入力用の Popover。テキスト入力 + Enter で確定、Escape でキャンセル。
Props: `open`, `anchorEl`, `onClose`, `onSubmit(text: string)`, `initialText?`, `t`

- MUI Popover + TextField + Button
- 200px 幅、コンパクトなデザイン

### Step 2: CommentPanel 作成

`packages/editor-core/src/components/CommentPanel.tsx`:

右サイドパネルでコメント一覧を表示。
Props: `editor`, `open`, `onClose`, `t`

- `useEditorState` で `commentPluginKey.getState(editor.state).comments` を購読
- フィルタ: 全て / 未解決 / 解決済み（ToggleButtonGroup）
- 各コメントカード: 対象テキスト表示、コメント本文、解決/削除ボタン
- カードクリックで該当箇所にスクロール（Mark の位置を doc.descendants で検索）
- Paper ベースのサイドパネル（幅 280px）

### Step 3: EditorToolbar にトグルボタン追加

```typescript
// import 追加
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

// Props に追加
commentOpen: boolean;
onToggleComments: () => void;

// アウトラインボタンの近くにコメントパネルトグルボタンを追加
<ToggleButton
  value="comments"
  selected={commentOpen}
  onClick={onToggleComments}
  sx={{ px: 0.75, py: 0.25 }}
>
  <Tooltip title={t("commentPanel")}>
    <ChatBubbleOutlineIcon fontSize="small" />
  </Tooltip>
</ToggleButton>
```

### Step 4: MarkdownEditorPage にパネル配置 + State 管理

```typescript
// コメントパネル開閉 state
const [commentOpen, setCommentOpen] = useState(false);

// レイアウト: EditorOutlineSection と同列に CommentPanel を右側に配置
<Box component="main" sx={{ display: "flex", gap: 0 }}>
  <EditorOutlineSection {...outlineProps} />
  <Box sx={{ flex: 1, minWidth: 0 }}>
    {/* Editor content */}
  </Box>
  {commentOpen && editor && !sourceMode && (
    <CommentPanel editor={editor} open={commentOpen} onClose={() => setCommentOpen(false)} t={t} />
  )}
</Box>

// コメントデータの初期化（parseCommentData → initComments）
// initialContent 処理時に parseCommentData を呼び、
// コメント Map を ref に保持、onCreate で initComments を実行
```

### Step 5: BubbleMenu の prompt() を CommentPopover に置換

EditorBubbleMenu のコメントボタンクリック時に CommentPopover を開くように変更。
Popover の anchorEl は BubbleMenu 内のボタン要素。

### Step 6: tsc + テスト確認

Run: `npx tsc --noEmit && npx jest`
Expected: ALL PASS

### Step 7: コミット

```bash
git add packages/editor-core/src/components/CommentPanel.tsx \
  packages/editor-core/src/components/CommentPopover.tsx \
  packages/editor-core/src/components/EditorToolbar.tsx \
  packages/editor-core/src/MarkdownEditorPage.tsx
git commit -m "feat: add CommentPanel and CommentPopover UI components"
```

---

## Task 5: スラッシュコマンド + i18n + スタイル + 全体検証

**Files:**
- Modify: `packages/editor-core/src/extensions/slashCommandItems.ts`
- Modify: `packages/editor-core/src/styles/editorStyles.ts`
- Modify: `packages/editor-core/src/i18n/en.json`
- Modify: `packages/editor-core/src/i18n/ja.json`

### Step 1: スラッシュコマンド追加

```typescript
// slashCommandItems.ts に追加
{
  id: "comment",
  labelKey: "slashComment",
  icon: React.createElement(ChatBubbleOutlineIcon, { fontSize: "small" }),
  keywords: ["comment", "annotation", "note", "コメント", "注釈", "メモ"],
  action: (editor) => {
    const text = prompt("Comment:");
    if (text) editor.chain().focus().addComment(text).run();
  },
},
```

### Step 2: i18n キー追加

**en.json:**
```json
"comment": "Comment",
"commentPrompt": "Enter comment:",
"commentPanel": "Comments",
"commentResolve": "Resolve",
"commentUnresolve": "Reopen",
"commentDelete": "Delete",
"commentFilterAll": "All",
"commentFilterOpen": "Open",
"commentFilterResolved": "Resolved",
"commentPointLabel": "Point comment",
"slashComment": "Comment"
```

**ja.json:**
```json
"comment": "コメント",
"commentPrompt": "コメントを入力:",
"commentPanel": "コメント",
"commentResolve": "解決",
"commentUnresolve": "再開",
"commentDelete": "削除",
"commentFilterAll": "全て",
"commentFilterOpen": "未解決",
"commentFilterResolved": "解決済み",
"commentPointLabel": "ポイントコメント",
"slashComment": "コメント"
```

### Step 3: スタイル追加

`editorStyles.ts` の `getEditorPaperSx()` に追加:

```typescript
// コメントハイライト
"& .comment-highlight": {
  backgroundColor: "rgba(255, 200, 0, 0.25)",
  borderBottom: "2px solid rgba(255, 200, 0, 0.6)",
  cursor: "pointer",
  borderRadius: "2px",
},
"& .comment-highlight:hover": {
  backgroundColor: "rgba(255, 200, 0, 0.4)",
},
// 解決済みコメントハイライト（data 属性で制御、または resolved クラスで制御）
// → Plugin Decoration で resolved 状態のクラスを付与する方法を検討
// 初期実装では全コメント同色

// ポイントコメントマーカー
"& .comment-point-marker": {
  display: "inline-block",
  width: "16px",
  height: "16px",
  verticalAlign: "text-bottom",
  backgroundImage: `url("data:image/svg+xml,...")`,  // 吹き出しアイコン SVG
  // または MUI アイコンを NodeView で描画
  cursor: "pointer",
  userSelect: "none" as const,
},
```

### Step 4: 全テスト実行

Run: `npx tsc --noEmit && npx jest`
Expected: ALL PASS

### Step 5: i18n 整合性チェック

```bash
node -e "
const en = require('./packages/editor-core/src/i18n/en.json').MarkdownEditor;
const ja = require('./packages/editor-core/src/i18n/ja.json').MarkdownEditor;
const enKeys = Object.keys(en).sort();
const jaKeys = Object.keys(ja).sort();
const missingInJa = enKeys.filter(k => !jaKeys.includes(k));
const missingInEn = jaKeys.filter(k => !enKeys.includes(k));
if (missingInJa.length) console.log('ja に不足:', missingInJa);
if (missingInEn.length) console.log('en に不足:', missingInEn);
if (!missingInJa.length && !missingInEn.length) console.log('i18n キー一致');
"
```

### Step 6: コミット

```bash
git add packages/editor-core/src/extensions/slashCommandItems.ts \
  packages/editor-core/src/styles/editorStyles.ts \
  packages/editor-core/src/i18n/en.json \
  packages/editor-core/src/i18n/ja.json
git commit -m "feat: add comment slash command, i18n keys, and editor styles"
```

---

## リスクと注意事項

| リスク | 対策 |
|-------|------|
| DOMPurify が `<!-- -->` を除去 | preprocessComments で HTML タグに変換後、プレースホルダ保護 |
| `<span data-comment-id>` 内に `</span>` がネストされる可能性 | コメント Mark はテキスト範囲のみ（ブロック要素を含まない）なのでネスト不可 |
| Mark の範囲がドキュメント編集で崩れる | appendTransaction で孤立コメント検出（将来改善） |
| tiptap-markdown が `<!-- -->` をエスケープする可能性 | serialize で直接 `state.write()` するため問題なし |
| ソースモードとの整合性 | ソースモードでは `<!-- -->` がそのまま表示・編集可能 |
