import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { EncodingLabel, MarkdownStorage } from "../types";
import { getMarkdownFromEditor } from "../types";
import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";

interface UseEditorFileHandlingArgs {
  editor: Editor | null;
  sourceMode: boolean;
  sourceText: string;
  handleSourceChange: (text: string) => void;
  setSourceText: (text: string) => void;
  saveContent: (md: string) => void;
  fileHandle: { nativeHandle?: unknown } | null;
  frontmatterRef: React.MutableRefObject<string | null>;
  initialFrontmatter: string | null;
}

interface UseEditorFileHandlingResult {
  encoding: EncodingLabel;
  setEncoding: (e: EncodingLabel) => void;
  frontmatterText: string | null;
  setFrontmatterText: (v: string | null) => void;
  handleLineEndingChange: (ending: "LF" | "CRLF") => void;
  handleEncodingChange: (newEncoding: EncodingLabel) => Promise<void>;
  handleFrontmatterChange: (value: string | null) => void;
}

/**
 * ファイルエンコーディング・改行コード・frontmatter の変更ハンドラを管理する。
 */
export function useEditorFileHandling({
  editor,
  sourceMode,
  sourceText,
  handleSourceChange,
  setSourceText,
  saveContent,
  fileHandle,
  frontmatterRef,
  initialFrontmatter,
}: UseEditorFileHandlingArgs): UseEditorFileHandlingResult {
  const [encoding, setEncoding] = useState<EncodingLabel>("UTF-8");
  const [frontmatterText, setFrontmatterText] = useState<string | null>(initialFrontmatter);

  const handleLineEndingChange = useCallback(
    (ending: "LF" | "CRLF") => {
      const convert = (text: string) =>
        ending === "CRLF"
          ? text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
          : text.replace(/\r\n/g, "\n");

      if (sourceMode) {
        handleSourceChange(convert(sourceText));
      } else if (editor) {
        const md = convert(getMarkdownFromEditor(editor));
        setSourceText(md);
        editor.commands.setContent(preserveBlankLines(sanitizeMarkdown(md)));
        saveContent(md);
      }
    },
    [sourceMode, sourceText, handleSourceChange, editor, setSourceText, saveContent],
  );

  const handleEncodingChange = useCallback(
    async (newEncoding: EncodingLabel) => {
      setEncoding(newEncoding);
      // fileHandle がある場合、ファイルを新しいエンコーディングで再読み込み
      if (fileHandle?.nativeHandle) {
        try {
          const nativeHandle = fileHandle.nativeHandle as FileSystemFileHandle;
          const file = await nativeHandle.getFile();
          const buffer = await file.arrayBuffer();
          const decoder = new TextDecoder(newEncoding.toLowerCase());
          const decoded = sanitizeMarkdown(decoder.decode(buffer));
          if (sourceMode) {
            setSourceText(decoded);
          } else if (editor) {
            editor.commands.setContent(
              (editor.storage as unknown as MarkdownStorage).markdown.parser.parse(
                preserveBlankLines(decoded),
              ),
            );
          }
          saveContent(decoded);
        } catch (e) {
          console.warn("Failed to re-read file with encoding:", newEncoding, e);
        }
      }
    },
    [fileHandle, sourceMode, setSourceText, editor, saveContent],
  );

  const handleFrontmatterChange = useCallback(
    (value: string | null) => {
      frontmatterRef.current = value;
      setFrontmatterText(value);
      if (editor) {
        saveContent(getMarkdownFromEditor(editor));
      }
    },
    [editor, saveContent, frontmatterRef],
  );

  return {
    encoding,
    setEncoding,
    frontmatterText,
    setFrontmatterText,
    handleLineEndingChange,
    handleEncodingChange,
    handleFrontmatterChange,
  };
}
