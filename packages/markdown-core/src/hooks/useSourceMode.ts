import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_KEY_EDITOR_MODE, STORAGE_KEY_READONLY_MODE, STORAGE_KEY_REVIEW_MODE, STORAGE_KEY_SOURCE_MODE } from "../constants/storageKeys";
import { reviewModeStorage } from "../extensions/reviewModeExtension";
import { getMarkdownFromEditor } from "../types";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { prependFrontmatter } from "../utils/frontmatterHelpers";
import { safeSetItem } from "../utils/storage";

type EditorMode = "wysiwyg" | "source" | "review" | "readonly";

/** 旧3キーから新キーへマイグレーション。旧キーを削除し新キーに書き込む */
function migrateEditorMode(): EditorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_EDITOR_MODE);
    if (stored) return stored as EditorMode;

    // 旧キーからマイグレーション
    let mode: EditorMode = "wysiwyg";
    if (localStorage.getItem(STORAGE_KEY_SOURCE_MODE) === "true") {
      mode = "source";
    } else if (localStorage.getItem(STORAGE_KEY_READONLY_MODE) === "true") {
      mode = "readonly";
    } else if (localStorage.getItem(STORAGE_KEY_REVIEW_MODE) === "true") {
      mode = "review";
    }

    // 旧キーを削除
    localStorage.removeItem(STORAGE_KEY_SOURCE_MODE);
    localStorage.removeItem(STORAGE_KEY_REVIEW_MODE);
    localStorage.removeItem(STORAGE_KEY_READONLY_MODE);

    if (mode !== "wysiwyg") {
      safeSetItem(STORAGE_KEY_EDITOR_MODE, mode);
    }
    return mode;
  } catch {
    return "wysiwyg";
  }
}

interface UseSourceModeParams {
  editor: Editor | null;
  saveContent: (md: string, withFrontmatter?: boolean) => void;
  t: (key: string) => string;
  frontmatterRef: React.RefObject<string | null>;
  defaultSourceMode?: boolean;
  onModeChange?: (mode: EditorMode) => void;
}

export function useSourceMode({ editor, saveContent, t, frontmatterRef, defaultSourceMode, onModeChange }: UseSourceModeParams) {
  const [initialMode] = useState(() => {
    if (defaultSourceMode) return "source" as EditorMode;
    return migrateEditorMode();
  });
  const [sourceMode, setSourceMode] = useState(defaultSourceMode ?? initialMode === "source");
  const [readonlyMode, setReadonlyMode] = useState(initialMode === "readonly");
  const [reviewMode, setReviewMode] = useState(initialMode === "review");
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
      editor.view.dom.dataset.reviewMode = "true";
    } else if (readonlyMode) {
      reviewModeStorage(editor).enabled = true;
      editor.view.dom.dataset.readonlyMode = "true";
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  const setEditorMode = useCallback((mode: EditorMode) => {
    setSourceMode(mode === "source");
    setReviewMode(mode === "review");
    setReadonlyMode(mode === "readonly");
    if (mode === "wysiwyg") {
      localStorage.removeItem(STORAGE_KEY_EDITOR_MODE);
    } else {
      safeSetItem(STORAGE_KEY_EDITOR_MODE, mode);
    }
    onModeChange?.(mode);
  }, [onModeChange]);

  const handleSwitchToSource = useCallback(() => {
    if (!editor) return;
    if (reviewMode) {
      reviewModeStorage(editor).enabled = false;
      delete editor.view.dom.dataset.reviewMode;
    } else if (readonlyMode) {
      reviewModeStorage(editor).enabled = false;
      delete editor.view.dom.dataset.readonlyMode;
    }
    editor.commands.closeSearch();
    setSourceText(prependFrontmatter(getMarkdownFromEditor(editor), frontmatterRef.current));
    setEditorMode("source");
    setLiveMessage(t("switchedToSource"));
  }, [editor, readonlyMode, reviewMode, t, frontmatterRef, setEditorMode]);

  /** ソースモードのテキストをエディタに同期し、ソースモードを終了する */
  const syncSourceToEditor = useCallback((ed: Editor, src: string) => {
    const { frontmatter } = applyMarkdownToEditor(ed, src);
    frontmatterRef.current = frontmatter;
    saveContent(src, false);
    setEditorMode("wysiwyg");
  }, [saveContent, frontmatterRef, setEditorMode]);

  const handleSwitchToWysiwyg = useCallback(() => {
    if (editor) {
      if (reviewMode) {
        reviewModeStorage(editor).enabled = false;
        delete editor.view.dom.dataset.reviewMode;
      } else if (readonlyMode) {
        reviewModeStorage(editor).enabled = false;
        delete editor.view.dom.dataset.readonlyMode;
      }
      if (sourceMode) {
        syncSourceToEditor(editor, sourceText);
      }
    }
    setEditorMode("wysiwyg");
    setLiveMessage(t("switchedToWysiwyg"));
  }, [editor, sourceMode, readonlyMode, reviewMode, sourceText, syncSourceToEditor, t, setEditorMode]);

  const handleSwitchToReview = useCallback(() => {
    if (!editor) return;
    // Source モードから切り替える場合、まず WYSIWYG に同期
    if (sourceMode) {
      syncSourceToEditor(editor, sourceText);
    }
    // Readonly モードから切り替える場合、フィルタを解除
    if (readonlyMode) {
      reviewModeStorage(editor).enabled = false;
      delete editor.view.dom.dataset.readonlyMode;
    }
    reviewModeStorage(editor).enabled = true;
    editor.view.dom.dataset.reviewMode = "true";
    setEditorMode("review");
    setLiveMessage(t("switchedToReview"));
  }, [editor, sourceMode, readonlyMode, sourceText, syncSourceToEditor, t, setEditorMode]);

  const handleSwitchToReadonly = useCallback(() => {
    if (!editor) return;
    // Source モードから切り替える場合、まず WYSIWYG に同期
    if (sourceMode) {
      syncSourceToEditor(editor, sourceText);
    }
    // Review モードから切り替える場合、属性を切り替え
    if (reviewMode) {
      delete editor.view.dom.dataset.reviewMode;
    }
    reviewModeStorage(editor).enabled = true;
    editor.view.dom.dataset.readonlyMode = "true";
    setEditorMode("readonly");
    setLiveMessage(t("switchedToReadonly"));
  }, [editor, sourceMode, reviewMode, sourceText, syncSourceToEditor, t, setEditorMode]);

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
