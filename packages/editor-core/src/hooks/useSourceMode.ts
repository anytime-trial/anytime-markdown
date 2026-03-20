import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_KEY_READONLY_MODE,STORAGE_KEY_REVIEW_MODE, STORAGE_KEY_SOURCE_MODE } from "../constants/storageKeys";
import { reviewModeStorage } from "../extensions/reviewModeExtension";
import { getMarkdownFromEditor } from "../types";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { prependFrontmatter } from "../utils/frontmatterHelpers";
import { safeSetItem } from "../utils/storage";

interface UseSourceModeParams {
  editor: Editor | null;
  saveContent: (md: string, withFrontmatter?: boolean) => void;
  t: (key: string) => string;
  frontmatterRef: React.MutableRefObject<string | null>;
  defaultSourceMode?: boolean;
}

export function useSourceMode({ editor, saveContent, t, frontmatterRef, defaultSourceMode }: UseSourceModeParams) {
  const [sourceMode, setSourceMode] = useState(() => {
    if (defaultSourceMode !== undefined) return defaultSourceMode;
    try {
      return localStorage.getItem(STORAGE_KEY_SOURCE_MODE) === "true";
    } catch {
      return false;
    }
  });
  const [readonlyMode, setReadonlyMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_READONLY_MODE) === "true";
    } catch {
      return false;
    }
  });
  const [reviewMode, setReviewMode] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_REVIEW_MODE);
      // readonlyMode が有効な場合は reviewMode を無効化
      if (localStorage.getItem(STORAGE_KEY_READONLY_MODE) === "true") return false;
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  const [sourceText, setSourceText] = useState("");
  const [liveMessage, setLiveMessage] = useState("");

  // Restore sourceText from editor when reopening in source mode
  useEffect(() => {
    if (sourceMode && editor && !sourceText) {
      setSourceText(prependFrontmatter(getMarkdownFromEditor(editor), frontmatterRef.current));
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore readonly/review state on init
  useEffect(() => {
    if (!editor) return;
    if (reviewMode) {
      reviewModeStorage(editor).enabled = true;
      editor.view.dom.setAttribute("data-review-mode", "true");
    } else if (readonlyMode) {
      reviewModeStorage(editor).enabled = true;
      editor.view.dom.setAttribute("data-readonly-mode", "true");
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchToSource = useCallback(() => {
    if (!editor) return;
    if (reviewMode) {
      reviewModeStorage(editor).enabled = false;
      editor.view.dom.removeAttribute("data-review-mode");
      setReviewMode(false);
      safeSetItem(STORAGE_KEY_REVIEW_MODE, "false");
    } else if (readonlyMode) {
      reviewModeStorage(editor).enabled = false;
      editor.view.dom.removeAttribute("data-readonly-mode");
      setReadonlyMode(false);
      safeSetItem(STORAGE_KEY_READONLY_MODE, "false");
    }
    editor.commands.closeSearch();
    setSourceText(prependFrontmatter(getMarkdownFromEditor(editor), frontmatterRef.current));
    setSourceMode(true);
    safeSetItem(STORAGE_KEY_SOURCE_MODE, "true");
    setLiveMessage(t("switchedToSource"));
  }, [editor, readonlyMode, reviewMode, t, frontmatterRef]);

  /** ソースモードのテキストをエディタに同期し、ソースモードを終了する */
  const syncSourceToEditor = useCallback((ed: Editor, src: string) => {
    const { frontmatter } = applyMarkdownToEditor(ed, src);
    frontmatterRef.current = frontmatter;
    saveContent(src, false);
    setSourceMode(false);
    safeSetItem(STORAGE_KEY_SOURCE_MODE, "false");
  }, [saveContent, frontmatterRef]);

  const handleSwitchToWysiwyg = useCallback(() => {
    if (editor) {
      if (reviewMode) {
        reviewModeStorage(editor).enabled = false;
        editor.view.dom.removeAttribute("data-review-mode");
        setReviewMode(false);
        safeSetItem(STORAGE_KEY_REVIEW_MODE, "false");
      } else if (readonlyMode) {
        reviewModeStorage(editor).enabled = false;
        editor.view.dom.removeAttribute("data-readonly-mode");
        setReadonlyMode(false);
        safeSetItem(STORAGE_KEY_READONLY_MODE, "false");
      }
      if (sourceMode) {
        syncSourceToEditor(editor, sourceText);
      }
    }
    setSourceMode(false);
    safeSetItem(STORAGE_KEY_SOURCE_MODE, "false");
    setLiveMessage(t("switchedToWysiwyg"));
  }, [editor, sourceMode, readonlyMode, reviewMode, sourceText, syncSourceToEditor, t]);

  const handleSwitchToReview = useCallback(() => {
    if (!editor) return;
    // Source モードから切り替える場合、まず WYSIWYG に同期
    if (sourceMode) {
      syncSourceToEditor(editor, sourceText);
    }
    // Readonly モードから切り替える場合、フィルタを解除
    if (readonlyMode) {
      reviewModeStorage(editor).enabled = false;
      editor.view.dom.removeAttribute("data-readonly-mode");
    }
    reviewModeStorage(editor).enabled = true;
    editor.view.dom.setAttribute("data-review-mode", "true");
    setReadonlyMode(false);
    setReviewMode(true);
    safeSetItem(STORAGE_KEY_READONLY_MODE, "false");
    safeSetItem(STORAGE_KEY_REVIEW_MODE, "true");
    setLiveMessage(t("switchedToReview"));
  }, [editor, sourceMode, readonlyMode, sourceText, syncSourceToEditor, t]);

  const handleSwitchToReadonly = useCallback(() => {
    if (!editor) return;
    // Source モードから切り替える場合、まず WYSIWYG に同期
    if (sourceMode) {
      syncSourceToEditor(editor, sourceText);
    }
    // Review モードから切り替える場合、属性を切り替え
    if (reviewMode) {
      editor.view.dom.removeAttribute("data-review-mode");
    }
    reviewModeStorage(editor).enabled = true;
    editor.view.dom.setAttribute("data-readonly-mode", "true");
    setReadonlyMode(true);
    setReviewMode(false);
    safeSetItem(STORAGE_KEY_READONLY_MODE, "true");
    safeSetItem(STORAGE_KEY_REVIEW_MODE, "false");
    setLiveMessage(t("switchedToReadonly"));
  }, [editor, sourceMode, reviewMode, sourceText, syncSourceToEditor, t]);

  /** コメント操作用: 一時的にレビューモードのフィルタを解除してコマンド実行後に戻す */
  const executeInReviewMode = useCallback((fn: () => void) => {
    if (!editor) return;
    reviewModeStorage(editor).enabled = false;
    try {
      fn();
    } finally {
      queueMicrotask(() => {
        reviewModeStorage(editor).enabled = true;
      });
    }
  }, [editor]);

  const handleSourceChange = useCallback(
    (value: string) => {
      setSourceText(value);
      saveContent(value, false);
    },
    [saveContent],
  );

  const appendToSource = useCallback(
    (markdown: string) => {
      setSourceText((prev) => {
        const separator = prev.length > 0 && !prev.endsWith("\n") ? "\n" : "";
        const newText = prev + separator + markdown;
        saveContent(newText, false);
        return newText;
      });
    },
    [saveContent],
  );

  return {
    sourceMode,
    readonlyMode,
    reviewMode,
    sourceText,
    setSourceText,
    liveMessage,
    setLiveMessage,
    handleSwitchToSource,
    handleSwitchToWysiwyg,
    handleSwitchToReview,
    handleSwitchToReadonly,
    executeInReviewMode,
    handleSourceChange,
    appendToSource,
  };
}
