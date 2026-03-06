"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import SchemaIcon from "@mui/icons-material/Schema";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import DOMPurify from "dompurify";
import { usePlantUmlToolbar } from "../../types";
import { useEditorSettingsContext } from "../../useEditorSettings";
import { useMermaidRender, SVG_SANITIZE_CONFIG } from "../../hooks/useMermaidRender";
import { usePlantUmlRender } from "../../hooks/usePlantUmlRender";
import { useDiagramCapture } from "../../hooks/useDiagramCapture";
import { useZoomPan } from "../../hooks/useZoomPan";
import { useDiagramResize } from "../../hooks/useDiagramResize";
import { DiagramFullscreenDialog } from "../DiagramFullscreenDialog";
import { MermaidSamplePopover } from "../MermaidSamplePopover";
import { extractDiagramAltText } from "../../utils/diagramAltText";
import { CodeBlockFrame } from "./CodeBlockFrame";
import type { CodeBlockSharedProps } from "./types";

const pumlIconSx = { fontSize: 16 };

type DiagramBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "allCollapsed" | "codeCollapsed" | "isSelected" | "toggleAllCollapsed"
  | "selectNode" | "handleDragKeyDown" | "code"
  | "handleCopyCode" | "handleDeleteBlock" | "deleteDialogOpen" | "setDeleteDialogOpen"
  | "fullscreen" | "setFullscreen" | "fsCode" | "onFsCodeChange" | "fsTextareaRef" | "fsSearch"
  | "t" | "isDark"
> & {
  /** Fullscreen code editor visible toggle */
  fsCodeVisible: boolean;
  setFsCodeVisible: React.Dispatch<React.SetStateAction<boolean>>;
  /** Fullscreen code text sync */
  handleFsTextChange: (newCode: string) => void;
};

export function DiagramBlock(props: DiagramBlockProps) {
  const {
    editor, node, updateAttributes, getPos: _getPos,
    allCollapsed, codeCollapsed, isSelected, toggleAllCollapsed,
    selectNode, handleDragKeyDown, code,
    handleCopyCode, handleDeleteBlock, deleteDialogOpen, setDeleteDialogOpen,
    fullscreen, setFullscreen, fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
    fsCodeVisible, setFsCodeVisible, handleFsTextChange: _handleFsTextChange,
    t, isDark,
  } = props;

  const isEditable = editor?.isEditable ?? true;

  const settings = useEditorSettingsContext();
  const { setSampleAnchorEl } = usePlantUmlToolbar();

  const language = node.attrs.language;
  const isMermaid = language === "mermaid";
  const isPlantUml = language === "plantuml";

  // Diagram-specific hooks
  const normalZP = useZoomPan();
  const fsZP = useZoomPan();
  const diagramResize = useDiagramResize({
    width: node.attrs.width,
    updateAttributes,
    onResizeEnd: normalZP.reset,
  });
  const [diagramSize, setDiagramSize] = useState<{ w: number; h: number } | null>(null);
  const [mermaidSampleAnchorEl, setMermaidSampleAnchorEl] = useState<HTMLElement | null>(null);

  const { svg, error: mermaidError } = useMermaidRender({ code, isMermaid, isDark });
  const {
    plantUmlUrl, error: plantUmlError, plantUmlConsent,
    handlePlantUmlAccept, handlePlantUmlReject,
  } = usePlantUmlRender({ code, isPlantUml, isDark });
  const error = isMermaid ? mermaidError : plantUmlError;

  const handleCapture = useDiagramCapture({ isMermaid, isPlantUml, svg, plantUmlUrl, code, isDark });
  const diagramScale = 1;

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
    const container = diagramResize.containerRef.current;
    if (!container) { setDiagramSize(null); return; }
    const update = () => {
      const rect = container.getBoundingClientRect();
      setDiagramSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [svg, plantUmlUrl, allCollapsed]);

  const label = isMermaid ? t("mermaid") : t("plantuml");

  const toolbar = (
    <Box
      data-block-toolbar=""
      sx={{ bgcolor: "action.hover", px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
      contentEditable={false}
    >
      {!fullscreen && isEditable && (
        <Box
          data-drag-handle=""
          role="button"
          tabIndex={0}
          aria-roledescription="draggable item"
          aria-label={t("dragHandle")}
          onKeyDown={handleDragKeyDown}
          sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
        >
          <DragIndicatorIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        </Box>
      )}
      {!fullscreen && (
        <Tooltip title={allCollapsed ? t("unfoldAll") : t("foldAll")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={toggleAllCollapsed} aria-label={allCollapsed ? t("unfoldAll") : t("foldAll")}>
            {allCollapsed ? <UnfoldMoreIcon sx={{ fontSize: 16, color: "text.secondary" }} /> : <UnfoldLessIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
          </IconButton>
        </Tooltip>
      )}
      {!allCollapsed && (svg || plantUmlUrl) && (
        <Tooltip title={fullscreen ? t("close") : t("fullscreen")} placement="top">
          <IconButton
            size="small"
            onClick={() => { if (fullscreen) { fsSearch.reset(); setFullscreen(false); } else { fsZP.reset(); setFullscreen(true); } }}
            sx={{ p: 0.25 }}
            aria-label={fullscreen ? t("close") : t("fullscreen")}
          >
            {fullscreen ? <FullscreenExitIcon sx={{ fontSize: 16, color: "text.secondary" }} /> : <FullscreenIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
          </IconButton>
        </Tooltip>
      )}
      <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", mr: 0.5 }}>
        {label}
      </Typography>
      {!allCollapsed && isEditable && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {isMermaid && (
            <Tooltip title={t("insertSample")} placement="top">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setMermaidSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
                <SchemaIcon sx={pumlIconSx} />
              </IconButton>
            </Tooltip>
          )}
          {isPlantUml && (
            <Tooltip title={t("insertSample")}>
              <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
                <SchemaIcon sx={pumlIconSx} />
              </IconButton>
            </Tooltip>
          )}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        </>
      )}
      <Box sx={{ flex: 1 }} />
      {diagramSize && !allCollapsed && (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
          {diagramSize.w}&times;{diagramSize.h}
        </Typography>
      </>)}
      <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
      <Tooltip title={t("copyCode")} placement="top">
        <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
          <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        </IconButton>
      </Tooltip>
      {!allCollapsed && (svg || plantUmlUrl) && (
        <Tooltip title={t("capture")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCapture} aria-label={t("capture")}>
            <PhotoCameraIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        </Tooltip>
      )}
      {!allCollapsed && isEditable && isMermaid && (
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
            <DeleteOutlineIcon sx={pumlIconSx} />
          </IconButton>
        </Tooltip>
      )}
      {!allCollapsed && isEditable && isPlantUml && (
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
            <DeleteOutlineIcon sx={pumlIconSx} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );

  const resizeHandle = isSelected && isEditable && (
    <Box
      role="slider"
      tabIndex={0}
      aria-label={t("resizeDiagram")}
      aria-valuemin={diagramResize.MIN_WIDTH}
      aria-valuemax={800}
      aria-valuenow={node.attrs.width ? parseInt(node.attrs.width, 10) || undefined : undefined}
      onPointerDown={diagramResize.handlePointerDown}
      onKeyDown={diagramResize.handleKeyDown}
      sx={{
        position: "absolute", right: 0, bottom: 0, width: 16, height: 16,
        cursor: "nwse-resize", bgcolor: "primary.main", opacity: 0.7, borderTopLeftRadius: 4,
        "&:hover": { opacity: 1 },
        "&:focus-visible": { opacity: 1, outline: "2px solid", outlineColor: "primary.main", outlineOffset: 1 },
        clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
      }}
    />
  );

  const resizeIndicator = diagramResize.resizing && diagramResize.resizeWidth !== null && (
    <Box sx={{
      position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
      bgcolor: "rgba(0,0,0,0.7)", color: "white", px: 1, py: 0.25,
      borderRadius: 1, fontSize: "0.7rem", fontFamily: "monospace", pointerEvents: "none",
    }}>
      {diagramResize.resizeWidth}px
    </Box>
  );

  const diagramContainerSx = {
    overflow: "hidden", bgcolor: "background.paper", position: "relative",
    width: diagramResize.displayWidth || "fit-content", maxWidth: "100%",
    cursor: !isEditable ? "default" : diagramResize.resizing ? "nwse-resize" : "grab",
    "&:active": { cursor: !isEditable ? "default" : diagramResize.resizing ? "nwse-resize" : "grabbing" },
  };

  const panTransformSx = {
    pt: 0, px: 2, pb: 2, display: "flex", justifyContent: "flex-start", zoom: diagramScale,
    transform: `translate(${normalZP.pan.x}px, ${normalZP.pan.y}px) scale(${normalZP.zoom})`,
    transformOrigin: "top left",
    transition: normalZP.isPanningRef.current ? "none" : "transform 0.15s",
    "@media (prefers-reduced-motion: reduce)": { transition: "none" },
    pointerEvents: "none",
  };

  const handleDoubleClickFullscreen = useCallback(() => {
    if (!isEditable && (svg || plantUmlUrl)) {
      fsZP.reset();
      setFullscreen(true);
    }
  }, [isEditable, svg, plantUmlUrl, fsZP, setFullscreen]);

  return (
    <CodeBlockFrame
      toolbar={isEditable ? toolbar : null}
      allCollapsed={allCollapsed}
      codeCollapsed={codeCollapsed}
      isDiagramLayout
      isDark={isDark}
      showBorder={isEditable && (allCollapsed || fullscreen || isSelected)}
      deleteDialogOpen={deleteDialogOpen}
      setDeleteDialogOpen={setDeleteDialogOpen}
      handleDeleteBlock={handleDeleteBlock}
      t={t}
      afterFrame={<>
        <DiagramFullscreenDialog
          open={fullscreen}
          onClose={() => { fsSearch.reset(); setFullscreen(false); }}
          label={label}
          isMermaid={isMermaid}
          isPlantUml={isPlantUml}
          svg={svg}
          plantUmlUrl={plantUmlUrl}
          code={code}
          fsCode={fsCode}
          onFsCodeChange={onFsCodeChange}
          fsTextareaRef={fsTextareaRef}
          fsSearch={fsSearch}
          fsCodeVisible={fsCodeVisible}
          onToggleFsCodeVisible={() => setFsCodeVisible((v) => !v)}
          fsZP={fsZP}
          readOnly={!isEditable}
          t={t}
        />
        <MermaidSamplePopover
          anchorEl={mermaidSampleAnchorEl}
          onClose={() => setMermaidSampleAnchorEl(null)}
          editor={editor}
          t={t}
        />
      </>}
    >
      {!allCollapsed && (
        <>
          {isMermaid && svg && (
            <Box
              ref={diagramResize.containerRef}
              role="img"
              aria-label={extractDiagramAltText(code, "mermaid")}
              sx={diagramContainerSx}
              contentEditable={false}
              onClick={selectNode}
              onDoubleClick={handleDoubleClickFullscreen}
              onPointerDown={isEditable ? normalZP.handlePointerDown : undefined}
              onPointerMove={isEditable ? (e) => diagramResize.resizing ? diagramResize.handlePointerMove(e) : normalZP.handlePointerMove(e) : undefined}
              onPointerUp={isEditable ? () => diagramResize.resizing ? diagramResize.handlePointerUp() : normalZP.handlePointerUp() : undefined}
              onWheel={isEditable ? normalZP.handleWheel : undefined}
            >
              <Box
                sx={panTransformSx}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displaySvg, SVG_SANITIZE_CONFIG) }}
              />
              {isEditable && resizeHandle}
              {isEditable && resizeIndicator}
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
              ref={diagramResize.containerRef}
              sx={diagramContainerSx}
              contentEditable={false}
              onClick={selectNode}
              onDoubleClick={handleDoubleClickFullscreen}
              onPointerDown={isEditable ? normalZP.handlePointerDown : undefined}
              onPointerMove={isEditable ? (e) => diagramResize.resizing ? diagramResize.handlePointerMove(e) : normalZP.handlePointerMove(e) : undefined}
              onPointerUp={isEditable ? () => diagramResize.resizing ? diagramResize.handlePointerUp() : normalZP.handlePointerUp() : undefined}
              onWheel={isEditable ? normalZP.handleWheel : undefined}
            >
              <Box sx={panTransformSx}>
                <img src={plantUmlUrl} alt={extractDiagramAltText(code, "plantuml")} referrerPolicy="no-referrer" style={{ maxWidth: "100%", height: "auto" }} />
              </Box>
              {isEditable && resizeHandle}
              {isEditable && resizeIndicator}
            </Box>
          )}
          {error && (
            <Typography variant="caption" sx={{ p: 1.5, color: "error.main", display: "block" }} contentEditable={false}>
              {error}
            </Typography>
          )}
        </>
      )}
    </CodeBlockFrame>
  );
}
