"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeMarkdown, preserveBlankLines } from "./utils/sanitizeMarkdown";
import { parseCommentData, appendCommentData } from "./utils/commentHelpers";
import type { EncodingLabel } from "./types";

const STORAGE_KEY = "markdown-editor-content";
const DEBOUNCE_MS = 500;

export function useMarkdownEditor(defaultContent: string, skipLocalStorage = false) {
  // localStorage から同期的に読み込み（HMR 時のローディングフラッシュを防止）
  // skipLocalStorage が true の場合（readOnly / externalContent）は localStorage を参照しない
  const [initialContent] = useState<string>(() => {
    try {
      const saved = skipLocalStorage ? null : localStorage.getItem(STORAGE_KEY);
      const raw = saved ?? defaultContent;
      const { comments, body } = parseCommentData(raw);
      const sanitized = preserveBlankLines(sanitizeMarkdown(body));
      return comments.size > 0 ? appendCommentData(sanitized, comments) : sanitized;
    } catch (e) {
      console.warn("Failed to read localStorage:", e);
      return defaultContent;
    }
  });
  const loading = false;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const downloadMarkdown = useCallback(async (markdown: string, encoding?: EncodingLabel) => {
    let blob: Blob;
    if (encoding && encoding !== "UTF-8") {
      const Encoding = (await import("encoding-japanese")).default;
      const unicodeArray = Encoding.stringToCode(markdown);
      const toEnc = encoding === "Shift_JIS" ? "SJIS" : "EUCJP";
      const converted = Encoding.convert(unicodeArray, { to: toEnc, from: "UNICODE" });
      blob = new Blob([new Uint8Array(converted)], { type: "text/markdown" });
    } else {
      blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    a.download = `document_${ts}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // クリア（空文字列を保存して HMR 時に defaultContent にフォールバックしないようにする）
  const clearContent = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "");
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
