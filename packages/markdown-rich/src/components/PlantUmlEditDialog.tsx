import React, { useCallback, useEffect, useRef, useState } from "react";

import { getDivider, PLANTUML_SAMPLES, useEditorSettingsContext, useIsDark, EditDialogHeader, EditDialogWrapper } from "@anytime-markdown/markdown-viewer";
import { AccountTreeIcon } from "@anytime-markdown/markdown-viewer/src/ui/icons";
import { Tabs } from "@anytime-markdown/markdown-viewer/src/ui/Tabs";
import { Tab } from "@anytime-markdown/markdown-viewer/src/ui/Tab";
import styles from "./PlantUmlEditDialog.module.css";
import type { TextareaSearchState } from "@anytime-markdown/markdown-viewer";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";
import { extractDiagramAltText } from "../utils/diagramAltText";
import { extractPlantUmlConfig, mergePlantUmlConfig } from "../utils/plantumlConfig";
import { DraggableSplitLayout } from "./DraggableSplitLayout";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomablePreview } from "./ZoomablePreview";
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
  thisCode?: string;
  onExport?: () => void;
  onExportSource?: () => void;
  exportSourceKey?: string;
  toolbarExtra?: React.ReactNode;
  onApply?: () => void;
  dirty?: boolean;
  t: (key: string) => string;
}

export function PlantUmlEditDialog({
  open, onClose, label, plantUmlUrl, code,
  fsCode, onFsCodeChange: _onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch: _fsSearch,
  fsZP, readOnly,
  isCompareMode, compareCode, onMergeApply, thisCode, onExport, onExportSource, exportSourceKey, toolbarExtra,
  onApply, dirty, t,
}: Readonly<PlantUmlEditDialogProps>) {
  const isDark = useIsDark();
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
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} icon={<AccountTreeIcon fontSize={18} />} onApply={onApply} dirty={dirty} t={t} />

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
          onPointerCancel={fsZP.handlePointerCancel}
          t={t}
          left={
            <>
              {/* Tabs */}
              <div className={styles.tabsRow} style={{ borderBottomColor: getDivider(isDark) }}>
                <Tabs
                  value={activeTab}
                  onChange={(_, v) => setActiveTab(v as "code" | "config")}
                  style={{ flex: 1 }}
                >
                  <Tab value="code" label={t("codeTab")} />
                  <Tab value="config" label={t("configTab")} />
                </Tabs>
                {toolbarExtra}
              </div>
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
              <ZoomToolbar fsZP={fsZP} onExport={onExport} onExportSource={onExportSource} exportSourceKey={exportSourceKey} t={t} />
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
