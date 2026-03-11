import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_KEY_READONLY_MODE,STORAGE_KEY_REVIEW_MODE, STORAGE_KEY_SOURCE_MODE } from "../constants/storageKeys";
import { reviewModeStorage } from "../extensions/reviewModeExtension";
import { getMarkdownFromEditor } from "../types";
import { parseCommentData } from "../utils/commentHelpers";
import { parseFrontmatter, prependFrontmatter } from "../utils/frontmatterHelpers";
import { preserveBlankLines,sanitizeMarkdown } from "../utils/sanitizeMarkdown";

interface UseSourceModeParams {
  editor: Editor | null;
  saveContent: (md: string, withFrontmatter?: boolean) => void;
  t: (key: string) => string;
  frontmatterRef: React.MutableRefObject<string | null>;
}

export function useSourceMode({ editor, saveContent, t, frontmatterRef }: UseSourceModeParams) {
  const [sourceMode, setSourceMode] = useState(() => {
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
      try { localStorage.setItem(STORAGE_KEY_REVIEW_MODE, "false"); } catch { /* ignore */ }
    } else if (readonlyMode) {
      reviewModeStorage(editor).enabled = false;
      editor.view.dom.removeAttribute("data-readonly-mode");
      setReadonlyMode(false);
      try { localStorage.setItem(STORAGE_KEY_READONLY_MODE, "false"); } catch { /* ignore */ }
    }
    editor.commands.closeSearch();
    setSourceText(prependFrontmatter(getMarkdownFromEditor(editor), frontmatterRef.current));
    setSourceMode(true);
    try { localStorage.setItem(STORAGE_KEY_SOURCE_MODE, "true"); } catch { /* ignore */ }
    setLiveMessage(t("switchedToSource"));
  }, [editor, readonlyMode, reviewMode, t, frontmatterRef]);

  /** ソースモードのテキストをエディタに同期し、ソースモードを終了する */
  const syncSourceToEditor = useCallback((ed: Editor, src: string) => {
    const { frontmatter, body: bodyWithoutFm } = parseFrontmatter(src);
    frontmatterRef.current = frontmatter;
    const { comments, body } = parseCommentData(bodyWithoutFm);
    const sanitized = preserveBlankLines(sanitizeMarkdown(body));
    ed.commands.setContent(sanitized);
    if (comments.size > 0) {
      ed.commands.initComments(comments);
    }
    saveContent(src, false);
    setSourceMode(false);
    try { localStorage.setItem(STORAGE_KEY_SOURCE_MODE, "false"); } catch { /* ignore */ }
  }, [saveContent, frontmatterRef]);

  const handleSwitchToWysiwyg = useCallback(() => {
    if (editor) {
      if (reviewMode) {
        reviewModeStorage(editor).enabled = false;
        editor.view.dom.removeAttribute("data-review-mode");
        setReviewMode(false);
        try { localStorage.setItem(STORAGE_KEY_REVIEW_MODE, "false"); } catch { /* ignore */ }
      } else if (readonlyMode) {
        reviewModeStorage(editor).enabled = false;
        editor.view.dom.removeAttribute("data-readonly-mode");
        setReadonlyMode(false);
        try { localStorage.setItem(STORAGE_KEY_READONLY_MODE, "false"); } catch { /* ignore */ }
      }
      if (sourceMode) {
        syncSourceToEditor(editor, sourceText);
      }
    }
    setSourceMode(false);
    try { localStorage.setItem(STORAGE_KEY_SOURCE_MODE, "false"); } catch { /* ignore */ }
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
    try { localStorage.setItem(STORAGE_KEY_READONLY_MODE, "false"); } catch { /* ignore */ }
    try { localStorage.setItem(STORAGE_KEY_REVIEW_MODE, "true"); } catch { /* ignore */ }
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
    try { localStorage.setItem(STORAGE_KEY_READONLY_MODE, "true"); } catch { /* ignore */ }
    try { localStorage.setItem(STORAGE_KEY_REVIEW_MODE, "false"); } catch { /* ignore */ }
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
