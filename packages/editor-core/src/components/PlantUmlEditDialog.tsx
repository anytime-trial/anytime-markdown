import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { Box, Tab, Tabs, useTheme } from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { FS_TOOLBAR_HEIGHT } from "../constants/dimensions";
import { PLANTUML_SAMPLES } from "../constants/samples";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { extractDiagramAltText } from "../utils/diagramAltText";
import { extractPlantUmlConfig, mergePlantUmlConfig } from "../utils/plantumlConfig";
import { DraggableSplitLayout } from "./DraggableSplitLayout";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomToolbar } from "./ZoomToolbar";
import { ZoomablePreview } from "./ZoomablePreview";

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
  thisCode?: string;
  onCapture?: () => void;
  toolbarExtra?: React.ReactNode;
  t: (key: string) => string;
}

export function PlantUmlEditDialog({
  open, onClose, label, plantUmlUrl, code,
  fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch,
  fsZP, readOnly,
  isCompareMode, compareCode, onMergeApply, thisCode, onCapture, toolbarExtra,
  t,
}: PlantUmlEditDialogProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();

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
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} icon={<AccountTreeIcon sx={{ fontSize: 18 }} />} t={t} />

      {/* Compare view */}
      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={thisCode ?? fsCode}
          initialRightCode={compareCode}
          onMergeApply={onMergeApply ?? (() => {})}
          t={t}
        />
      ) : (
        /* Normal view: Code/Config + Divider + Preview */
        <DraggableSplitLayout
          onPointerMove={fsZP.handlePointerMove}
          onPointerUp={fsZP.handlePointerUp}
          t={t}
          left={
            <>
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
            </>
          }
          right={
            <>
              <ZoomToolbar fsZP={fsZP} onCapture={onCapture} t={t} />
              <ZoomablePreview fsZP={fsZP}>
                {plantUmlUrl && (
                  <img src={plantUmlUrl} alt={extractDiagramAltText(code, "plantuml")} referrerPolicy="no-referrer" style={{ maxWidth: "90vw", maxHeight: "85vh", transform: `scale(${settings.fontSize / 16})`, transformOrigin: "center center" }} />
                )}
              </ZoomablePreview>
            </>
          }
        />
      )}
    </EditDialogWrapper>
  );
}
