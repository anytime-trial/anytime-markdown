"use client";

import DOMPurify from "dompurify";
import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  BlockChromeAnchor,
  BlockInlineToolbar,
  buildEmbedInfoString,
  DeleteBlockDialog,
  EmbedEditDialog,
  type EmbedVariant,
  getPrimaryMain,
  getTextSecondary,
  parseEmbedInfoString,
  useBlockChrome,
  useEditorFeaturesContext,
  useEditorSettingsContext,
  useIsDark,
  useMarkdownT,
} from "@anytime-markdown/markdown-viewer";
import { Button } from "@anytime-markdown/markdown-viewer/src/ui/Button";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@anytime-markdown/markdown-viewer/src/ui/Dialog";
import { IconButton } from "@anytime-markdown/markdown-viewer/src/ui/IconButton";
import { Tooltip } from "@anytime-markdown/markdown-viewer/src/ui/Tooltip";
import { ShowChartIcon } from "@anytime-markdown/markdown-viewer/src/ui/icons";

import { classifyCodeBlock, CODE_BLOCK_EDIT_INTENT_EVENT } from "./codeblock/CodeBlockBlockContent";
import { applySelectionCollapse, codeBlockToolbarLabel, firstNonEmptyLine } from "./codeblock/codeBlockOverlayHelpers";
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

/**
 * codeBlock（CodeBlockWithMermaid）の編集 chrome をページ層で提供する選択駆動
 * オーバーレイ（React）。content は native {@link createCodeBlockNodeView} が描画し、
 * 本コンポーネントが選択中の codeBlock に対しツールバー＋全画面編集ダイアログ＋
 * 削除/破棄を供給する（旧 `CodeBlockNodeView`=MermaidNodeView の chrome を移設）。
 *
 * 旧 React NodeView との二重描画を避けるため、マウント＋登録差替えは S5（flip）。
 * S3b スコープ: 全画面編集 5 種ダイアログ + apply/discard。compare/merge と
 * inline graph/zoom は S4/TODO。
 */

/** math ブロックのグラフ表示トグル（旧 MathBlock の GraphToggleButton と等価）。 */
function GraphToggleButton({ enabled, onToggle, isDark, t }: Readonly<{
  enabled: boolean; onToggle: () => void; isDark: boolean; t: (key: string) => string;
}>) {
  return (
    <Tooltip title={enabled ? t("hideGraph") : t("showGraph")} placement="top">
      <IconButton size="xs" onClick={onToggle} aria-label={enabled ? t("hideGraph") : t("showGraph")}>
        <ShowChartIcon fontSize={16} color={enabled ? getPrimaryMain(isDark) : getTextSecondary(isDark)} />
      </IconButton>
    </Tooltip>
  );
}

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

export function CodeBlockOverlay({ editor }: Readonly<{ editor: Editor | null }>) {
  const t = useMarkdownT("MarkdownEditor");
  const isDark = useIsDark();
  const settings = useEditorSettingsContext();
  const { hideGraph } = useEditorFeaturesContext();
  const { pos, node, rect, updateAttrs, deleteOpen, setDeleteOpen, handleDelete, showToolbar } =
    useBlockChrome(editor, "codeBlock");

  const language = (node?.attrs.language as string) ?? "";
  const kind = classifyCodeBlock(language);
  const [editOpen, setEditOpen] = useState(false);

  const edit = useCodeBlockEdit(editor, pos, node, editOpen, setEditOpen);

  // diagram プレビュー（コミット済みコードの svg/url）と dialog ズーム・エクスポート。
  const isMermaid = language === "mermaid";
  const isPlantUml = language === "plantuml";
  const { svg } = useMermaidRender({ code: edit.code, isMermaid, isDark });
  const { plantUmlUrl } = usePlantUmlRender({ code: edit.code, isPlantUml, isDark });
  const fsZP = useZoomPan();
  const { handleCapture, handleExportSource } = useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl, code: edit.code, isDark });

  // native content が読む実行時 CSS 変数（dark / code フォント）。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--am-editor-dark", isDark ? "1" : "0");
    root.style.setProperty("--am-code-font-size", `${settings.fontSize}px`);
    root.style.setProperty("--am-code-line-height", `${settings.lineHeight}`);
  }, [isDark, settings.fontSize, settings.lineHeight]);

  // 選択駆動の折畳み（展開/再折畳）。
  const prevPosRef = useRef(-1);
  useEffect(() => {
    if (!editor) return;
    if (pos === prevPosRef.current) return;
    const prev = prevPosRef.current;
    prevPosRef.current = pos;
    applySelectionCollapse(editor, prev, pos);
  }, [pos, editor]);

  // native NodeView（ダブルクリック）からの編集意図を購読する。
  useEffect(() => {
    const root = editor?.view?.dom;
    if (!root) return;
    const handler = () => setEditOpen(true);
    root.addEventListener(CODE_BLOCK_EDIT_INTENT_EVENT, handler as EventListener);
    return () => root.removeEventListener(CODE_BLOCK_EDIT_INTENT_EVENT, handler as EventListener);
  }, [editor]);

  // autoEditOpen: スラッシュコマンド作成直後に全画面編集を開く（preview 種別のみ）。
  useEffect(() => {
    if (node?.attrs.autoEditOpen && editor?.isEditable && kind !== "regular") {
      updateAttrs({ autoEditOpen: false });
      setEditOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const handleEdit = useCallback(() => setEditOpen(true), []);
  const readOnly = !editor?.isEditable;
  const graphEnabled = !!node?.attrs.graphEnabled;
  const showGraphToggle = kind === "math" && !hideGraph;
  const graphToggle = showGraphToggle
    ? <GraphToggleButton enabled={graphEnabled} onToggle={() => updateAttrs({ graphEnabled: !graphEnabled })} isDark={isDark} t={t} />
    : undefined;

  // embed: variant 切替を保持しつつ url を本文へ反映する（旧 EmbedBlock.handleApply 等価）。
  const handleEmbedApply = useCallback((url: string, nextVariant: EmbedVariant) => {
    const width = parseEmbedInfoString(language)?.width ?? null;
    updateAttrs({ language: buildEmbedInfoString(nextVariant, width, parseBaseline(language)) });
    if (editor && pos >= 0 && node) applyCodeBlockText(editor, pos, node.content.size, url);
    setEditOpen(false);
  }, [editor, pos, node, language, updateAttrs]);

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
      {showToolbar && (
        <BlockChromeAnchor rect={rect}>
          <BlockInlineToolbar
            label={codeBlockToolbarLabel(kind, language, t)}
            onEdit={handleEdit}
            onDelete={() => setDeleteOpen(true)}
            onExport={kind === "diagram" ? handleCapture : undefined}
            onExportSource={kind === "diagram" ? handleExportSource : undefined}
            exportSourceKey={kind === "diagram" ? diagramExportSourceKey : undefined}
            extra={graphToggle}
            labelDivider
            t={t}
          />
        </BlockChromeAnchor>
      )}

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
