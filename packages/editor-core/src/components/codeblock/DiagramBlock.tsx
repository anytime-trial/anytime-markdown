"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Alert, Box, Button, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getEditorBg } from "../../constants/colors";
import { useBlockMergeCompare } from "../../hooks/useBlockMergeCompare";
import { useDiagramCapture } from "../../hooks/useDiagramCapture";
import { SVG_SANITIZE_CONFIG,useMermaidRender } from "../../hooks/useMermaidRender";
import { usePlantUmlRender } from "../../hooks/usePlantUmlRender";
import { useZoomPan } from "../../hooks/useZoomPan";
import { useEditorSettingsContext } from "../../useEditorSettings";
import { extractDiagramAltText } from "../../utils/diagramAltText";
import { MermaidFullscreenDialog } from "../MermaidFullscreenDialog";
import { PlantUmlFullscreenDialog } from "../PlantUmlFullscreenDialog";
import { BlockInlineToolbar } from "./BlockInlineToolbar";
import { CodeBlockFrame } from "./CodeBlockFrame";
import type { CodeBlockSharedProps } from "./types";

type DiagramBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "fullscreen" | "setFullscreen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark"
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
    fullscreen, setFullscreen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
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

  const { isCompareMode, compareCode, handleMergeApply } = useBlockMergeCompare({
    editor, getPos: _getPos, language, code, fullscreen,
  });

  const label = isMermaid ? t("mermaid") : t("plantuml");

  const toolbar = (
    <BlockInlineToolbar
      label={label}
      onFullscreen={(svg || plantUmlUrl) ? () => { fsZP.reset(); setFullscreen(true); } : undefined}
      onDelete={isEditable ? () => setDeleteDialogOpen(true) : undefined}
      extra={diagramSize ? (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
          {diagramSize.w}&times;{diagramSize.h}
        </Typography>
      </>) : undefined}
      t={t}
    />
  );

  // --- Resize ---
  const [resizing, setResizing] = useState(false);
  const [resizeWidth, setResizeWidth] = useState<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const MIN_WIDTH = 50;

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    startXRef.current = e.clientX;
    startWidthRef.current = container.getBoundingClientRect().width;
    setResizing(true);
    setResizeWidth(startWidthRef.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizing) return;
    const delta = e.clientX - startXRef.current;
    setResizeWidth(Math.max(MIN_WIDTH, Math.round(startWidthRef.current + delta)));
  }, [resizing]);

  const handleResizePointerUp = useCallback(() => {
    if (!resizing) return;
    setResizing(false);
    if (resizeWidth !== null) {
      updateAttributes({ width: `${resizeWidth}px` });
    }
    setResizeWidth(null);
  }, [resizing, resizeWidth, updateAttributes]);

  const displayWidth = resizeWidth !== null ? `${resizeWidth}px` : node.attrs.width || undefined;

  const editorBg = getEditorBg(isDark, settings);
  const diagramContainerSx = {
    overflow: "hidden", bgcolor: editorBg, position: "relative",
    width: displayWidth || "fit-content", maxWidth: "100%",
    cursor: "pointer",
  };

  const handleDoubleClickFullscreen = useCallback(() => {
    if (svg || plantUmlUrl) {
      fsZP.reset();
      setFullscreen(true);
    }
  }, [svg, plantUmlUrl, fsZP, setFullscreen]);

  return (
    <CodeBlockFrame
      toolbar={isEditable ? toolbar : null}
      codeCollapsed={codeCollapsed}
      isDiagramLayout
      isDark={isDark}
      showBorder={isEditable && (isSelected || fullscreen)}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={<>
        {isMermaid && (
          <MermaidFullscreenDialog
            open={fullscreen}
            onClose={() => { fsSearch.reset(); setFullscreen(false); }}
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
          <PlantUmlFullscreenDialog
            open={fullscreen}
            onClose={() => { fsSearch.reset(); setFullscreen(false); }}
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
          {isSelected && isEditable && (
            <Box
              onPointerDown={handleResizePointerDown}
              sx={{
                position: "absolute", right: 0, bottom: 0, width: 16, height: 16,
                cursor: "nwse-resize", bgcolor: "primary.main", opacity: 0.7, borderTopLeftRadius: 4,
                "&:hover": { opacity: 1 },
                clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
              }}
            />
          )}
          {resizing && resizeWidth !== null && (
            <Box sx={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", bgcolor: "rgba(0,0,0,0.7)", color: "white", px: 1, py: 0.25, borderRadius: 1, fontSize: "0.7rem", fontFamily: "monospace", pointerEvents: "none" }}>
              {resizeWidth}px
            </Box>
          )}
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
          {isSelected && isEditable && (
            <Box
              onPointerDown={handleResizePointerDown}
              sx={{
                position: "absolute", right: 0, bottom: 0, width: 16, height: 16,
                cursor: "nwse-resize", bgcolor: "primary.main", opacity: 0.7, borderTopLeftRadius: 4,
                "&:hover": { opacity: 1 },
                clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
              }}
            />
          )}
          {resizing && resizeWidth !== null && (
            <Box sx={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", bgcolor: "rgba(0,0,0,0.7)", color: "white", px: 1, py: 0.25, borderRadius: 1, fontSize: "0.7rem", fontFamily: "monospace", pointerEvents: "none" }}>
              {resizeWidth}px
            </Box>
          )}
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
