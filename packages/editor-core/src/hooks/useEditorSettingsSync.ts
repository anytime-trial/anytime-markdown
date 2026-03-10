import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import type { EditorSettings } from "../useEditorSettings";

/**
 * エディタ設定の同期を行う副作用フック。
 * - セクション自動番号の表示切替
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
    editor.commands.setShowHeadingNumbers(settings.showHeadingNumbers);
  }, [editor, settings.showHeadingNumbers]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("spellcheck", String(settings.spellCheck));
  }, [editor, settings.spellCheck]);

  useEffect(() => {
    if (options.readOnly && editor) {
      editor.setEditable(false);
    }
  }, [options.readOnly, editor]);

  useEffect(() => {
    if (options.hideFoldAll && editor) options.handleExpandAllBlocks();
  }, [options.hideFoldAll, editor, options.handleExpandAllBlocks]);
}
