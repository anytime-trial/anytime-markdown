import type { Editor } from "@anytime-markdown/markdown-react";
import { useEffect, useRef } from "react";

import {
  type CommentInfo,
  installCommentNotifications,
} from "../utils/commentNotifications";

/**
 * エディタ内のコメント変更をデバウンス付きで外部コールバックへ通知する。
 *
 * 純粋ロジックは `utils/commentNotifications.ts`（React 非依存）に抽出済みで、
 * 本 hook は React ライフサイクルへの薄い接続のみを担う。
 */
export function useEditorCommentNotifications(
  editor: Editor | null,
  onCommentsChange?: (comments: CommentInfo[]) => void,
): void {
  const onCommentsChangeRef = useRef(onCommentsChange);
  onCommentsChangeRef.current = onCommentsChange;

  useEffect(() => {
    if (!editor || !onCommentsChangeRef.current) return;
    return installCommentNotifications(editor, (comments) =>
      onCommentsChangeRef.current?.(comments),
    );
  }, [editor]);
}
