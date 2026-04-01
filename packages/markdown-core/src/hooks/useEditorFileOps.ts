import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useRef } from "react";

import useConfirm from "@/hooks/useConfirm";

import { type EncodingLabel,getMarkdownFromEditor } from "../types";
import type { FileHandle } from "../types/fileSystem";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { readFileAsText } from "../utils/fileReading";
import { prependFrontmatter } from "../utils/frontmatterHelpers";

import { useNotification } from "./useNotification";
import { usePdfExport } from "./usePdfExport";

// Re-export for backwards compatibility
export type { NotificationKey } from "./useNotification";

interface UseEditorFileOpsParams {
  editor: Editor | null;
  sourceMode: boolean;
  sourceText: string;
  setSourceText: Dispatch<SetStateAction<string>>;
  saveContent: (md: string) => void;
  downloadMarkdown: (md: string, encoding?: EncodingLabel) => void;
  clearContent: () => void;
  openFile?: () => Promise<string | null>;
  saveFile?: (content: string) => Promise<boolean>;
  saveAsFile?: (content: string) => Promise<boolean>;
  resetFile?: () => void;
  encoding?: EncodingLabel;
  fileHandle?: FileHandle | null;
  setFileHandle?: (handle: FileHandle | null) => void;
  frontmatterRef: React.RefObject<string | null>;
  onFrontmatterChange?: (value: string | null) => void;
  onExternalSave?: (content: string) => void;
}

export function useEditorFileOps({
  editor,
  sourceMode,
  sourceText,
  setSourceText,
  saveContent: _saveContent,
  downloadMarkdown,
  clearContent,
  openFile,
  saveFile,
  saveAsFile,
  resetFile,
  encoding,
  fileHandle,
  setFileHandle,
  frontmatterRef,
  onFrontmatterChange,
  onExternalSave,
}: UseEditorFileOpsParams) {
  const { notification, setNotification, showNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const t = useTranslations("MarkdownEditor");

  /** エディタからフロントマター付き Markdown を取得する */
  const getFullMarkdown = useCallback(() => {
    const editorMd = editor ? getMarkdownFromEditor(editor) : "";
    const md = sourceMode ? sourceText : editorMd;
    return sourceMode ? md : prependFrontmatter(md, frontmatterRef.current);
  }, [sourceMode, sourceText, editor, frontmatterRef]);

  const handleClear = useCallback(async () => {
    try {
      await confirm({
        open: true,
        title: t("clear"),
        icon: "alert",
        description: t("clearConfirm"),
      });
    } catch {
      return;
    }
    if (sourceMode) {
      setSourceText("");
    } else {
      editor?.commands.clearContent();
      editor?.commands.initComments(new Map());
    }
    frontmatterRef.current = null;
    clearContent();
    resetFile?.();
  }, [confirm, t, sourceMode, setSourceText, editor, clearContent, resetFile, frontmatterRef]);

  /** Markdown テキストをエディタに適用する共通処理 */
  const applyMarkdownContent = useCallback(
    (text: string) => {
      if (sourceMode) {
        setSourceText(text);
      } else if (editor) {
        const { frontmatter } = applyMarkdownToEditor(editor, text);
        frontmatterRef.current = frontmatter;
        onFrontmatterChange?.(frontmatter);
      }
    },
    [sourceMode, setSourceText, editor, frontmatterRef, onFrontmatterChange],
  );

  const handleImport = useCallback(
    (file: File, nativeHandle?: FileSystemFileHandle) => {
      if (!file.name.endsWith(".md") && !file.type.startsWith("text/")) return;
      readFileAsText(file).then(({ text }) => {
        setFileHandle?.(nativeHandle ? { name: file.name, nativeHandle } : { name: file.name });
        applyMarkdownContent(text);
      }).catch((err) => {
        console.warn("Failed to read file:", err);
      });
    },
    [applyMarkdownContent, setFileHandle],
  );

  const handleFileSelected = useCallback(async (file: File, nativeHandle?: FileSystemFileHandle) => {
    const hasContent = sourceMode ? sourceText.trim() !== "" : !editor?.isEmpty;
    if (hasContent) {
      try {
        await confirm({
          open: true,
          title: t("import"),
          icon: "info",
          description: t("importConfirm"),
        });
      } catch {
        return;
      }
    }
    handleImport(file, nativeHandle);
  }, [sourceMode, sourceText, editor, confirm, t, handleImport]);

  const handleDownload = useCallback(() => {
    let md = getFullMarkdown();
    if (md && !md.endsWith("\n")) md += "\n";
    downloadMarkdown(md, encoding);
  }, [getFullMarkdown, downloadMarkdown, encoding]);

  const handleCopy = useCallback(async () => {
    const md = getFullMarkdown();
    await navigator.clipboard.writeText(md);
    showNotification("copiedToClipboard");
  }, [getFullMarkdown, showNotification]);

  const handleOpenFile = useCallback(async () => {
    if (!openFile) return;
    const hasContent = sourceMode ? sourceText.trim() !== "" : !editor?.isEmpty;
    if (hasContent) {
      try {
        await confirm({
          open: true,
          title: t("openFile"),
          icon: "info",
          description: t("importConfirm"),
        });
      } catch {
        return;
      }
    }
    const content = await openFile();
    if (content === null) return;
    applyMarkdownContent(content);
  }, [openFile, applyMarkdownContent, sourceMode, sourceText, editor, confirm, t]);

  const handleSaveFile = useCallback(async () => {
    let md = getFullMarkdown();
    if (md && !md.endsWith("\n")) md += "\n";
    if (onExternalSave) {
      onExternalSave(md);
    } else if (saveFile) {
      if (encoding && encoding !== "UTF-8" && fileHandle?.nativeHandle) {
        const nativeHandle = fileHandle.nativeHandle as FileSystemFileHandle;
        const Encoding = (await import("encoding-japanese")).default;
        const unicodeArray = Encoding.stringToCode(md);
        const toEnc = encoding === "Shift_JIS" ? "SJIS" : "EUCJP";
        const converted = Encoding.convert(unicodeArray, { to: toEnc, from: "UNICODE" });
        const writable = await nativeHandle.createWritable();
        await writable.write(new Uint8Array(converted));
        await writable.close();
      } else {
        const saved = await saveFile(md);
        if (!saved) return;
      }
    } else {
      return;
    }
    showNotification("fileSaved");
  }, [saveFile, onExternalSave, getFullMarkdown, showNotification, encoding, fileHandle]);

  const handleSaveAsFile = useCallback(async () => {
    if (!saveAsFile) return;
    let md = getFullMarkdown();
    if (md && !md.endsWith("\n")) md += "\n";
    const saved = await saveAsFile(md);
    if (saved) showNotification("fileSaved");
  }, [saveAsFile, getFullMarkdown, showNotification]);

  const { pdfExporting, handleExportPdf } = usePdfExport({ editor, showNotification });

  return {
    notification,
    setNotification,
    showNotification,
    pdfExporting,
    fileInputRef,
    handleClear,
    handleFileSelected,
    handleDownload,
    handleImport,
    handleCopy,
    handleOpenFile,
    handleSaveFile,
    handleSaveAsFile,
    handleExportPdf,
  };
}
