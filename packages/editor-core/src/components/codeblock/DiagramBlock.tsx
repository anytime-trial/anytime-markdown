"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Alert, Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import DOMPurify from "dompurify";
import { useCallback, useMemo, useRef } from "react";

import { getEditorBg, getErrorMain, getTextDisabled, getTextSecondary } from "../../constants/colors";
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
import { shouldShowBorder, shouldShowToolbar } from "./compareHelpers";
import { ResizeGrip } from "./ResizeGrip";
import type { CodeBlockSharedProps } from "./types";

type DiagramBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "editOpen" | "setEditOpen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark" | "isEditable" | "isCompareLeft" | "isCompareLeftEditable"
> & {
  /** Fullscreen code text sync */
  handleFsTextChange: (newCode: string) => void;
};

/** Copy-code button shared between Mermaid and PlantUML edit dialogs */
function CopyCodeButton({ handleCopyCode, t }: { handleCopyCode: () => void; t: DiagramBlockProps["t"] }) {
  const isDark = useTheme().palette.mode === "dark";
  return (
    <Tooltip title={t("copyCode")} placement="bottom">
      <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
        <ContentCopyIcon sx={{ fontSize: 16, color: getTextSecondary(isDark) }} />
      </IconButton>
    </Tooltip>
  );
}

/** Renders the diagram preview container (shared between mermaid SVG and PlantUML img) */
function DiagramPreviewContainer({
  containerRef, code, language, diagramContainerSx,
  selectNode, handleDoubleClickFullscreen,
  handleResizePointerMove, handleResizePointerUp,
  isSelected, isEditable, resizing, resizeWidth, handleResizePointerDown,
  children,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  code: string;
  language: "mermaid" | "plantuml";
  diagramContainerSx: object;
  selectNode: () => void;
  handleDoubleClickFullscreen: () => void;
  handleResizePointerMove: (e: React.PointerEvent) => void;
  handleResizePointerUp: (e: React.PointerEvent) => void;
  isSelected: boolean;
  isEditable: boolean;
  resizing: boolean;
  resizeWidth: number | null;
  handleResizePointerDown: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Box
      ref={containerRef}
      role="img"
      aria-label={extractDiagramAltText(code, language)}
      sx={diagramContainerSx}
      contentEditable={false}
      onClick={selectNode}
      onDoubleClick={handleDoubleClickFullscreen}
      onPointerMove={handleResizePointerMove}
      onPointerUp={handleResizePointerUp}
    >
      {children}
      <ResizeGrip visible={isSelected && isEditable} resizing={resizing} resizeWidth={resizeWidth} onPointerDown={handleResizePointerDown} />
    </Box>
  );
}

/** PlantUML consent alert */
function PlantUmlConsentAlert({
  plantUmlConsent, handlePlantUmlReject, handlePlantUmlAccept, t,
}: {
  plantUmlConsent: string;
  handlePlantUmlReject: () => void;
  handlePlantUmlAccept: () => void;
  t: DiagramBlockProps["t"];
}) {
  return (
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
  );
}

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

  const { isEditable } = props;
  const settings = useEditorSettingsContext();
  const language = node.attrs.language;
  const isMermaid = language === "mermaid";
  const isPlantUml = language === "plantuml";

  // Diagram-specific hooks
  const fsZP = useZoomPan();
  const containerRef = useRef<HTMLDivElement>(null);
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

  const { isCompareMode, compareCode, thisCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos: _getPos, language, code, editOpen,
  });

  const label = isMermaid ? t("mermaid") : t("plantuml");

  const toolbar = (
    <BlockInlineToolbar
      label={label}
      onEdit={props.isCompareLeft ? undefined : (svg || plantUmlUrl) ? () => { fsZP.reset(); setEditOpen(true); } : undefined}
      onDelete={isEditable && !props.isCompareLeft ? () => setDeleteDialogOpen(true) : undefined}
      onExport={(svg || plantUmlUrl) ? handleCapture : undefined}
      labelOnly={props.isCompareLeftEditable}
      labelDivider
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

  const handleCloseDialog = useCallback(() => { fsSearch.reset(); setEditOpen(false); }, [fsSearch, setEditOpen]);

  const sharedContainerProps = {
    containerRef, code, diagramContainerSx, selectNode, handleDoubleClickFullscreen,
    handleResizePointerMove, handleResizePointerUp,
    isSelected, isEditable, resizing, resizeWidth, handleResizePointerDown,
  };

  const commonDialogProps = {
    open: editOpen, onClose: handleCloseDialog, label, code, fsCode,
    onFsCodeChange, onFsTextChange: _handleFsTextChange, fsTextareaRef, fsSearch, fsZP,
    readOnly: !isEditable, isCompareMode, compareCode, onMergeApply: handleMergeApply,
    thisCode, onExport: handleCapture,
    toolbarExtra: <CopyCodeButton handleCopyCode={handleCopyCode} t={t} />, t,
  };

  const editDialog = isMermaid
    ? <MermaidEditDialog {...commonDialogProps} svg={svg} />
    : isPlantUml
      ? <PlantUmlEditDialog {...commonDialogProps} plantUmlUrl={plantUmlUrl} />
      : null;

  return (
    <CodeBlockFrame
      toolbar={shouldShowToolbar({ isCompareLeft: props.isCompareLeft, isCompareLeftEditable: props.isCompareLeftEditable, isEditable }) ? toolbar : null}
      codeCollapsed={codeCollapsed}
      isDiagramLayout
      isDark={isDark}
      showBorder={shouldShowBorder({ isSelected, isCompareLeft: props.isCompareLeft, isCompareLeftEditable: props.isCompareLeftEditable, isEditable, editOpen })}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={editDialog}
    >
      {isMermaid && svg && (
        <DiagramPreviewContainer {...sharedContainerProps} language="mermaid">
          <Box
            sx={{ pt: 0, px: 2, pb: 2, display: "flex", justifyContent: "flex-start", pointerEvents: "none" }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displaySvg, SVG_SANITIZE_CONFIG) }}
          />
        </DiagramPreviewContainer>
      )}
      {isPlantUml && plantUmlConsent !== "accepted" && (
        <PlantUmlConsentAlert
          plantUmlConsent={plantUmlConsent}
          handlePlantUmlReject={handlePlantUmlReject}
          handlePlantUmlAccept={handlePlantUmlAccept}
          t={t}
        />
      )}
      {isPlantUml && plantUmlUrl && (
        <DiagramPreviewContainer {...sharedContainerProps} language="plantuml">
          <Box sx={{ pt: 0, px: 2, pb: 2, display: "flex", justifyContent: "flex-start", pointerEvents: "none" }}>
            <img src={plantUmlUrl} alt={extractDiagramAltText(code, "plantuml")} referrerPolicy="no-referrer" style={{ maxWidth: "100%", height: "auto" }} />
          </Box>
        </DiagramPreviewContainer>
      )}
      {error && (
        <Typography variant="caption" sx={{ p: 1.5, color: getErrorMain(isDark), display: "block" }} contentEditable={false}>
          {error}
        </Typography>
      )}
    </CodeBlockFrame>
  );
}
