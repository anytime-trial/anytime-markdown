import { Box, Divider, Tab, Tabs, useMediaQuery, useTheme } from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG } from "../constants/colors";
import { FS_CODE_INITIAL_WIDTH, FS_CODE_MIN_WIDTH, FS_TOOLBAR_HEIGHT } from "../constants/dimensions";
import { REDUCED_MOTION_SX, SPLITTER_SX, TRANSITION_FAST } from "../constants/uiPatterns";
import { PLANTUML_SAMPLES } from "../constants/samples";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { extractDiagramAltText } from "../utils/diagramAltText";
import { extractPlantUmlConfig, mergePlantUmlConfig } from "../utils/plantumlConfig";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomToolbar } from "./ZoomToolbar";

interface PlantUmlEditDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  plantUmlUrl: string;
  code: string;
  fsCode: string;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFsTextChange: (newCode: string) => void;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: TextareaSearchState;
  fsZP: UseZoomPanReturn;
  readOnly?: boolean;
  isCompareMode?: boolean;
  compareCode?: string | null;
  onMergeApply?: (newThisCode: string, newOtherCode: string) => void;
  onCapture?: () => void;
  toolbarExtra?: React.ReactNode;
  t: (key: string) => string;
}

export function PlantUmlEditDialog({
  open, onClose, label, plantUmlUrl, code,
  fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch,
  fsZP, readOnly,
  isCompareMode, compareCode, onMergeApply, onCapture, toolbarExtra,
  t,
}: PlantUmlEditDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const settings = useEditorSettingsContext();

  const [fsSplitPx, setFsSplitPx] = useState(FS_CODE_INITIAL_WIDTH);
  const [fsDragging, setFsDragging] = useState(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  // --- Code / Config tab state ---
  const [activeTab, setActiveTab] = useState<"code" | "config">("code");
  const [configText, setConfigText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const configTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset to Code tab when dialog opens
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setActiveTab("code");
    }
    prevOpenRef.current = open;
  }, [open]);

  // Extract config/body from fsCode when dialog opens
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) { initializedRef.current = false; return; }
    if (initializedRef.current) return;
    if (!fsCode) return;
    initializedRef.current = true;
    const { config, body } = extractPlantUmlConfig(fsCode);
    setConfigText(config);
    setBodyText(body);
  }, [open, fsCode]);

  const handleCodeTabChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newBody = e.target.value;
    setBodyText(newBody);
    onFsTextChange(mergePlantUmlConfig(configText, newBody));
  }, [configText, onFsTextChange]);

  const handleConfigChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newConfig = e.target.value;
    setConfigText(newConfig);
    onFsTextChange(mergePlantUmlConfig(newConfig, bodyText));
  }, [bodyText, onFsTextChange]);

  // --- Sample panel ---
  const handleInsertSample = useCallback((sampleCode: string) => {
    setBodyText(sampleCode);
    onFsTextChange(mergePlantUmlConfig(configText, sampleCode));
    setActiveTab("code");
  }, [configText, onFsTextChange]);

  const showCompareView = isCompareMode && compareCode != null;

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="plantuml-edit-title">
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} t={t} />

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
              setFsSplitPx(Math.min(rect.width - FS_CODE_MIN_WIDTH, Math.max(FS_CODE_MIN_WIDTH, px)));
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
          <Box sx={{ width: isMobile ? "100%" : `${fsSplitPx}px`, height: isMobile ? "40%" : "auto", minWidth: isMobile ? undefined : FS_CODE_MIN_WIDTH, display: "flex", flexDirection: "column", pointerEvents: fsDragging ? "none" : "auto" }}>
              {/* Tabs */}
              <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
                <Tabs
                  value={activeTab}
                  onChange={(_, v) => setActiveTab(v)}
                  sx={{ minHeight: FS_TOOLBAR_HEIGHT, flex: 1, "& .MuiTab-root": { minHeight: FS_TOOLBAR_HEIGHT, py: 0.5, px: 2, fontSize: "0.75rem", textTransform: "none" } }}
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
                  placeholder={"skinparam backgroundColor #FEFECE\nskinparam handwritten true\n!theme cerulean"}
                  fontSize={settings.fontSize}
                  lineHeight={settings.lineHeight}
                  isDark={isDark}
                />
              )}
              <SamplePanel samples={PLANTUML_SAMPLES.filter(s => s.enabled)} onInsert={handleInsertSample} readOnly={readOnly} t={t} />
            </Box>
          {/* Draggable divider (desktop only) */}
          <Box
            role="separator"
              aria-orientation="vertical"
              aria-label={t("resizeSplitter")}
              aria-valuenow={fsSplitPx}
              aria-valuemin={FS_CODE_MIN_WIDTH}
              aria-valuemax={1200}
              tabIndex={0}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "ArrowLeft") {
                  setFsSplitPx((v) => Math.max(FS_CODE_MIN_WIDTH, v - 40));
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
              sx={{ display: isMobile ? "none" : "block", ...SPLITTER_SX }}
            />
          {/* Horizontal divider (mobile only) */}
          <Divider sx={{ display: isMobile ? "block" : "none" }} />
          {/* Preview area */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ZoomToolbar fsZP={fsZP} onCapture={onCapture} t={t} />
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
              <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", transform: `translate(${fsZP.pan.x}px, ${fsZP.pan.y}px) scale(${fsZP.zoom})`, transformOrigin: "center center", transition: fsZP.isPanningRef.current ? "none" : `transform ${TRANSITION_FAST}`, ...REDUCED_MOTION_SX, pointerEvents: "none" }}>
                {plantUmlUrl && (
                  <img src={plantUmlUrl} alt={extractDiagramAltText(code, "plantuml")} referrerPolicy="no-referrer" style={{ maxWidth: "90vw", maxHeight: "85vh", transform: `scale(${settings.fontSize / 16})`, transformOrigin: "center center" }} />
              )}
            </Box>
            </Box>
          </Box>
        </Box>
      )}
    </EditDialogWrapper>
  );
}
