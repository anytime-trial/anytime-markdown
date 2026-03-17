"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { STORAGE_KEY_CONTENT } from "./constants/storageKeys";
import type { EncodingLabel } from "./types";
import { appendCommentData } from "./utils/commentHelpers";
import { preprocessMarkdown, prependFrontmatter } from "./utils/frontmatterHelpers";
const DEBOUNCE_MS = 500;

export interface UseMarkdownEditorReturn {
  initialContent: string;
  loading: boolean;
  saveContent: (markdown: string, withFrontmatter?: boolean) => void;
  downloadMarkdown: (markdown: string, encoding?: EncodingLabel) => Promise<void>;
  clearContent: () => void;
  frontmatterRef: React.RefObject<string | null>;
  initialTrailingNewline: boolean;
}

export function useMarkdownEditor(defaultContent: string, skipLocalStorage = false): UseMarkdownEditorReturn {
  // フロントマターをエディタ外で保持する ref
  const frontmatterRef = useRef<string | null>(null);
  // 元テキストの末尾改行の有無（エディタの onCreate で storage に記録するため）
  const initialTrailingNewline = useRef(false);
  // localStorage から同期的に読み込み（HMR 時のローディングフラッシュを防止）
  // skipLocalStorage が true の場合（readOnly / externalContent）は localStorage を参照しない
  const [initialContent] = useState<string>(() => {
    try {
      const saved = skipLocalStorage ? null : localStorage.getItem(STORAGE_KEY_CONTENT);
      const raw = saved ?? defaultContent;
      initialTrailingNewline.current = raw.endsWith("\n");
      const { frontmatter, comments, body } = preprocessMarkdown(raw);
      frontmatterRef.current = frontmatter;
      return comments.size > 0 ? appendCommentData(body, comments) : body;
    } catch (e) {
      console.warn("Failed to read localStorage:", e);
      return defaultContent;
    }
  });
  const loading = false;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // debounce 自動保存（Tiptap の onUpdate から呼ばれる）
  // withFrontmatter=true の場合、frontmatterRef の内容を先頭に付加して保存する
  // skipLocalStorage が true の場合（externalContent 表示中）は localStorage に書き込まない
  const saveContent = useCallback((markdown: string, withFrontmatter = true) => {
    if (skipLocalStorage) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const toSave = withFrontmatter ? prependFrontmatter(markdown, frontmatterRef.current) : markdown;
        localStorage.setItem(STORAGE_KEY_CONTENT, toSave);
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          console.warn("localStorage quota exceeded. Content not saved.");
        } else {
          console.warn("Failed to save to localStorage:", e);
        }
      }
    }, DEBOUNCE_MS);
  }, [skipLocalStorage]);

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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // クリア（空文字列を保存して HMR 時に defaultContent にフォールバックしないようにする）
  const clearContent = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONTENT, "");
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
    frontmatterRef,
    initialTrailingNewline: initialTrailingNewline.current,
  };
}
