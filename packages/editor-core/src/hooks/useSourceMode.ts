import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { getMarkdownFromEditor } from "../types";
import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import { parseCommentData } from "../utils/commentHelpers";
import { parseFrontmatter, prependFrontmatter } from "../utils/frontmatterHelpers";
import { reviewModeStorage } from "../extensions/reviewModeExtension";

interface UseSourceModeParams {
  editor: Editor | null;
  saveContent: (md: string, withFrontmatter?: boolean) => void;
  t: (key: string) => string;
  frontmatterRef: React.MutableRefObject<string | null>;
}

const SOURCE_MODE_KEY = "markdown-editor-source-mode";
const REVIEW_MODE_KEY = "markdown-editor-review-mode";
const READONLY_MODE_KEY = "markdown-editor-readonly-mode";

export function useSourceMode({ editor, saveContent, t, frontmatterRef }: UseSourceModeParams) {
  const [sourceMode, setSourceMode] = useState(() => {
    try {
      return localStorage.getItem(SOURCE_MODE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [readonlyMode, setReadonlyMode] = useState(() => {
    try {
      return localStorage.getItem(READONLY_MODE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [reviewMode, setReviewMode] = useState(() => {
    try {
      const stored = localStorage.getItem(REVIEW_MODE_KEY);
      // readonlyMode が有効な場合は reviewMode を無効化
      if (localStorage.getItem(READONLY_MODE_KEY) === "true") return false;
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
      try { localStorage.setItem(REVIEW_MODE_KEY, "false"); } catch { /* ignore */ }
    } else if (readonlyMode) {
      reviewModeStorage(editor).enabled = false;
      editor.view.dom.removeAttribute("data-readonly-mode");
      setReadonlyMode(false);
      try { localStorage.setItem(READONLY_MODE_KEY, "false"); } catch { /* ignore */ }
    }
    editor.commands.closeSearch();
    setSourceText(prependFrontmatter(getMarkdownFromEditor(editor), frontmatterRef.current));
    setSourceMode(true);
    try { localStorage.setItem(SOURCE_MODE_KEY, "true"); } catch { /* ignore */ }
    setLiveMessage(t("switchedToSource"));
  }, [editor, readonlyMode, reviewMode, t, frontmatterRef]);

  const handleSwitchToWysiwyg = useCallback(() => {
    if (editor) {
      if (reviewMode) {
        reviewModeStorage(editor).enabled = false;
        editor.view.dom.removeAttribute("data-review-mode");
        setReviewMode(false);
        try { localStorage.setItem(REVIEW_MODE_KEY, "false"); } catch { /* ignore */ }
      } else if (readonlyMode) {
        reviewModeStorage(editor).enabled = false;
        editor.view.dom.removeAttribute("data-readonly-mode");
        setReadonlyMode(false);
        try { localStorage.setItem(READONLY_MODE_KEY, "false"); } catch { /* ignore */ }
      }
      if (sourceMode) {
        const { frontmatter, body: bodyWithoutFm } = parseFrontmatter(sourceText);
        frontmatterRef.current = frontmatter;
        const { comments, body } = parseCommentData(bodyWithoutFm);
        const sanitized = preserveBlankLines(sanitizeMarkdown(body));
        editor.commands.setContent(sanitized);
        if (comments.size > 0) {
          (editor.commands as any).initComments(comments);
        }
        saveContent(sourceText, false);
      }
    }
    setSourceMode(false);
    try { localStorage.setItem(SOURCE_MODE_KEY, "false"); } catch { /* ignore */ }
    setLiveMessage(t("switchedToWysiwyg"));
  }, [editor, sourceMode, readonlyMode, reviewMode, sourceText, saveContent, t, frontmatterRef]);

  const handleSwitchToReview = useCallback(() => {
    if (!editor) return;
    // Source モードから切り替える場合、まず WYSIWYG に同期
    if (sourceMode) {
      const { frontmatter, body: bodyWithoutFm } = parseFrontmatter(sourceText);
      frontmatterRef.current = frontmatter;
      const { comments, body } = parseCommentData(bodyWithoutFm);
      const sanitized = preserveBlankLines(sanitizeMarkdown(body));
      editor.commands.setContent(sanitized);
      if (comments.size > 0) {
        (editor.commands as any).initComments(comments);
      }
      saveContent(sourceText, false);
      setSourceMode(false);
      try { localStorage.setItem(SOURCE_MODE_KEY, "false"); } catch { /* ignore */ }
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
    try { localStorage.setItem(READONLY_MODE_KEY, "false"); } catch { /* ignore */ }
    try { localStorage.setItem(REVIEW_MODE_KEY, "true"); } catch { /* ignore */ }
    setLiveMessage(t("switchedToReview"));
  }, [editor, sourceMode, readonlyMode, sourceText, saveContent, t, frontmatterRef]);

  const handleSwitchToReadonly = useCallback(() => {
    if (!editor) return;
    // Source モードから切り替える場合、まず WYSIWYG に同期
    if (sourceMode) {
      const { frontmatter, body: bodyWithoutFm } = parseFrontmatter(sourceText);
      frontmatterRef.current = frontmatter;
      const { comments, body } = parseCommentData(bodyWithoutFm);
      const sanitized = preserveBlankLines(sanitizeMarkdown(body));
      editor.commands.setContent(sanitized);
      if (comments.size > 0) {
        (editor.commands as any).initComments(comments);
      }
      saveContent(sourceText, false);
      setSourceMode(false);
      try { localStorage.setItem(SOURCE_MODE_KEY, "false"); } catch { /* ignore */ }
    }
    // Review モードから切り替える場合、属性を切り替え
    if (reviewMode) {
      editor.view.dom.removeAttribute("data-review-mode");
    }
    reviewModeStorage(editor).enabled = true;
    editor.view.dom.setAttribute("data-readonly-mode", "true");
    setReadonlyMode(true);
    setReviewMode(false);
    try { localStorage.setItem(READONLY_MODE_KEY, "true"); } catch { /* ignore */ }
    try { localStorage.setItem(REVIEW_MODE_KEY, "false"); } catch { /* ignore */ }
    setLiveMessage(t("switchedToReadonly"));
  }, [editor, sourceMode, reviewMode, sourceText, saveContent, t, frontmatterRef]);

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
