import type { Editor } from "@tiptap/react";
import { useEffect } from "react";

import type { EditorSettings } from "../useEditorSettings";

/**
 * エディタ設定の同期を行う副作用フック。
 * - スペルチェックの設定
 * - readonlyモード時のeditable制御
 * - hideFoldAll時の全ブロック展開
 */
export function useEditorSettingsSync(
  editor: Editor | null,
  settings: EditorSettings,
  options: {
    readOnly?: boolean;
    hideFoldAll?: boolean;
    handleExpandAllBlocks: () => void;
  },
): void {
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("spellcheck", String(settings.spellCheck));
  }, [editor, settings.spellCheck]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!options.readOnly);
    }
  }, [options.readOnly, editor]);

  const { hideFoldAll, handleExpandAllBlocks } = options;
  useEffect(() => {
    if (hideFoldAll && editor) handleExpandAllBlocks();
  }, [hideFoldAll, editor, handleExpandAllBlocks]);
}
