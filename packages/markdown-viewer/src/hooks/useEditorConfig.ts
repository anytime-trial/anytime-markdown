import Placeholder from "@tiptap/extension-placeholder";
import type { AnyExtension, Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { useEffect } from "react";

import { DEBOUNCE_MEDIUM } from "../constants/timing";
import { getBaseExtensions } from "../editorExtensions";
import { ChangeGutterExtension } from "../extensions/changeGutterExtension";
import { CustomHardBreak } from "../extensions/customHardBreak";
import { DeleteLineExtension } from "../extensions/deleteLineExtension";
import { ReviewModeExtension } from "../extensions/reviewModeExtension";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import { SlashCommandExtension } from "../extensions/slashCommandExtension";
import { SearchReplaceExtension } from "../searchReplaceExtension";
import {
  extractHeadings,
  getMarkdownFromEditor,
  type HeadingItem,
} from "../types";
import { setTrailingNewline } from "../utils/editorContentLoader";
import { createEditorDOMHandlers } from "./useEditorDOMEvents";

// Re-export for backwards compatibility
export { generateTimestamp, requestExternalImageDownloads,saveClipboardImageViaVscode } from "../utils/editorImageHandlers";

interface HeadingMenuArg {
  anchorEl: HTMLElement;
  pos: number;
  currentLevel: number;
}

interface EditorConfigRefs {
  editor: RefObject<Editor | null>;
  setEditorMarkdown: RefObject<(md: string) => void>;
  setHeadings: RefObject<(h: HeadingItem[]) => void>;
  headingsDebounce: RefObject<ReturnType<typeof setTimeout> | null>;
  handleImport: RefObject<(file: File, nativeHandle?: FileSystemFileHandle) => void | Promise<void>>;
  onFileDragOver: RefObject<(over: boolean) => void>;
  slashCommandCallback: RefObject<(state: SlashCommandState) => void>;
}

interface UseEditorConfigParams {
  t: (key: string) => string;
  initialContent: string | null;
  initialTrailingNewline?: boolean;
  saveContent: (md: string) => void;
  refs: EditorConfigRefs;
  setHeadingMenu: (menu: HeadingMenuArg) => void;
  /** スプレッドシートのグリッド行数 */
  gridRows?: number;
  /** スプレッドシートのグリッド列数 */
  gridCols?: number;
  /** codeBlock 拡張の注入 (rich の CodeBlockWithMermaid)。未指定時は素の CodeBlockLowlight */
  codeBlockExtension?: AnyExtension;
}

export function useEditorConfig({
  t,
  initialContent,
  initialTrailingNewline,
  saveContent,
  refs: {
    editor: editorRef,
    setEditorMarkdown: setEditorMarkdownRef,
    setHeadings: setHeadingsRef,
    headingsDebounce: headingsDebounceRef,
    handleImport: handleImportRef,
    onFileDragOver: onFileDragOverRef,
    slashCommandCallback: slashCommandCallbackRef,
  },
  setHeadingMenu,
  gridRows,
  gridCols,
  codeBlockExtension,
}: UseEditorConfigParams) {
  // Clean up debounce timer on unmount
  // headingsDebounceRef は安定な ref オブジェクトのため依存配列から除外
  useEffect(() => {
    return () => {
      if (headingsDebounceRef.current) clearTimeout(headingsDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editorProps = createEditorDOMHandlers({
    editorRef,
    handleImportRef,
    onFileDragOverRef,
    saveContent,
    setHeadingMenu,
  });

  return {
    extensions: [
      ...getBaseExtensions({ gridRows, gridCols, codeBlockExtension }),
      CustomHardBreak,
      DeleteLineExtension,
      SearchReplaceExtension,
      Placeholder.configure({ placeholder: t("placeholder") }),
      SlashCommandExtension.configure({
        onStateChange: (state: SlashCommandState) => slashCommandCallbackRef.current(state),
      }),
      ReviewModeExtension,
      ChangeGutterExtension,
    ],
    editorProps,
    content: initialContent ?? "",
    autofocus: "start" as const,
    onUpdate: ({ editor: e }: { editor: Editor }) => {
      const md = getMarkdownFromEditor(e);
      saveContent(md);
      setEditorMarkdownRef.current(md);
      if (headingsDebounceRef.current) clearTimeout(headingsDebounceRef.current);
      headingsDebounceRef.current = setTimeout(() => {
        setHeadingsRef.current(extractHeadings(e));
      }, DEBOUNCE_MEDIUM);
    },
    onCreate: ({ editor: e }: { editor: Editor }) => {
      // 初期コンテンツの末尾改行フラグを storage に記録
      // （applyMarkdownToEditor と同じキーで、getMarkdownFromEditor が参照する）
      setTrailingNewline(e, !!initialTrailingNewline);
      setHeadingsRef.current(extractHeadings(e));
      setEditorMarkdownRef.current(getMarkdownFromEditor(e));
      // NOTE: blockquote.storage.markdown.serialize の上書きは禁止。
      // lazy blockquote (`> ` プレフィックスのみ) は AdmonitionBlockquote.serialize の
      // else 分岐で実装済み。ここで上書きすると admonition の `> [!TYPE]` 出力が消失する。
    },
    immediatelyRender: false,
  };
}
