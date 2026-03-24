import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";

import { DEBOUNCE_MEDIUM } from "../constants/timing";
import { commentDataPluginKey } from "../extensions/commentExtension";
import type { InlineComment } from "../utils/commentHelpers";

type CommentInfo = {
  id: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  targetText: string;
  pos: number;
  isPoint: boolean;
};

/** descendants コールバック: コメントに対応するノード位置とテキストを探す */
function findCommentTarget(
  doc: import("@tiptap/pm/model").Node,
  commentId: string,
): { targetText: string; pos: number; isPoint: boolean } {
  let targetText = '';
  let pos = 0;
  let isPoint = false;
  doc.descendants((node, nodePos) => {
    if (pos > 0 || isPoint) return false;
    if (node.type.name === 'commentPoint' && node.attrs.commentId === commentId) {
      pos = nodePos;
      isPoint = true;
      return false;
    }
    if (node.isText) {
      const mark = node.marks.find(m => m.type.name === 'commentHighlight' && m.attrs.commentId === commentId);
      if (mark) {
        targetText = node.text || '';
        pos = nodePos;
        return false;
      }
    }
  });
  return { targetText, pos, isPoint };
}

/**
 * エディタ内のコメント変更をデバウンス付きで外部コールバックへ通知する。
 */
export function useEditorCommentNotifications(
  editor: Editor | null,
  onCommentsChange?: (comments: CommentInfo[]) => void,
): void {
  const onCommentsChangeRef = useRef(onCommentsChange);
  onCommentsChangeRef.current = onCommentsChange;
  const commentsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor || !onCommentsChangeRef.current) return;
    const extractComments = () => {
      const pluginState = commentDataPluginKey.getState(editor.state) as { comments: Map<string, InlineComment> } | undefined;
      const comments = pluginState?.comments ?? new Map<string, InlineComment>();
      const result: CommentInfo[] = [];
      for (const [, c] of comments) {
        const { targetText, pos, isPoint } = findCommentTarget(editor.state.doc, c.id);
        result.push({ id: c.id, text: c.text, resolved: c.resolved, createdAt: c.createdAt, targetText, pos, isPoint });
      }
      onCommentsChangeRef.current?.(result);
    };
    const handler = () => {
      if (commentsDebounceRef.current) clearTimeout(commentsDebounceRef.current);
      commentsDebounceRef.current = setTimeout(extractComments, DEBOUNCE_MEDIUM);
    };
    // 初回送信
    handler();
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
      if (commentsDebounceRef.current) clearTimeout(commentsDebounceRef.current);
    };
  }, [editor]);
}
