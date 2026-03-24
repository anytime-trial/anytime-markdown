import { useTheme } from "@mui/material";
import type { Editor } from "@tiptap/react";
import DOMPurify from "dompurify";
import { useTranslations } from "next-intl";
import plantumlEncoder from "plantuml-encoder";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import useConfirm from "@/hooks/useConfirm";

import { MERMAID_RENDER_TIMEOUT, NOTIFICATION_DURATION, PRINT_DELAY } from "../constants/timing";
import { type EncodingLabel,getMarkdownFromEditor } from "../types";
import type { FileHandle } from "../types/fileSystem";
import { applyMarkdownToEditor } from "../utils/editorContentLoader";
import { readFileAsText } from "../utils/fileReading";
import { prependFrontmatter } from "../utils/frontmatterHelpers";
import { buildPlantUmlUrl } from "../utils/plantumlHelpers";
import { SVG_SANITIZE_CONFIG } from "./useMermaidRender";

interface MermaidReplacement {
  innerDiv: HTMLElement;
  lightHtml: string;
  originalHTML: string;
  imgBox: HTMLElement;
}

/** 折りたたまれたブロックの位置を収集し展開する */
function expandCollapsedBlocks(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.collapsed) positions.push(pos);
  });
  if (positions.length > 0) {
    const tr = editor.state.tr;
    for (const pos of positions) tr.setNodeAttribute(pos, "collapsed", false);
    editor.view.dispatch(tr);
  }
  return positions;
}

/** 折りたたみ状態を復元する */
function restoreCollapsedBlocks(editor: Editor, positions: number[]): void {
  if (positions.length > 0 && !editor.isDestroyed) {
    const tr = editor.state.tr;
    for (const pos of positions) tr.setNodeAttribute(pos, "collapsed", true);
    editor.view.dispatch(tr);
  }
}

/** Mermaid ダイアグラムのライトテーマ SVG を事前レンダリングする */
async function prerenderMermaidLight(): Promise<MermaidReplacement[]> {
  const replacements: MermaidReplacement[] = [];
  const wrappers = document.querySelectorAll<HTMLElement>("[data-node-view-wrapper]");
  try {
    const mermaidMod = await import("mermaid");
    const mermaid = mermaidMod.default;
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: "default" });
    let renderIdx = 0;
    for (const wrapper of wrappers) {
      const imgBox = wrapper.querySelector<HTMLElement>("[role='img']");
      const svgEl = imgBox?.querySelector("svg");
      if (!imgBox || !svgEl) continue;
      const code = wrapper.querySelector("code")?.textContent?.trim();
      if (!code) continue;
      try {
        const id = `print-mermaid-${++renderIdx}`;
        const container = document.createElement("div");
        container.id = `d${id}`;
        container.style.position = "absolute";
        container.style.left = "-9999px";
        container.style.top = "-9999px";
        document.body.appendChild(container);
        const { svg: lightSvg } = await Promise.race([
          mermaid.render(id, code, container),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("mermaid render timeout")), MERMAID_RENDER_TIMEOUT),
          ),
        ]);
        container.remove();
        const innerDiv = imgBox.querySelector<HTMLElement>(":scope > div")
          || (imgBox.firstElementChild as HTMLElement | null);
        if (innerDiv) {
          replacements.push({
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
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true, theme: "dark" });
  } catch {
    // mermaid 未ロード時はスキップ
  }
  document.querySelectorAll('[id^="dprint-mermaid-"]').forEach((el) => el.remove());
  return replacements;
}

/** PlantUML ダイアグラムをライトテーマ URL に差し替える */
async function replacePlantUmlLight(): Promise<Array<() => void>> {
  const restores: Array<() => void> = [];
  const pumlImgs = document.querySelectorAll<HTMLImageElement>("[data-node-view-wrapper] img[src*='plantuml']");
  const loadPromises: Promise<void>[] = [];
  for (const img of pumlImgs) {
    const originalSrc = img.src;
    const code = img.closest("[data-node-view-wrapper]")?.querySelector("code")?.textContent?.trim();
    if (!code) continue;
    try {
      const startMatch = code.match(/@start(uml|mindmap|wbs|json|yaml)/);
      const src = startMatch ? code : `@startuml\n${code}\n@enduml`;
      const encoded = plantumlEncoder.encode(src);
      const newUrl = buildPlantUmlUrl(encoded);
      loadPromises.push(new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = newUrl;
      }));
      restores.push(() => { img.src = originalSrc; });
    } catch {
      // エンコード失敗時はスキップ
    }
  }
  if (loadPromises.length > 0) await Promise.all(loadPromises);
  return restores;
}

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
  setFileHandle,
  frontmatterRef,
  onFrontmatterChange,
  onExternalSave,
}: UseEditorFileOpsParams) {
  const [notification, setNotification] = useState<NotificationKey>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const t = useTranslations("MarkdownEditor");
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  /** エディタからフロントマター付き Markdown を取得する */
  const getFullMarkdown = useCallback(() => {
    const editorMd = editor ? getMarkdownFromEditor(editor) : "";
    const md = sourceMode ? sourceText : editorMd;
    return sourceMode ? md : prependFrontmatter(md, frontmatterRef.current);
  }, [sourceMode, sourceText, editor, frontmatterRef]);

  // アンマウント時にタイマーをクリア
  useEffect(() => () => clearTimeout(notificationTimerRef.current), []);

  const showNotification = useCallback((key: NotificationKey) => {
    clearTimeout(notificationTimerRef.current);
    setNotification(key);
    notificationTimerRef.current = setTimeout(() => setNotification(null), NOTIFICATION_DURATION);
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

  const handleExportPdf = useCallback(async () => {
    if (typeof globalThis === "undefined" || !editor) {
      if (typeof globalThis !== "undefined") globalThis.print();
      return;
    }
    setPdfExporting(true);
    try {
    const collapsedPositions = expandCollapsedBlocks(editor);

    // ダークモード時、印刷用にライトテーマで図を差し替え
    const diagramRestores: (() => void)[] = [];
    const pendingMermaidReplacements: MermaidReplacement[] = [];
    if (isDark) {
      pendingMermaidReplacements.push(...await prerenderMermaidLight());
      diagramRestores.push(...await replacePlantUmlLight());
    }

    // 再レンダーを待ってから印刷
    const needsDelay = collapsedPositions.length > 0 || diagramRestores.length > 0 || pendingMermaidReplacements.length > 0;
    const delay = needsDelay ? PRINT_DELAY : 0;
    setTimeout(() => {
      try {
        for (const { innerDiv, lightHtml, originalHTML, imgBox } of pendingMermaidReplacements) {
          innerDiv.innerHTML = lightHtml;
          diagramRestores.push(() => { imgBox.innerHTML = originalHTML; });
        }
        globalThis.print();
      } finally {
        for (const restore of diagramRestores) restore();
        restoreCollapsedBlocks(editor, collapsedPositions);
        setPdfExporting(false);
      }
    }, delay);
    } catch {
      setPdfExporting(false);
      showNotification("pdfExportError");
      return;
    }
    // showNotification は安定な関数のため依存配列から除外
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
