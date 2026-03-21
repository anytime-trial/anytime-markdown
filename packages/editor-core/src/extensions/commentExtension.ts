/**
 * Comment Extension
 *
 * インラインコメント機能を提供する 3 つの Extension:
 * - CommentHighlight Mark: テキスト選択範囲にコメントを付与
 * - CommentPoint Node: カーソル位置にポイントコメントを挿入
 * - CommentDataPlugin: Plugin State でコメントデータを管理 + コマンド
 */
import { Extension,Mark, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import type { InlineComment } from "../utils/commentHelpers";

// ============================================================
// ID 生成
// ============================================================

/**
 * crypto.getRandomValues で 8 文字のランダム ID を生成する。
 * 英小文字 + 数字 (36 進数) で構成。
 */
export function generateId(): string {
  const bytes = new Uint8Array(5); // 5 bytes = 40 bits → 8 chars in base36 is sufficient
  crypto.getRandomValues(bytes);
  // 各バイトを base36 に変換して連結し、先頭 8 文字を取得
  let result = "";
  for (const b of bytes) {
    result += b.toString(36);
  }
  // パディング（稀に短くなる場合）
  while (result.length < 8) {
    const extra = new Uint8Array(1);
    crypto.getRandomValues(extra);
    result += extra[0].toString(36);
  }
  return result.slice(0, 8);
}

// ============================================================
// CommentHighlight Mark（選択コメント）
// ============================================================

export const CommentHighlight = Mark.create({
  name: "commentHighlight",
  inclusive: false,
  excludes: "", // 他 Mark と共存

  addAttributes() {
    return {
      commentId: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-comment-id]",
        getAttrs: (el) => {
          if (typeof el === "string") return false;
          return { commentId: el.getAttribute("data-comment-id") || "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-comment-id": HTMLAttributes.commentId,
        class: "comment-highlight",
      },
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize: {
          open: (
            _state: unknown,
            mark: { attrs: { commentId: string } },
          ) => `<!-- comment-start:${mark.attrs.commentId} -->`,
          close: (
            _state: unknown,
            mark: { attrs: { commentId: string } },
          ) => `<!-- comment-end:${mark.attrs.commentId} -->`,
        },
        parse: {},
      },
    };
  },
});

// ============================================================
// CommentPoint Node（ポイントコメント）
// ============================================================

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
    return [
      {
        tag: "span[data-comment-point]",
        getAttrs: (el) => {
          if (typeof el === "string") return false;
          return { commentId: el.getAttribute("data-comment-point") || "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      {
        "data-comment-point": HTMLAttributes.commentId,
        class: "comment-point-marker",
      },
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (text: string) => void },
          node: { attrs: { commentId: string } },
        ) {
          state.write(`<!-- comment-point:${node.attrs.commentId} -->`);
        },
        parse: {},
      },
    };
  },
});

// ============================================================
// CommentDataPlugin（Plugin State + コマンド）
// ============================================================

export const commentDataPluginKey = new PluginKey("commentData");

interface CommentPluginState {
  comments: Map<string, InlineComment>;
}

/** メタアクション型 */
type CommentAction =
  | { type: "add"; comment: InlineComment }
  | { type: "remove"; id: string }
  | { type: "resolve"; id: string }
  | { type: "unresolve"; id: string }
  | { type: "updateText"; id: string; text: string }
  | { type: "init"; comments: Map<string, InlineComment> };

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

const EMPTY_STATE: CommentPluginState = {
  comments: new Map(),
};

export const CommentDataPlugin = Extension.create({
  name: "commentData",


  addCommands() {
    return {
      addComment:
        (text: string) =>
        ({ tr, dispatch, state }) => {
          if (!dispatch) return true;

          const id = generateId();
          const { from, to } = state.selection;
          const hasSelection = from !== to;

          if (hasSelection) {
            // 選択テキスト → Mark 付与
            const markType = state.schema.marks.commentHighlight;
            if (!markType) return false;
            tr.addMark(from, to, markType.create({ commentId: id }));
          } else {
            // 選択なし → Point Node 挿入
            const nodeType = state.schema.nodes.commentPoint;
            if (!nodeType) return false;
            const node = nodeType.create({ commentId: id });
            tr.insert(from, node);
          }

          const comment: InlineComment = {
            id,
            text,
            resolved: false,
            createdAt: new Date().toISOString(),
          };
          const action: CommentAction = { type: "add", comment };
          tr.setMeta(commentDataPluginKey, action);
          dispatch(tr);
          return true;
        },

      removeComment:
        (id: string) =>
        ({ tr, dispatch, state }) => {
          if (!dispatch) return false;

          const doc = state.doc;

          // Mark 除去: doc 全体を走査して対象 Mark を除去
          const markType = state.schema.marks.commentHighlight;
          if (markType) {
            doc.descendants((node, pos) => {
              if (node.isText) {
                const mark = node.marks.find(
                  (m) =>
                    m.type.name === "commentHighlight" &&
                    m.attrs.commentId === id,
                );
                if (mark) {
                  tr.removeMark(pos, pos + node.nodeSize, mark);
                }
              }
            });
          }

          // Point Node 除去: doc 全体を走査して対象 Node を削除
          // 逆順で削除しないと位置がずれる → 位置を収集してから逆順削除
          const pointPositions: { from: number; to: number }[] = [];
          doc.descendants((node, pos) => {
            if (
              node.type.name === "commentPoint" &&
              node.attrs.commentId === id
            ) {
              pointPositions.push({ from: pos, to: pos + node.nodeSize });
            }
          });
          // 逆順で削除（後ろから消すことで位置がずれない）
          for (let i = pointPositions.length - 1; i >= 0; i--) {
            const { from, to } = pointPositions[i];
            tr.delete(from, to);
          }

          const action: CommentAction = { type: "remove", id };
          tr.setMeta(commentDataPluginKey, action);
          dispatch(tr);
          return true;
        },

      resolveComment:
        (id: string) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return false;
          const action: CommentAction = { type: "resolve", id };
          tr.setMeta(commentDataPluginKey, action);
          dispatch(tr);
          return true;
        },

      unresolveComment:
        (id: string) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return false;
          const action: CommentAction = { type: "unresolve", id };
          tr.setMeta(commentDataPluginKey, action);
          dispatch(tr);
          return true;
        },

      updateCommentText:
        (id: string, text: string) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return false;
          const action: CommentAction = { type: "updateText", id, text };
          tr.setMeta(commentDataPluginKey, action);
          dispatch(tr);
          return true;
        },

      initComments:
        (comments: Map<string, InlineComment>) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return false;
          const action: CommentAction = { type: "init", comments };
          tr.setMeta(commentDataPluginKey, action);
          dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: commentDataPluginKey,
        state: {
          init(): CommentPluginState {
            return EMPTY_STATE;
          },
          apply(tr, value: CommentPluginState): CommentPluginState {
            const action = tr.getMeta(commentDataPluginKey) as
              | CommentAction
              | undefined;
            if (!action) return value;

            const next = new Map(value.comments);

            switch (action.type) {
              case "add":
                next.set(action.comment.id, action.comment);
                break;
              case "remove":
                next.delete(action.id);
                break;
              case "resolve": {
                const c = next.get(action.id);
                if (c) next.set(action.id, { ...c, resolved: true });
                break;
              }
              case "unresolve": {
                const c = next.get(action.id);
                if (c) next.set(action.id, { ...c, resolved: false });
                break;
              }
              case "updateText": {
                const c = next.get(action.id);
                if (c) next.set(action.id, { ...c, text: action.text });
                break;
              }
              case "init":
                return { comments: new Map(action.comments) };
            }

            return { comments: next };
          },
        },
      }),
    ];
  },
});
