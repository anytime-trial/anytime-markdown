/**
 * エディタ内コメントの抽出・変更通知（純粋ロジック）。
 *
 * React hook `useEditorCommentNotifications` から抽出した React 非依存 seam。
 * vanilla orchestrator（host/vanillaMarkdownEditor）と React hook の両方が共有する。
 */

import type { Editor } from "@anytime-markdown/markdown-core";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";

import { DEBOUNCE_MEDIUM } from "../constants/timing";
import { commentDataPluginKey } from "../extensions/commentExtension";
import type { InlineComment } from "./commentHelpers";
import { onCommentStateChange } from "./commentStateSubscription";

/** onCommentsChange へ渡すコメント情報（VS Code 拡張のコメントパネルが消費する形）。 */
export type CommentInfo = {
  id: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  targetText: string;
  pos: number;
  isPoint: boolean;
};

/** descendants コールバック: コメントに対応するノード位置とテキストを探す */
export function findCommentTarget(
  doc: PMNode,
  commentId: string,
): { targetText: string; pos: number; isPoint: boolean } {
  let targetText = "";
  let pos = 0;
  let isPoint = false;
  doc.descendants((node, nodePos) => {
    if (pos > 0 || isPoint) return false;
    if (node.type.name === "commentPoint" && node.attrs.commentId === commentId) {
      pos = nodePos;
      isPoint = true;
      return false;
    }
    if (node.isText) {
      const mark = node.marks.find(
        (m) => m.type.name === "commentHighlight" && m.attrs.commentId === commentId,
      );
      if (mark) {
        targetText = node.text || "";
        pos = nodePos;
        return false;
      }
    }
  });
  return { targetText, pos, isPoint };
}

/** エディタの comment plugin state から CommentInfo[] を抽出する。 */
export function extractEditorComments(editor: Editor): CommentInfo[] {
  const pluginState = commentDataPluginKey.getState(editor.state) as
    | { comments: Map<string, InlineComment> }
    | undefined;
  const comments = pluginState?.comments ?? new Map<string, InlineComment>();
  const result: CommentInfo[] = [];
  for (const [, c] of comments) {
    const { targetText, pos, isPoint } = findCommentTarget(editor.state.doc, c.id);
    result.push({
      id: c.id,
      text: c.text,
      resolved: c.resolved,
      createdAt: c.createdAt,
      targetText,
      pos,
      isPoint,
    });
  }
  return result;
}

/**
 * コメント変更をデバウンス付きで通知する購読を張る（初回即時通知あり）。
 *
 * 購読は共有プリミティブ {@link onCommentStateChange}（`transaction` 購読＋コメント状態／
 * docChanged 差分ガード）に一本化する。本関数は固有処理（debounce・初回通知）のみ担う。
 * resolve / unresolve / updateText や orphan コメント削除は doc 非変更（meta のみ）で
 * `update` が発火しないが、プリミティブが `transaction` を見るため取りこぼさない。
 *
 * @returns 購読解除関数。
 */
export function installCommentNotifications(
  editor: Editor,
  onCommentsChange: (comments: CommentInfo[]) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onCommentsChange(extractEditorComments(editor)), DEBOUNCE_MEDIUM);
  };
  // 初回送信（デバウンス経由・React 版と同一タイミング）
  schedule();
  const unsubscribe = onCommentStateChange(editor, schedule);
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
