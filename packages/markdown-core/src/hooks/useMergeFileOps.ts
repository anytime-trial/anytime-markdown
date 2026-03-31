import type React from "react";
import { useEffect, useRef, useState } from "react";

import { readFileAsText } from "../utils/fileReading";

interface FileMetadata {
  encoding: string;
  lineEnding: string;
}

const DEFAULT_METADATA: FileMetadata = { encoding: "UTF-8", lineEnding: "LF" };

interface UseMergeFileOpsParams {
  compareText: string;
  setCompareText: (text: string) => void;
  onRightFileOpsReady?: (ops: { loadFile: () => void; exportFile: () => void }) => void;
  externalRightContent?: string | null;
  onExternalRightContentConsumed?: () => void;
  downloadMarkdown: (text: string, filename: string) => void;
}

interface UseMergeFileOpsReturn {
  rightDragOver: boolean;
  setRightDragOver: (v: boolean) => void;
  fileInputRightRef: React.RefObject<HTMLInputElement | null>;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDragDropFile: (file: File) => void;
}

export function useMergeFileOps({
  compareText,
  setCompareText,
  onRightFileOpsReady,
  externalRightContent,
  onExternalRightContentConsumed,
  downloadMarkdown,
}: Readonly<UseMergeFileOpsParams>): UseMergeFileOpsReturn {
  const [, setRightMeta] = useState<FileMetadata>(DEFAULT_METADATA);
  const [rightDragOver, setRightDragOver] = useState(false);
  const fileInputRightRef = useRef<HTMLInputElement>(null);

  const loadFile = (file: File) => {
    readFileAsText(file).then(({ text, encoding, lineEnding }) => {
      setRightMeta({ encoding, lineEnding });
      setCompareText(text);
    });
  };

  // 外部から渡された比較ファイル内容を右パネルに反映（1回限り）
  useEffect(() => {
    if (externalRightContent != null) {
      setCompareText(externalRightContent);
      onExternalRightContentConsumed?.();
    }
  }, [externalRightContent, setCompareText, onExternalRightContentConsumed]);

  // 右パネルのファイル操作を親に公開
  useEffect(() => {
    onRightFileOpsReady?.({
      loadFile: () => fileInputRightRef.current?.click(),
      exportFile: () => {
        const n = new Date();
        const ts = `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}_${String(n.getHours()).padStart(2, "0")}${String(n.getMinutes()).padStart(2, "0")}${String(n.getSeconds()).padStart(2, "0")}`;
        downloadMarkdown(compareText, `document_right_${ts}.md`);
      },
    });
  }, [onRightFileOpsReady, compareText, downloadMarkdown]);

  // Ctrl+S で右パネル内容も保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        globalThis.dispatchEvent(new CustomEvent('vscode-save-compare-file', { detail: compareText }));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [compareText]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = "";
  };

  const handleDragDropFile = (file: File) => {
    loadFile(file);
  };

  return {
    rightDragOver, setRightDragOver,
    fileInputRightRef,
    handleFileInputChange,
    handleDragDropFile,
  };
}
