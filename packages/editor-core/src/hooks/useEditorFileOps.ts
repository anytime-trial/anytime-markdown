import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { useTheme } from "@mui/material";
import { useTranslations } from "next-intl";
import useConfirm from "@/hooks/useConfirm";
import { getMarkdownFromEditor, type EncodingLabel, type MarkdownStorage } from "../types";
import type { FileHandle } from "../types/fileSystem";
import { sanitizeMarkdown, preserveBlankLines } from "../utils/sanitizeMarkdown";
import DOMPurify from "dompurify";
import { SVG_SANITIZE_CONFIG } from "./useMermaidRender";
import { PLANTUML_SERVER } from "../utils/plantumlHelpers";
import plantumlEncoder from "plantuml-encoder";

interface UseEditorFileOpsParams {
  editor: Editor | null;
  sourceMode: boolean;
  sourceText: string;
  setSourceText: Dispatch<SetStateAction<string>>;
  saveContent: (md: string) => void;
  downloadMarkdown: (md: string, encoding?: EncodingLabel) => void;
  clearContent: () => void;
  openFile?: () => Promise<string | null>;
  saveFile?: (content: string) => Promise<void>;
  saveAsFile?: (content: string) => Promise<void>;
  resetFile?: () => void;
  encoding?: EncodingLabel;
  fileHandle?: FileHandle | null;
}

export type NotificationKey = "copiedToClipboard" | "fileSaved" | "pdfExportError" | "encodingError" | "saveError" | null;

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
}: UseEditorFileOpsParams) {
  const [notification, setNotification] = useState<NotificationKey>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const t = useTranslations("MarkdownEditor");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const showNotification = useCallback((key: NotificationKey) => {
    clearTimeout(notificationTimerRef.current);
    setNotification(key);
    notificationTimerRef.current = setTimeout(() => setNotification(null), 3000);
  }, []);

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
    resetFile?.();
  }, [confirm, t, sourceMode, setSourceText, editor, clearContent, resetFile]);

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
              preserveBlankLines(sanitizeMarkdown(reader.result)),
            ),
          );
        }
      };
      reader.readAsText(file, encoding?.toLowerCase());
    },
    [sourceMode, setSourceText, editor, encoding],
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
    let md = sourceMode ? sourceText : editor ? getMarkdownFromEditor(editor) : "";
    if (md && !md.endsWith("\n")) md += "\n";
    downloadMarkdown(md, encoding);
  }, [sourceMode, sourceText, editor, downloadMarkdown, encoding]);

  const handleCopy = useCallback(async () => {
    const md = sourceMode ? sourceText : editor ? getMarkdownFromEditor(editor) : "";
    await navigator.clipboard.writeText(md);
    showNotification("copiedToClipboard");
  }, [sourceMode, sourceText, editor, showNotification]);

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
    const sanitized = sanitizeMarkdown(content);
    if (sourceMode) {
      setSourceText(sanitized);
    } else if (editor) {
      editor.commands.setContent(
        (editor.storage as unknown as MarkdownStorage).markdown.parser.parse(
          preserveBlankLines(sanitized),
        ),
      );
    }
  }, [openFile, editor, sourceMode, sourceText, setSourceText, confirm, t]);

  const handleSaveFile = useCallback(async () => {
    if (!saveFile) return;
    let md = sourceMode ? sourceText : editor ? getMarkdownFromEditor(editor) : "";
    if (md && !md.endsWith("\n")) md += "\n";
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
      await saveFile(md);
    }
    showNotification("fileSaved");
  }, [saveFile, editor, sourceMode, sourceText, showNotification, encoding, fileHandle]);

  const handleSaveAsFile = useCallback(async () => {
    if (!saveAsFile) return;
    let md = sourceMode ? sourceText : editor ? getMarkdownFromEditor(editor) : "";
    if (md && !md.endsWith("\n")) md += "\n";
    await saveAsFile(md);
    showNotification("fileSaved");
  }, [saveAsFile, editor, sourceMode, sourceText, showNotification]);

  const handleExportPdf = useCallback(async () => {
    if (typeof window === "undefined" || !editor) {
      if (typeof window !== "undefined") window.print();
      return;
    }
    setPdfExporting(true);
    try {
    // 印刷前に折りたたまれたブロックを一時展開
    const collapsedPositions: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs.collapsed) {
        collapsedPositions.push(pos);
      }
    });
    if (collapsedPositions.length > 0) {
      const tr = editor.state.tr;
      for (const pos of collapsedPositions) {
        tr.setNodeAttribute(pos, "collapsed", false);
      }
      editor.view.dispatch(tr);
    }

    // ダークモード時、印刷用にライトテーマで図を差し替え
    const diagramRestores: (() => void)[] = [];
    // Mermaid/PlantUML のライトSVGを事前レンダリング（DOM書き込みは print 直前に行う）
    const pendingMermaidReplacements: { innerDiv: HTMLElement; lightHtml: string; originalHTML: string; imgBox: HTMLElement }[] = [];
    if (isDark) {
      // Mermaid: ライトテーマで事前レンダリング
      const mermaidWrappers = document.querySelectorAll<HTMLElement>("[data-node-view-wrapper]");
      try {
        const mermaidMod = await import("mermaid");
        const mermaid = mermaidMod.default;
        mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: "default" });
        let renderIdx = 0;
        for (const wrapper of mermaidWrappers) {
          const imgBox = wrapper.querySelector<HTMLElement>("[role='img']");
          const svgEl = imgBox?.querySelector("svg");
          if (!imgBox || !svgEl) continue;
          const codeEl = wrapper.querySelector("code");
          const code = codeEl?.textContent?.trim();
          if (!code) continue;
          try {
            const id = `print-mermaid-${++renderIdx}`;
            const { svg: lightSvg } = await Promise.race([
              mermaid.render(id, code),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("mermaid render timeout")), 5000),
              ),
            ]);
            const innerDiv = imgBox.querySelector<HTMLElement>(":scope > div")
              || (imgBox.firstElementChild as HTMLElement | null);
            if (innerDiv) {
              pendingMermaidReplacements.push({
                innerDiv,
                lightHtml: DOMPurify.sanitize(lightSvg, SVG_SANITIZE_CONFIG),
                originalHTML: imgBox.innerHTML,
                imgBox,
              });
            }
          } catch {
            // レンダリング失敗時はスキップ
          }
        }
        // レンダリング後にダークテーマに戻す
        mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: "dark" });
      } catch {
        // mermaid 未ロード時はスキップ
      }
      // 一時的なレンダリング用要素を削除
      document.querySelectorAll('[id^="dprint-mermaid-"]').forEach((el) => el.remove());

      // PlantUML: ダークスキンパラムなしの URL に差し替え、画像ロード完了を待つ
      const pumlImgs = document.querySelectorAll<HTMLImageElement>("[data-node-view-wrapper] img[src*='plantuml']");
      const pumlLoadPromises: Promise<void>[] = [];
      for (const img of pumlImgs) {
        const originalSrc = img.src;
        const wrapperEl = img.closest("[data-node-view-wrapper]");
        const codeEl = wrapperEl?.querySelector("code");
        const code = codeEl?.textContent?.trim();
        if (!code) continue;
        try {
          const startMatch = code.match(/@start(uml|mindmap|wbs|json|yaml)/);
          const src = startMatch ? code : `@startuml\n${code}\n@enduml`;
          const encoded = plantumlEncoder.encode(src);
          const newUrl = `${PLANTUML_SERVER}/svg/${encoded}`;
          pumlLoadPromises.push(new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = newUrl;
          }));
          diagramRestores.push(() => { img.src = originalSrc; });
        } catch {
          // エンコード失敗時はスキップ
        }
      }
      if (pumlLoadPromises.length > 0) {
        await Promise.all(pumlLoadPromises);
      }
    }

    // 再レンダーを待ってから印刷
    const needsDelay = collapsedPositions.length > 0 || diagramRestores.length > 0 || pendingMermaidReplacements.length > 0;
    const delay = needsDelay ? 300 : 0;
    setTimeout(() => {
      try {
        // Mermaid ライトSVGをprint直前に同期的にDOM書き込み（React再レンダリングの介入を防ぐ）
        for (const { innerDiv, lightHtml, originalHTML, imgBox } of pendingMermaidReplacements) {
          innerDiv.innerHTML = lightHtml;
          diagramRestores.push(() => { imgBox.innerHTML = originalHTML; });
        }
        window.print();
      } finally {
        // 復元
        for (const restore of diagramRestores) restore();
        if (collapsedPositions.length > 0) {
          const tr = editor.state.tr;
          for (const pos of collapsedPositions) {
            tr.setNodeAttribute(pos, "collapsed", true);
          }
          editor.view.dispatch(tr);
        }
        setPdfExporting(false);
      }
    }, delay);
    } catch {
      setPdfExporting(false);
      showNotification("pdfExportError");
      return;
    }
  }, [editor, isDark]);

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
