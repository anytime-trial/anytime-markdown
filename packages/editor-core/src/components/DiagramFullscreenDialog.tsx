import React, { useRef, useState } from "react";
import { Box, Dialog, DialogTitle, Divider, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CodeIcon from "@mui/icons-material/Code";
import CodeOffIcon from "@mui/icons-material/CodeOff";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DOMPurify from "dompurify";
import { useEditorSettingsContext } from "../useEditorSettings";
import { FsSearchBar } from "./FsSearchBar";
import { SVG_SANITIZE_CONFIG } from "../hooks/useMermaidRender";
import { extractDiagramAltText } from "../utils/diagramAltText";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";

interface DiagramFullscreenDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  isMermaid: boolean;
  isPlantUml: boolean;
  svg: string;
  plantUmlUrl: string;
  code: string;
  fsCode: string;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: TextareaSearchState;
  fsCodeVisible: boolean;
  onToggleFsCodeVisible: () => void;
  fsZP: UseZoomPanReturn;
  t: (key: string) => string;
}

export function DiagramFullscreenDialog({
  open, onClose, label, isMermaid, isPlantUml, svg, plantUmlUrl, code,
  fsCode, onFsCodeChange, fsTextareaRef, fsSearch,
  fsCodeVisible, onToggleFsCodeVisible, fsZP, t,
}: DiagramFullscreenDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();

  const [fsSplitPct, setFsSplitPct] = useState(40);
  const [fsDragging, setFsDragging] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby="diagram-fullscreen-title"
      slotProps={{ paper: { sx: { bgcolor: settings.editorBg === "grey" && !isDark ? "grey.50" : undefined, display: "flex", flexDirection: "column" } } }}
      onKeyDown={(e: React.KeyboardEvent) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key === "f" || e.key === "h")) {
          e.preventDefault();
          e.stopPropagation();
          fsSearch.focusSearch();
        }
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider", position: "relative" }}>
        <DialogTitle id="diagram-fullscreen-title" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
          {label}
        </DialogTitle>
        <ToggleButtonGroup size="small" sx={{ height: 30 }}>
          <ToggleButton value="zoomOut" aria-label={t("zoomOut")} sx={{ px: 0.75, py: 0.25 }} onClick={fsZP.zoomOut}>
            <Tooltip title={t("zoomOut")} placement="bottom">
              <ZoomOutIcon sx={{ fontSize: 18 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="zoomIn" aria-label={t("zoomIn")} sx={{ px: 0.75, py: 0.25 }} onClick={fsZP.zoomIn}>
            <Tooltip title={t("zoomIn")} placement="bottom">
              <ZoomInIcon sx={{ fontSize: 18 }} />
            </Tooltip>
          </ToggleButton>
          {fsZP.isDirty && (
            <ToggleButton value="zoomReset" aria-label={t("zoomReset")} sx={{ px: 0.75, py: 0.25 }} onClick={fsZP.reset}>
              <Tooltip title={t("zoomReset")} placement="bottom">
                <RestartAltIcon sx={{ fontSize: 18 }} />
              </Tooltip>
            </ToggleButton>
          )}
        </ToggleButtonGroup>
        <Typography variant="caption" sx={{ minWidth: 40, textAlign: "center" }}>
          {Math.round(fsZP.zoom * 100)}%
        </Typography>
        {/* Search & Replace bar */}
        {fsCodeVisible && (
          <FsSearchBar search={fsSearch} t={t} />
        )}
        <Box sx={{ flex: 1 }} />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        {/* Code toggle */}
        <Tooltip title={fsCodeVisible ? t("diagramCodeHide") : t("diagramCodeShow")} placement="bottom">
          <IconButton
            size="small"
            onClick={onToggleFsCodeVisible}
            aria-label={fsCodeVisible ? t("diagramCodeHide") : t("diagramCodeShow")}
            aria-pressed={fsCodeVisible}
          >
            {fsCodeVisible ? <CodeOffIcon sx={{ fontSize: 18 }} /> : <CodeIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t("close")} placement="bottom">
          <IconButton size="small" onClick={onClose} sx={{ ml: 1 }} aria-label={t("close")}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {/* Split view: Code + Divider + Preview */}
      <Box
        ref={fsContainerRef}
        sx={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}
        onPointerMove={(e: React.PointerEvent) => {
          if (fsDragging && fsContainerRef.current) {
            const rect = fsContainerRef.current.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            setFsSplitPct(Math.min(80, Math.max(15, pct)));
          }
          if (!fsDragging) fsZP.handlePointerMove(e);
        }}
        onPointerUp={(e: React.PointerEvent) => {
          if (fsDragging) {
            setFsDragging(false);
            (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
          } else {
            fsZP.handlePointerUp();
          }
        }}
      >
        {/* Code editor */}
        {fsCodeVisible && (
          <Box sx={{ width: `${fsSplitPct}%`, minWidth: 120, display: "flex", flexDirection: "column", pointerEvents: fsDragging ? "none" : "auto" }}>
            <Box
              component="textarea"
              ref={fsTextareaRef}
              value={fsCode}
              onChange={onFsCodeChange}
              spellCheck={false}
              sx={{
                flex: 1,
                width: "100%",
                border: "none",
                outline: "none",
                resize: "none",
                fontFamily: "monospace",
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                p: 2,
                color: "text.primary",
                bgcolor: "background.paper",
                boxSizing: "border-box",
                overflow: "auto",
              }}
            />
          </Box>
        )}
        {/* Draggable divider */}
        {fsCodeVisible && (
          <Box
            role="separator"
            aria-orientation="vertical"
            aria-label={t("resizeSplitter")}
            aria-valuenow={fsSplitPct}
            aria-valuemin={20}
            aria-valuemax={80}
            tabIndex={0}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "ArrowLeft") {
                setFsSplitPct((v) => Math.max(20, v - 5));
                e.preventDefault();
              } else if (e.key === "ArrowRight") {
                setFsSplitPct((v) => Math.min(80, v + 5));
                e.preventDefault();
              }
            }}
            onPointerDown={(e: React.PointerEvent) => {
              setFsDragging(true);
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            sx={{
              width: 4,
              cursor: "col-resize",
              bgcolor: "divider",
              flexShrink: 0,
              "&:hover": { bgcolor: "primary.main" },
              "&:focus-visible": { bgcolor: "primary.main", outline: "2px solid", outlineColor: "primary.main" },
              transition: "background-color 0.15s",
              "@media (prefers-reduced-motion: reduce)": { transition: "none" },
            }}
          />
        )}
        {/* Preview */}
        <Box
          sx={{
            flex: 1,
            overflow: "hidden",
            bgcolor: "background.paper",
            cursor: fsDragging ? "col-resize" : "grab",
            "&:active": { cursor: fsDragging ? "col-resize" : "grabbing" },
            // Prevent iframe/textarea stealing pointer events during drag
            pointerEvents: fsDragging ? "none" : "auto",
          }}
          onPointerDown={fsZP.handlePointerDown}
          onWheel={fsZP.handleWheel}
        >
          <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`, transformOrigin: "center center", transition: fsZP.isPanningRef.current ? "none" : "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, pointerEvents: "none" }}>
            {isMermaid && svg && (
              <Box role="img" aria-label={extractDiagramAltText(code, "mermaid")} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, SVG_SANITIZE_CONFIG) }} sx={{ width: "100%", "& svg": { width: "100%", height: "auto" } }} />
            )}
            {isPlantUml && plantUmlUrl && (
              <img src={plantUmlUrl} alt={extractDiagramAltText(code, "plantuml")} referrerPolicy="no-referrer" style={{ maxWidth: "90vw", maxHeight: "85vh" }} />
            )}
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
}
