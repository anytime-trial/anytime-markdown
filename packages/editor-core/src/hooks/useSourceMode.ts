import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/react";
import { getMarkdownFromEditor } from "../types";
import { sanitizeMarkdown } from "../utils/sanitizeMarkdown";

interface UseSourceModeParams {
  editor: Editor | null;
  saveContent: (md: string) => void;
  t: (key: string) => string;
}

export function useSourceMode({ editor, saveContent, t }: UseSourceModeParams) {
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [liveMessage, setLiveMessage] = useState("");

  const handleSwitchToSource = useCallback(() => {
    if (!editor) return;
    editor.commands.closeSearch();
    setSourceText(getMarkdownFromEditor(editor));
    setSourceMode(true);
    setLiveMessage(t("switchedToSource"));
  }, [editor, t]);

  const handleSwitchToWysiwyg = useCallback(() => {
    if (editor) {
      const sanitized = sanitizeMarkdown(sourceText);
      editor.commands.setContent(sanitized);
      saveContent(sanitized);
    }
    setSourceMode(false);
    setLiveMessage(t("switchedToWysiwyg"));
  }, [editor, sourceText, saveContent, t]);

  const handleSourceChange = useCallback(
    (value: string) => {
      setSourceText(value);
      saveContent(value);
    },
    [saveContent],
  );

  const appendToSource = useCallback(
    (markdown: string) => {
      setSourceText((prev) => {
        const separator = prev.length > 0 && !prev.endsWith("\n") ? "\n" : "";
        const newText = prev + separator + markdown;
        saveContent(newText);
        return newText;
      });
    },
    [saveContent],
  );

  return {
    sourceMode,
    sourceText,
    setSourceText,
    liveMessage,
    setLiveMessage,
    handleSwitchToSource,
    handleSwitchToWysiwyg,
    handleSourceChange,
    appendToSource,
  };
}
