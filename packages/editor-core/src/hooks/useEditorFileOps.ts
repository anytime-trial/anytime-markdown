import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import useConfirm from "@/hooks/useConfirm";
import { getMarkdownFromEditor, type MarkdownStorage } from "../types";
import { sanitizeMarkdown } from "../utils/sanitizeMarkdown";

interface UseEditorFileOpsParams {
  editor: Editor | null;
  sourceMode: boolean;
  sourceText: string;
  setSourceText: Dispatch<SetStateAction<string>>;
  saveContent: (md: string) => void;
  downloadMarkdown: (md: string) => void;
  clearContent: () => void;
}

export function useEditorFileOps({
  editor,
  sourceMode,
  sourceText,
  setSourceText,
  saveContent,
  downloadMarkdown,
  clearContent,
}: UseEditorFileOpsParams) {
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const t = useTranslations("MarkdownEditor");

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
    }
    clearContent();
  }, [confirm, t, sourceMode, setSourceText, editor, clearContent]);

  const handleImport = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".md") && !file.type.startsWith("text/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") return;
        if (sourceMode) {
          setSourceText(sanitizeMarkdown(reader.result));
        } else if (editor) {
          editor.commands.setContent(
            (editor.storage as unknown as MarkdownStorage).markdown.parser.parse(
              sanitizeMarkdown(reader.result),
            ),
          );
        }
      };
      reader.readAsText(file);
    },
    [sourceMode, setSourceText, editor],
  );

  const handleFileSelected = useCallback(async (file: File) => {
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
    handleImport(file);
  }, [sourceMode, sourceText, editor, confirm, t, handleImport]);

  const handleDownload = useCallback(() => {
    const md = sourceMode ? sourceText : editor ? getMarkdownFromEditor(editor) : "";
    downloadMarkdown(md);
  }, [sourceMode, sourceText, editor, downloadMarkdown]);

  const handleCopy = useCallback(async () => {
    const md = sourceMode ? sourceText : editor ? getMarkdownFromEditor(editor) : "";
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sourceMode, sourceText, editor]);

  return {
    copied,
    fileInputRef,
    handleClear,
    handleFileSelected,
    handleDownload,
    handleImport,
    handleCopy,
  };
}
