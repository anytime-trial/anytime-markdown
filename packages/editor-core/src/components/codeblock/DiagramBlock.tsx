"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import SchemaIcon from "@mui/icons-material/Schema";
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
import { usePlantUmlToolbar } from "../../types";
import { useEditorSettingsContext } from "../../useEditorSettings";
import { extractDiagramAltText } from "../../utils/diagramAltText";
import { MermaidFullscreenDialog } from "../MermaidFullscreenDialog";
import { MermaidSamplePopover } from "../MermaidSamplePopover";
import { PlantUmlFullscreenDialog } from "../PlantUmlFullscreenDialog";
import { CodeBlockFrame } from "./CodeBlockFrame";
import type { CodeBlockSharedProps } from "./types";

const pumlIconSx = { fontSize: 16 };

type DiagramBlockProps = Pick<
  CodeBlockSharedProps,
  | "editor" | "node" | "updateAttributes" | "getPos"
  | "codeCollapsed" | "isSelected"
  | "selectNode" | "code"
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
    codeCollapsed, isSelected,
    selectNode, code,
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
  const fsZP = useZoomPan();
  const containerRef = useRef<HTMLDivElement>(null);
  const [diagramSize, setDiagramSize] = useState<{ w: number; h: number } | null>(null);
  const [mermaidSampleAnchorEl, setMermaidSampleAnchorEl] = useState<HTMLElement | null>(null);

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
          sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
        >
          <DragIndicatorIcon sx={{ fontSize: 16, color: "text.secondary" }} />
        </Box>
      )}
      {(svg || plantUmlUrl) && (
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
      <Box sx={{ flex: 1 }} />
      {diagramSize && (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.65rem", fontFamily: "monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
          {diagramSize.w}&times;{diagramSize.h}
        </Typography>
      </>)}
      {(svg || plantUmlUrl) && (
        <Tooltip title={t("capture")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCapture} aria-label={t("capture")}>
            <PhotoCameraIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        </Tooltip>
      )}
      {isEditable && isMermaid && (
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
            <DeleteOutlineIcon sx={pumlIconSx} />
          </IconButton>
        </Tooltip>
      )}
      {isEditable && isPlantUml && (
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setDeleteDialogOpen(true)} aria-label={t("delete")}>
            <DeleteOutlineIcon sx={pumlIconSx} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );

  const editorBg = getEditorBg(isDark, settings);
  const diagramContainerSx = {
    overflow: "hidden", bgcolor: editorBg, position: "relative",
    width: node.attrs.width || "fit-content", maxWidth: "100%",
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
            fsCodeVisible={fsCodeVisible}
            onToggleFsCodeVisible={() => setFsCodeVisible((v) => !v)}
            fsZP={fsZP}
            readOnly={!isEditable}
            isCompareMode={isCompareMode}
            compareCode={compareCode}
            onMergeApply={handleMergeApply}
            toolbarExtra={<>
              {isEditable && (
                <Tooltip title={t("insertSample")} placement="bottom">
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setMermaidSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
                    <SchemaIcon sx={pumlIconSx} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={t("copyCode")} placement="bottom">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
                  <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
            </>}
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
            fsTextareaRef={fsTextareaRef}
            fsSearch={fsSearch}
            fsCodeVisible={fsCodeVisible}
            onToggleFsCodeVisible={() => setFsCodeVisible((v) => !v)}
            fsZP={fsZP}
            readOnly={!isEditable}
            isCompareMode={isCompareMode}
            compareCode={compareCode}
            onMergeApply={handleMergeApply}
            toolbarExtra={<>
              {isEditable && (
                <Tooltip title={t("insertSample")} placement="bottom">
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => setSampleAnchorEl(e.currentTarget)} aria-label={t("insertSample")}>
                    <SchemaIcon sx={pumlIconSx} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={t("copyCode")} placement="bottom">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={handleCopyCode} aria-label={t("copyCode")}>
                  <ContentCopyIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </IconButton>
              </Tooltip>
            </>}
            t={t}
          />
        )}
        <MermaidSamplePopover
          anchorEl={mermaidSampleAnchorEl}
          onClose={() => setMermaidSampleAnchorEl(null)}
          editor={editor}
          t={t}
        />
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
        >
          <Box
            sx={{ pt: 0, px: 2, pb: 2, display: "flex", justifyContent: "flex-start", pointerEvents: "none" }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displaySvg, SVG_SANITIZE_CONFIG) }}
          />
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
        >
          <Box sx={{ pt: 0, px: 2, pb: 2, display: "flex", justifyContent: "flex-start", pointerEvents: "none" }}>
            <img src={plantUmlUrl} alt={extractDiagramAltText(code, "plantuml")} referrerPolicy="no-referrer" style={{ maxWidth: "100%", height: "auto" }} />
          </Box>
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
