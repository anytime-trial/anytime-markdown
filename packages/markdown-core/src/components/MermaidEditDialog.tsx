import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { Box, Tab, Tabs, useTheme } from "@mui/material";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getDivider } from "../constants/colors";
import { FS_TAB_FONT_SIZE, FS_TOOLBAR_HEIGHT } from "../constants/dimensions";
import { MERMAID_SAMPLES } from "../constants/samples";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { extractDiagramAltText } from "../utils/diagramAltText";
import { extractMermaidConfig, mergeMermaidConfig } from "../utils/mermaidConfig";
import { DraggableSplitLayout } from "./DraggableSplitLayout";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomablePreview } from "./ZoomablePreview";
import { ZoomToolbar } from "./ZoomToolbar";

interface MermaidEditDialogProps {
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
  thisCode?: string;
  onExport?: () => void;
  toolbarExtra?: React.ReactNode;
  onApply?: () => void;
  dirty?: boolean;
  t: (key: string) => string;
}

export function MermaidEditDialog({
  open, onClose, label, svg, code,
  fsCode, onFsCodeChange: _onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch: _fsSearch,
  fsZP, readOnly,
  isCompareMode, compareCode, onMergeApply, thisCode, onExport, toolbarExtra,
  onApply, dirty, t,
}: Readonly<MermaidEditDialogProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();

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
  const handleInsertSample = useCallback((sampleCode: string) => {
    setBodyText(sampleCode);
    onFsTextChange(mergeMermaidConfig(configText, sampleCode));
    setActiveTab("code");
  }, [configText, onFsTextChange]);

  // Scale SVG to match editor font size
  const displaySvg = useMemo(() => {
    if (!svg) return svg;
    const viewBoxMatch = /viewBox="-?[\d.]+ -?[\d.]+ ([\d.]+) [\d.]+"/.exec(svg);
    if (!viewBoxMatch) return svg;
    const viewBoxWidth = Number.parseFloat(viewBoxMatch[1]);
    const targetWidth = (settings.fontSize / 16) * viewBoxWidth;
    return svg
      .replace(/width="100%"/, `width="${targetWidth}"`)
      .replace(/max-width:\s*[\d.]+px/, `max-width: 100%`);
  }, [svg, settings.fontSize]);

  const showCompareView = isCompareMode && compareCode != null;

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="mermaid-edit-title">
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} icon={<AccountTreeIcon sx={{ fontSize: 18 }} />} onApply={onApply} dirty={dirty} t={t} />

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
              {/* Tabs + toolbar */}
              <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: getDivider(isDark) }}>
                <Tabs
                  value={activeTab}
                  onChange={(_, v) => setActiveTab(v)}
                  sx={{ minHeight: FS_TOOLBAR_HEIGHT, flex: 1, "& .MuiTab-root": { minHeight: FS_TOOLBAR_HEIGHT, py: 0.5, px: 2, fontSize: FS_TAB_FONT_SIZE, textTransform: "none" } }}
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
              <SamplePanel samples={MERMAID_SAMPLES.filter(s => s.enabled)} onInsert={handleInsertSample} readOnly={readOnly} t={t} />
            </>
          }
          right={
            <>
              <ZoomToolbar fsZP={fsZP} onExport={onExport} t={t} />
              <ZoomablePreview fsZP={fsZP}>
                {displaySvg && (
                  <Box role="img" aria-label={extractDiagramAltText(code, "mermaid")} dangerouslySetInnerHTML={{ __html: displaySvg }} sx={{ "& svg": { maxWidth: "100%", height: "auto" } }} />
                )}
              </ZoomablePreview>
            </>
          }
        />
      )}
    </EditDialogWrapper>
  );
}
