import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { getMarkdownFromEditor } from "../types";
import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import { parseCommentData } from "../utils/commentHelpers";

interface UseSourceModeParams {
  editor: Editor | null;
  saveContent: (md: string) => void;
  t: (key: string) => string;
}

const SOURCE_MODE_KEY = "markdown-editor-source-mode";
const VIEWER_MODE_KEY = "markdown-editor-viewer-mode";

export function useSourceMode({ editor, saveContent, t }: UseSourceModeParams) {
  const [sourceMode, setSourceMode] = useState(() => {
    try {
      return localStorage.getItem(SOURCE_MODE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(VIEWER_MODE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [sourceText, setSourceText] = useState("");
  const [liveMessage, setLiveMessage] = useState("");

  // Restore sourceText from editor when reopening in source mode
  useEffect(() => {
    if (sourceMode && editor && !sourceText) {
      setSourceText(getMarkdownFromEditor(editor));
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore viewMode editable state on init
  useEffect(() => {
    if (editor && viewMode) {
      editor.setEditable(false);
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchToSource = useCallback(() => {
    if (!editor) return;
    if (viewMode) {
      editor.setEditable(true);
      setViewMode(false);
      try { localStorage.setItem(VIEWER_MODE_KEY, "false"); } catch { /* ignore */ }
    }
    editor.commands.closeSearch();
    setSourceText(getMarkdownFromEditor(editor));
    setSourceMode(true);
    try { localStorage.setItem(SOURCE_MODE_KEY, "true"); } catch { /* ignore */ }
    setLiveMessage(t("switchedToSource"));
  }, [editor, viewMode, t]);

  const handleSwitchToWysiwyg = useCallback(() => {
    if (editor) {
      if (viewMode) {
        editor.setEditable(true);
        setViewMode(false);
        try { localStorage.setItem(VIEWER_MODE_KEY, "false"); } catch { /* ignore */ }
      }
      if (sourceMode) {
        const { comments, body } = parseCommentData(sourceText);
        const sanitized = preserveBlankLines(sanitizeMarkdown(body));
        editor.commands.setContent(sanitized);
        if (comments.size > 0) {
          (editor.commands as any).initComments(comments);
        }
        saveContent(sourceText);
      }
    }
    setSourceMode(false);
    try { localStorage.setItem(SOURCE_MODE_KEY, "false"); } catch { /* ignore */ }
    setLiveMessage(t("switchedToWysiwyg"));
  }, [editor, sourceMode, viewMode, sourceText, saveContent, t]);

  const handleSwitchToView = useCallback(() => {
    if (!editor) return;
    // Source モードから切り替える場合、まず WYSIWYG に同期
    if (sourceMode) {
      const { comments, body } = parseCommentData(sourceText);
      const sanitized = preserveBlankLines(sanitizeMarkdown(body));
      editor.commands.setContent(sanitized);
      if (comments.size > 0) {
        (editor.commands as any).initComments(comments);
      }
      saveContent(sourceText);
      setSourceMode(false);
      try { localStorage.setItem(SOURCE_MODE_KEY, "false"); } catch { /* ignore */ }
    }
    editor.setEditable(false);
    setViewMode(true);
    try { localStorage.setItem(VIEWER_MODE_KEY, "true"); } catch { /* ignore */ }
    setLiveMessage(t("switchedToView"));
  }, [editor, sourceMode, sourceText, saveContent, t]);

  /** コメント操作用: 一時的に editable を true にしてコマンド実行後に戻す */
  const executeInViewMode = useCallback((fn: () => void) => {
    if (!editor) return;
    editor.setEditable(true);
    try {
      fn();
    } finally {
      // 次のマイクロタスクで editable を戻す（コマンドの非同期処理完了を待つ）
      queueMicrotask(() => {
        editor.setEditable(false);
      });
    }
  }, [editor]);

  const handleSourceChange = useCallback(
    (value: string) => {
      setSourceText(value);
      saveContent(value);
    },
    [saveContent],
  );

  const appendToSource = useCallback(
    (markdown: string) => {
      setSourceText((prev) => {
        const separator = prev.length > 0 && !prev.endsWith("\n") ? "\n" : "";
        const newText = prev + separator + markdown;
        saveContent(newText);
        return newText;
      });
    },
    [saveContent],
  );

  return {
    sourceMode,
    viewMode,
    sourceText,
    setSourceText,
    liveMessage,
    setLiveMessage,
    handleSwitchToSource,
    handleSwitchToWysiwyg,
    handleSwitchToView,
    executeInViewMode,
    handleSourceChange,
    appendToSource,
  };
}
