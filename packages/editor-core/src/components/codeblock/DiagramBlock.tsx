"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Alert, Box, Button, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getEditorBg } from "../../constants/colors";
import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { useBlockResize } from "../../hooks/useBlockResize";
import { useDiagramCapture } from "../../hooks/useDiagramCapture";
import { SVG_SANITIZE_CONFIG,useMermaidRender } from "../../hooks/useMermaidRender";
import { usePlantUmlRender } from "../../hooks/usePlantUmlRender";
import { useZoomPan } from "../../hooks/useZoomPan";
import { useEditorSettingsContext } from "../../useEditorSettings";
import { extractDiagramAltText } from "../../utils/diagramAltText";
import { MermaidEditDialog } from "../MermaidEditDialog";
import { PlantUmlEditDialog } from "../PlantUmlEditDialog";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { CodeBlockFrame } from "./CodeBlockFrame";
import { ResizeGrip } from "./ResizeGrip";
import type { CodeBlockSharedProps } from "./types";

type DiagramBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "editOpen" | "setEditOpen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark" | "isCompareLeft" | "isCompareLeftEditable"
> & {
  /** Fullscreen code text sync */
  handleFsTextChange: (newCode: string) => void;
};

export function DiagramBlock(props: DiagramBlockProps) {
  const {
    editor, node, updateAttributes, getPos: _getPos,
    codeCollapsed, isSelected,
    selectNode, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    editOpen, setEditOpen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    handleFsTextChange: _handleFsTextChange,
    t, isDark,
  } = props;

  const isEditable = editor?.isEditable ?? true;
  const settings = useEditorSettingsContext();
  const language = node.attrs.language;
  const isMermaid = language === "mermaid";
  const isPlantUml = language === "plantuml";

  // Diagram-specific hooks
  const fsZP = useZoomPan();
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagramSize, setDiagramSize] = useState<{ w: number; h: number } | null>(null);
  const { svg, error: mermaidError } = useMermaidRender({ code, isMermaid, isDark });
  const {
    plantUmlUrl, error: plantUmlError, plantUmlConsent,
    handlePlantUmlAccept, handlePlantUmlReject,
  } = usePlantUmlRender({ code, isPlantUml, isDark });
  const error = isMermaid ? mermaidError : plantUmlError;

  const handleCapture = useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl, code, isDark });

  const displaySvg = useMemo(() => {
    if (!svg) return svg;
    const viewBoxMatch = svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) [\d.]+"/);
    if (!viewBoxMatch) return svg;
    const viewBoxWidth = parseFloat(viewBoxMatch[1]);
    const targetWidth = (settings.fontSize / 16) * viewBoxWidth;
    return svg
      .replace(/width="100%"/, `width="${targetWidth}"`)
      .replace(/max-width:\s*[\d.]+px/, `max-width: 100%`);
  }, [svg, settings.fontSize]);

  // Track diagram container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) { setDiagramSize(null); return; }
    const update = () => {
      const rect = container.getBoundingClientRect();
      setDiagramSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [svg, plantUmlUrl]);

  const { isCompareMode, compareCode, thisCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos: _getPos, language, code, editOpen,
  });

  const label = isMermaid ? t("mermaid") : t("plantuml");

  const toolbar = (
    <BlockInlineToolbar
      label={label}
      onEdit={props.isCompareLeft ? undefined : (svg || plantUmlUrl) ? () => { fsZP.reset(); setEditOpen(true); } : undefined}
      onDelete={isEditable && !props.isCompareLeft ? () => setDeleteDialogOpen(true) : undefined}
      labelOnly={props.isCompareLeftEditable}
      extra={diagramSize ? (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
          {diagramSize.w}&times;{diagramSize.h}
        </Typography>
      </>) : undefined}
      t={t}
    />
  );

  const { resizing, resizeWidth, displayWidth, handleResizePointerDown, handleResizePointerMove, handleResizePointerUp } = useBlockResize({ containerRef, updateAttributes, currentWidth: node.attrs.width });

  const editorBg = getEditorBg(isDark, settings);
  const diagramContainerSx = {
    overflow: "hidden", bgcolor: editorBg, position: "relative",
    width: displayWidth || "fit-content", maxWidth: "100%",
    cursor: "pointer",
  };

  const handleDoubleClickFullscreen = useCallback(() => {
    if (svg || plantUmlUrl) {
      fsZP.reset();
      setEditOpen(true);
    }
  }, [svg, plantUmlUrl, fsZP, setEditOpen]);

  return (
    <CodeBlockFrame
      toolbar={(props.isCompareLeft && !props.isCompareLeftEditable) ? null : (isEditable || props.isCompareLeftEditable) ? toolbar : null}
      codeCollapsed={codeCollapsed}
      isDiagramLayout
      isDark={isDark}
      showBorder={(props.isCompareLeft && !props.isCompareLeftEditable) ? false : (isSelected && (props.isCompareLeftEditable || isEditable)) || (!props.isCompareLeft && isEditable && editOpen)}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={<>
        {isMermaid && (
          <MermaidEditDialog
            open={editOpen}
            onClose={() => { fsSearch.reset(); setEditOpen(false); }}
            label={label}
            svg={svg}
            code={code}
            fsCode={fsCode}
            onFsCodeChange={onFsCodeChange}
            onFsTextChange={_handleFsTextChange}
            fsTextareaRef={fsTextareaRef}
            fsSearch={fsSearch}
            fsZP={fsZP}
            readOnly={!isEditable}
            isCompareMode={isCompareMode}
            compareCode={compareCode}
            onMergeApply={handleMergeApply}
            thisCode={thisCode}
            onCapture={handleCapture}
            toolbarExtra={
              <Tooltip title={t("copyCode")} placement="bottom">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
                  <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
            }
            t={t}
          />
        )}
        {isPlantUml && (
          <PlantUmlEditDialog
            open={editOpen}
            onClose={() => { fsSearch.reset(); setEditOpen(false); }}
            label={label}
            plantUmlUrl={plantUmlUrl}
            code={code}
            fsCode={fsCode}
            onFsCodeChange={onFsCodeChange}
            onFsTextChange={_handleFsTextChange}
            fsTextareaRef={fsTextareaRef}
            fsSearch={fsSearch}
            fsZP={fsZP}
            readOnly={!isEditable}
            isCompareMode={isCompareMode}
            compareCode={compareCode}
            onMergeApply={handleMergeApply}
            thisCode={thisCode}
            onCapture={handleCapture}
            toolbarExtra={
              <Tooltip title={t("copyCode")} placement="bottom">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
                  <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
            }
            t={t}
          />
        )}
      </>}
    >
      {isMermaid && svg && (
        <Box
          ref={containerRef}
          role="img"
          aria-label={extractDiagramAltText(code, "mermaid")}
          sx={diagramContainerSx}
          contentEditable={false}
          onClick={selectNode}
          onDoubleClick={handleDoubleClickFullscreen}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        >
          <Box
            sx={{ pt: 0, px: 2, pb: 2, display: "flex", justifyContent: "flex-start", pointerEvents: "none" }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displaySvg, SVG_SANITIZE_CONFIG) }}
          />
          <ResizeGrip visible={isSelected && isEditable} resizing={resizing} resizeWidth={resizeWidth} onPointerDown={handleResizePointerDown} />
        </Box>
      )}
      {isPlantUml && plantUmlConsent !== "accepted" && (
        <Alert
          severity="warning"
          icon={<WarningAmberIcon />}
          contentEditable={false}
          sx={{ m: 1 }}
          action={
            plantUmlConsent === "pending" ? (
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" color="inherit" onClick={handlePlantUmlReject}>{t("plantumlReject")}</Button>
                <Button size="small" variant="contained" color="warning" onClick={handlePlantUmlAccept}>{t("plantumlAccept")}</Button>
              </Box>
            ) : undefined
          }
        >
          {t("plantumlExternalWarning")}
        </Alert>
      )}
      {isPlantUml && plantUmlUrl && (
        <Box
          ref={containerRef}
          role="img"
          aria-label={extractDiagramAltText(code, "plantuml")}
          sx={diagramContainerSx}
          contentEditable={false}
          onClick={selectNode}
          onDoubleClick={handleDoubleClickFullscreen}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        >
          <Box sx={{ pt: 0, px: 2, pb: 2, display: "flex", justifyContent: "flex-start", pointerEvents: "none" }}>
            <img src={plantUmlUrl} alt={extractDiagramAltText(code, "plantuml")} referrerPolicy="no-referrer" style={{ maxWidth: "100%", height: "auto" }} />
          </Box>
          <ResizeGrip visible={isSelected && isEditable} resizing={resizing} resizeWidth={resizeWidth} onPointerDown={handleResizePointerDown} />
        </Box>
      )}
      {error && (
        <Typography variant="caption" sx={{ p: 1.5, color: "error.main", display: "block" }} contentEditable={false}>
          {error}
        </Typography>
      )}
    </CodeBlockFrame>
  );
}
