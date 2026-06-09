"use client";

import DOMPurify from "dompurify";
import type { Editor } from "@anytime-markdown/markdown-react";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildEmbedInfoString,
  deleteBlockAt,
  DeleteBlockDialog,
  EmbedEditDialog,
  type EmbedVariant,
  parseEmbedInfoString,
  setBlockAttrs,
  useEditorFeaturesContext,
  useEditorSettingsContext,
  useIsDark,
  useMarkdownT,
} from "@anytime-markdown/markdown-viewer";
import { Button } from "@anytime-markdown/markdown-viewer/src/ui/Button";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@anytime-markdown/markdown-viewer/src/ui/Dialog";

import { classifyCodeBlock } from "./codeblock/CodeBlockBlockContent";
import { createCodeBlockChrome } from "./codeblock/codeBlockChrome";
import { codeBlockToolbarLabel, firstNonEmptyLine } from "./codeblock/codeBlockOverlayHelpers";
import { parseBaseline } from "./codeblock/embedPreviewMount";
import { applyCodeBlockText, useCodeBlockEdit } from "./codeblock/useCodeBlockEdit";
import { HTML_SANITIZE_CONFIG } from "./codeblock/types";
import { CodeBlockEditDialog } from "./CodeBlockEditDialog";
import { MathEditDialog } from "./MathEditDialog";
import { MermaidEditDialog } from "./MermaidEditDialog";
import { PlantUmlEditDialog } from "./PlantUmlEditDialog";
import htmlSamples from "../constants/htmlSamples.json";
import { useDiagramCapture } from "../hooks/useDiagramCapture";
import { useMermaidRender } from "../hooks/useMermaidRender";
import { usePlantUmlRender } from "../hooks/usePlantUmlRender";
import { useZoomPan } from "../hooks/useZoomPan";

function DiscardDialog({ open, onClose, onConfirm, t }: Readonly<{
  open: boolean; onClose: () => void; onConfirm: () => void; t: (key: string) => string;
}>) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t("spreadsheetDiscardTitle")}</DialogTitle>
      <DialogContent><DialogContentText>{t("spreadsheetDiscardMessage")}</DialogContentText></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("spreadsheetDiscardCancel")}</Button>
        <Button onClick={onConfirm} color="error">{t("spreadsheetDiscardConfirm")}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * codeBlock のダイアログ host（Phase 3 / ホスト隔離・E 横展開）。
 *
 * 選択追従・ツールバー・折畳み・autoEditOpen は React なしの {@link createCodeBlockChrome}
 * が担い、本コンポーネントは図描画（mermaid/plantuml・zoom・capture）と全画面編集ダイアログ群
 * （React フックに深く結合）のみを host 側 React として提供する。chrome の `onSelect` で
 * 選択中ブロックの pos/node を受け取り、`onEdit`/`onExport`/`onExportSource`/`onDelete`
 * intent でダイアログ・エクスポートを駆動する。
 */
export function CodeDialogHost({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useIsDark();
  const settings = useEditorSettingsContext();
  const { hideGraph } = useEditorFeaturesContext();

  const [pos, setPos] = useState(-1);
  const [node, setNode] = useState<PMNode | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const language = (node?.attrs.language as string) ?? "";
  const kind = classifyCodeBlock(language);

  const edit = useCodeBlockEdit(editor, pos, node, editOpen, setEditOpen);

  const isMermaid = language === "mermaid";
  const isPlantUml = language === "plantuml";
  const { svg } = useMermaidRender({ code: edit.code, isMermaid, isDark });
  const { plantUmlUrl } = usePlantUmlRender({ code: edit.code, isPlantUml, isDark });
  const fsZP = useZoomPan();
  const { handleCapture, handleExportSource } = useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl, code: edit.code, isDark });

  // intent から呼ぶ最新の capture ハンドラ（フック値に依存するため ref で最新化）。
  const captureRef = useRef(handleCapture);
  captureRef.current = handleCapture;
  const exportSourceRef = useRef(handleExportSource);
  exportSourceRef.current = handleExportSource;
  const hideGraphRef = useRef(hideGraph);
  hideGraphRef.current = hideGraph;

  // native content が読む実行時 CSS 変数（dark / code フォント）。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--am-editor-dark", isDark ? "1" : "0");
    root.style.setProperty("--am-code-font-size", `${settings.fontSize}px`);
    root.style.setProperty("--am-code-line-height", `${settings.lineHeight}`);
  }, [isDark, settings.fontSize, settings.lineHeight]);

  // vanilla chrome（選択追従・ツールバー・折畳み・autoEditOpen）を生成し intent を購読。
  useEffect(() => {
    if (!editor) return;
    const destroy = createCodeBlockChrome(editor, {
      t,
      isGraphHidden: () => hideGraphRef.current,
      onSelect: (p, n) => {
        setPos(p);
        setNode(n);
      },
      onEdit: () => setEditOpen(true),
      onExport: () => captureRef.current?.(),
      onExportSource: () => exportSourceRef.current?.(),
      onDelete: () => setDeleteOpen(true),
    });
    return destroy;
  }, [editor, t]);

  const handleDelete = useCallback(() => {
    if (editor) deleteBlockAt(editor, pos);
    setDeleteOpen(false);
  }, [editor, pos]);

  // embed: variant 切替を保持しつつ url を本文へ反映する（旧 EmbedBlock.handleApply 等価）。
  const handleEmbedApply = useCallback((url: string, nextVariant: EmbedVariant) => {
    if (!editor) return;
    const width = parseEmbedInfoString(language)?.width ?? null;
    setBlockAttrs(editor, pos, { language: buildEmbedInfoString(nextVariant, width, parseBaseline(language)) });
    if (pos >= 0 && node) applyCodeBlockText(editor, pos, node.content.size, url);
    setEditOpen(false);
  }, [editor, pos, node, language]);

  const readOnly = !editor?.isEditable;
  const commonDialog = {
    open: editOpen,
    onClose: () => { edit.fsSearch.reset(); edit.tryCloseEdit(); },
    fsCode: edit.fsCode,
    onFsCodeChange: edit.onFsCodeChange,
    onFsTextChange: edit.onFsTextChange,
    fsTextareaRef: edit.fsTextareaRef,
    fsSearch: edit.fsSearch,
    onApply: edit.onApply,
    dirty: edit.fsDirty,
    readOnly,
    t,
  };
  const diagramExportSourceKey = isMermaid ? "exportMmd" : "exportPuml";

  return (
    <>
      <DeleteBlockDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onDelete={handleDelete} t={t} />

      {editOpen && kind === "regular" && (
        <CodeBlockEditDialog {...commonDialog} label={codeBlockToolbarLabel(kind, language, t)} language={language || "plaintext"} />
      )}
      {editOpen && kind === "html" && (
        <CodeBlockEditDialog
          {...commonDialog}
          label={t("htmlPreview")}
          language="html"
          customSamples={htmlSamples.filter((s) => s.enabled)}
          renderPreview={(c) => <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c, HTML_SANITIZE_CONFIG) }} />}
        />
      )}
      {editOpen && kind === "math" && (
        <MathEditDialog {...commonDialog} label="Math" />
      )}
      {editOpen && kind === "diagram" && isMermaid && (
        <MermaidEditDialog
          {...commonDialog}
          label={t("mermaid")}
          svg={svg}
          code={edit.code}
          fsZP={fsZP}
          onExport={handleCapture}
          onExportSource={handleExportSource}
          exportSourceKey={diagramExportSourceKey}
        />
      )}
      {editOpen && kind === "diagram" && isPlantUml && (
        <PlantUmlEditDialog
          {...commonDialog}
          label={t("plantuml")}
          plantUmlUrl={plantUmlUrl}
          code={edit.code}
          fsZP={fsZP}
          onExport={handleCapture}
          onExportSource={handleExportSource}
          exportSourceKey={diagramExportSourceKey}
        />
      )}
      {editOpen && kind === "embed" && (
        <EmbedEditDialog
          open={editOpen}
          initialUrl={firstNonEmptyLine(edit.code)}
          initialVariant={(parseEmbedInfoString(language)?.variant ?? "card") as EmbedVariant}
          onClose={() => setEditOpen(false)}
          onApply={handleEmbedApply}
          t={t}
        />
      )}

      <DiscardDialog open={edit.discardOpen} onClose={() => edit.setDiscardOpen(false)} onConfirm={edit.handleDiscardConfirm} t={t} />
    </>
  );
}
