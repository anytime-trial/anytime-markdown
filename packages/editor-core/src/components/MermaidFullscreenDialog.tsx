import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SchemaIcon from "@mui/icons-material/Schema";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { Box, Chip, Dialog, DialogTitle, Divider, IconButton, Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import DOMPurify from "dompurify";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import { MERMAID_SAMPLES } from "../constants/samples";
import { SVG_SANITIZE_CONFIG } from "../hooks/useMermaidRender";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { extractDiagramAltText } from "../utils/diagramAltText";
import { extractMermaidConfig, mergeMermaidConfig } from "../utils/mermaidConfig";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { FullscreenDiffView } from "./FullscreenDiffView";

interface MermaidFullscreenDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  svg: string;
  code: string;
  fsCode: string;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Direct text update (bypasses synthetic event) */
  onFsTextChange: (newCode: string) => void;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: TextareaSearchState;
  fsZP: UseZoomPanReturn;
  readOnly?: boolean;
  isCompareMode?: boolean;
  compareCode?: string | null;
  onMergeApply?: (newThisCode: string, newOtherCode: string) => void;
  toolbarExtra?: React.ReactNode;
  t: (key: string) => string;
}

export function MermaidFullscreenDialog({
  open, onClose, label, svg, code,
  fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch,
  fsZP, readOnly,
  isCompareMode, compareCode, onMergeApply, toolbarExtra,
  t,
}: MermaidFullscreenDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const settings = useEditorSettingsContext();

  const [fsSplitPx, setFsSplitPx] = useState(500);
  const [fsDragging, setFsDragging] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  // --- Code / Config tab state ---
  const [activeTab, setActiveTab] = useState<"code" | "config">("code");
  const [configText, setConfigText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const configTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset to Code tab and split fsCode only when dialog opens
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setActiveTab("code");
    }
    prevOpenRef.current = open;
  }, [open]);

  // Extract config/body from fsCode when dialog opens (wait for non-empty fsCode)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) { initializedRef.current = false; return; }
    if (initializedRef.current) return;
    if (!fsCode) return; // fsCode not yet synced
    initializedRef.current = true;
    const { config, body } = extractMermaidConfig(fsCode);
    setConfigText(config);
    setBodyText(body);
  }, [open, fsCode]);

  // Sync body when user edits Code tab via textarea onChange
  const handleCodeTabChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newBody = e.target.value;
    setBodyText(newBody);
    const merged = mergeMermaidConfig(configText, newBody);
    onFsTextChange(merged);
  }, [configText, onFsTextChange]);

  // Sync config when user edits Config tab
  const handleConfigChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newConfig = e.target.value;
    setConfigText(newConfig);
    const merged = mergeMermaidConfig(newConfig, bodyText);
    onFsTextChange(merged);
  }, [bodyText, onFsTextChange]);

  // --- Sample panel ---
  const [samplesOpen, setSamplesOpen] = useState(false);
  const handleInsertSample = useCallback((sampleCode: string) => {
    setBodyText(sampleCode);
    onFsTextChange(mergeMermaidConfig(configText, sampleCode));
    setActiveTab("code");
  }, [configText, onFsTextChange]);

  const showCompareView = isCompareMode && compareCode != null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby="mermaid-fullscreen-title"
      slotProps={{ paper: { sx: { bgcolor: settings.editorBg === "grey" && !isDark ? "grey.50" : undefined, display: "flex", flexDirection: "column" } } }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (showCompareView) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod && (e.key === "f" || e.key === "h")) {
          e.preventDefault();
          e.stopPropagation();
          fsSearch.focusSearch();
        }
      }}
    >
      {/* Toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider", position: "relative" }}>
        <DialogTitle id="mermaid-fullscreen-title" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
          {label}{showCompareView ? ` - ${t("compare")}` : ""}
        </DialogTitle>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t("close")} placement="bottom">
          <IconButton size="small" onClick={onClose} sx={{ ml: 1 }} aria-label={t("close")}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Compare view */}
      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={fsCode}
          initialRightCode={compareCode}
          onMergeApply={onMergeApply ?? (() => {})}
          t={t}
        />
      ) : (
        /* Normal view: Code/Config + Divider + Preview */
        <Box
          ref={fsContainerRef}
          sx={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden", position: "relative" }}
          onPointerMove={(e: React.PointerEvent) => {
            if (fsDragging && fsContainerRef.current) {
              const rect = fsContainerRef.current.getBoundingClientRect();
              const px = e.clientX - rect.left;
              setFsSplitPx(Math.min(rect.width - 120, Math.max(120, px)));
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
          {/* Code / Config editor */}
          <Box sx={{ width: isMobile ? "100%" : `${fsSplitPx}px`, height: isMobile ? "40%" : "auto", minWidth: isMobile ? undefined : 120, display: "flex", flexDirection: "column", pointerEvents: fsDragging ? "none" : "auto" }}>
              {/* Tabs + toolbar */}
              <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
                <Tabs
                  value={activeTab}
                  onChange={(_, v) => setActiveTab(v)}
                  sx={{ minHeight: 32, flex: 1, "& .MuiTab-root": { minHeight: 32, py: 0.5, px: 2, fontSize: "0.75rem", textTransform: "none" } }}
                >
                  <Tab value="code" label={t("codeTab")} />
                  <Tab value="config" label={t("configTab")} />
                </Tabs>
                {toolbarExtra}
              </Box>
              {/* Code textarea */}
              {activeTab === "code" && (
                <LineNumberTextarea
                  textareaRef={fsTextareaRef}
                  value={bodyText}
                  onChange={handleCodeTabChange}
                  readOnly={readOnly}
                  fontSize={settings.fontSize}
                  lineHeight={settings.lineHeight}
                  isDark={isDark}
                />
              )}
              {/* Config textarea */}
              {activeTab === "config" && (
                <LineNumberTextarea
                  textareaRef={configTextareaRef}
                  value={configText}
                  onChange={handleConfigChange}
                  readOnly={readOnly}
                  placeholder={'{\n  "theme": "forest",\n  "themeVariables": {\n    "primaryColor": "#BB2528"\n  }\n}'}
                  fontSize={settings.fontSize}
                  lineHeight={settings.lineHeight}
                  isDark={isDark}
                />
              )}
              {/* Sample Diagrams panel */}
              {!readOnly && (
                <Box sx={{ borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
                  <Box
                    onClick={() => setSamplesOpen((v) => !v)}
                    sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.5, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <SchemaIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} />
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", flex: 1 }}>
                      {t("sampleDiagrams")}
                    </Typography>
                    {samplesOpen ? <ExpandLessIcon sx={{ fontSize: 16, color: "text.secondary" }} /> : <ExpandMoreIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
                  </Box>
                  {samplesOpen && (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, px: 1.5, pb: 1.5 }}>
                      {MERMAID_SAMPLES.filter((s) => s.enabled).map((sample) => (
                        <Chip
                          key={sample.label}
                          label={t(sample.i18nKey)}
                          size="small"
                          onClick={() => handleInsertSample(sample.code)}
                          sx={{ fontSize: "0.7rem", height: 26 }}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          {/* Draggable divider (desktop only) */}
          <Box
            role="separator"
              aria-orientation="vertical"
              aria-label={t("resizeSplitter")}
              aria-valuenow={fsSplitPx}
              aria-valuemin={120}
              aria-valuemax={1200}
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "ArrowLeft") {
                  setFsSplitPx((v) => Math.max(120, v - 40));
                  e.preventDefault();
                } else if (e.key === "ArrowRight") {
                  setFsSplitPx((v) => v + 40);
                  e.preventDefault();
                }
              }}
              onPointerDown={(e: React.PointerEvent) => {
                setFsDragging(true);
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                e.preventDefault();
              }}
              sx={{
                display: isMobile ? "none" : "block",
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
          {/* Horizontal divider (mobile only) */}
          <Divider sx={{ display: isMobile ? "block" : "none" }} />
          {/* Preview area */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Zoom toolbar */}
            <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", px: 1, py: 0.25, minHeight: 32 }}>
              <ToggleButtonGroup size="small" sx={{ height: 26 }}>
                <ToggleButton value="zoomOut" aria-label={t("zoomOut")} sx={{ px: 0.5, py: 0 }} onClick={fsZP.zoomOut}>
                  <Tooltip title={t("zoomOut")} placement="bottom">
                    <ZoomOutIcon sx={{ fontSize: 16 }} />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="zoomIn" aria-label={t("zoomIn")} sx={{ px: 0.5, py: 0 }} onClick={fsZP.zoomIn}>
                  <Tooltip title={t("zoomIn")} placement="bottom">
                    <ZoomInIcon sx={{ fontSize: 16 }} />
                  </Tooltip>
                </ToggleButton>
                {fsZP.isDirty && (
                  <ToggleButton value="zoomReset" aria-label={t("zoomReset")} sx={{ px: 0.5, py: 0 }} onClick={fsZP.reset}>
                    <Tooltip title={t("zoomReset")} placement="bottom">
                      <RestartAltIcon sx={{ fontSize: 16 }} />
                    </Tooltip>
                  </ToggleButton>
                )}
              </ToggleButtonGroup>
              <Typography variant="caption" sx={{ minWidth: 36, textAlign: "center", fontSize: "0.7rem" }}>
                {Math.round(fsZP.zoom * 100)}%
              </Typography>
            </Box>
            {/* Preview */}
            <Box
              sx={{
                flex: 1,
                overflow: "hidden",
                bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
                cursor: fsDragging ? "col-resize" : "grab",
                "&:active": { cursor: fsDragging ? "col-resize" : "grabbing" },
                pointerEvents: fsDragging ? "none" : "auto",
              }}
              onPointerDown={fsZP.handlePointerDown}
              onWheel={fsZP.handleWheel}
            >
              <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`, transformOrigin: "center center", transition: fsZP.isPanningRef.current ? "none" : "transform 0.15s", "@media (prefers-reduced-motion: reduce)": { transition: "none" }, pointerEvents: "none" }}>
                {svg && (
                  <Box role="img" aria-label={extractDiagramAltText(code, "mermaid")} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, SVG_SANITIZE_CONFIG) }} sx={{ width: "100%", "& svg": { width: "100%", height: "auto" } }} />
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Dialog>
  );
}
