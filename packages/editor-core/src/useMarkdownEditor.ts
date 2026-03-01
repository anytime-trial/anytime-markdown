"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { preserveBlankLines } from "./utils/sanitizeMarkdown";

const STORAGE_KEY = "markdown-editor-content";
const DEBOUNCE_MS = 500;

export function useMarkdownEditor(defaultContent: string) {
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // localStorage から読み込み
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      setInitialContent(preserveBlankLines(saved ?? defaultContent));
    } catch (e) {
      console.warn("Failed to read localStorage:", e);
      setInitialContent(defaultContent);
    }
    setLoading(false);
  }, [defaultContent]);

  // debounce 自動保存（Tiptap の onUpdate から呼ばれる）
  const saveContent = useCallback((markdown: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, markdown);
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          console.warn("localStorage quota exceeded. Content not saved.");
        } else {
          console.warn("Failed to save to localStorage:", e);
        }
      }
    }, DEBOUNCE_MS);
  }, []);

  // .md ファイルダウンロード（markdown 文字列を受け取る）
  const downloadMarkdown = useCallback((markdown: string) => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    a.download = `document_${ts}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // クリア
  const clearContent = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear localStorage:", e);
    }
  }, []);

  // cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    initialContent,
    loading,
    saveContent,
    downloadMarkdown,
    clearContent,
  };
}
