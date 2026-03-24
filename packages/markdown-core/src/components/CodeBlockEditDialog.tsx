import CodeIcon from "@mui/icons-material/Code";
import { Box, Chip, Typography, useTheme } from "@mui/material";
import DOMPurify from "dompurify";
import { common, createLowlight } from "lowlight";
import React, { useCallback, useMemo, useState } from "react";

import { CODE_HELLO_SAMPLES } from "../constants/codeHelloSamples";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getActionHover, getDivider, getTextPrimary } from "../constants/colors";
import { CHIP_FONT_SIZE, FS_CHIP_HEIGHT, FS_PANEL_HEADER_FONT_SIZE, FS_TOOLBAR_HEIGHT } from "../constants/dimensions";
import type { TextareaSearchState } from "../hooks/useTextareaSearch";
import { useZoomPan } from "../hooks/useZoomPan";
import { useEditorSettingsContext } from "../useEditorSettings";
import { DraggableSplitLayout } from "./DraggableSplitLayout";
import { EditDialogHeader } from "./EditDialogHeader";
import { EditDialogWrapper } from "./EditDialogWrapper";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomablePreview } from "./ZoomablePreview";
import { ZoomToolbar } from "./ZoomToolbar";

const lowlight = createLowlight(common);

/** Convert hast nodes to HTML string */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hastToHtml(nodes: any[]): string {
  return nodes.map((node) => {
    if (node.type === "text") return escapeHtml(node.value);
    if (node.type === "element") {
      const cls = node.properties?.className?.join(" ") ?? "";
      const inner = hastToHtml(node.children ?? []);
      return cls ? `<span class="${cls}">${inner}</span>` : `<span>${inner}</span>`;
    }
    return "";
  }).join("");
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

interface CodeBlockEditDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  language: string;
  fsCode: string;
  onFsCodeChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFsTextChange: (newCode: string) => void;
  fsTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  fsSearch: TextareaSearchState;
  readOnly?: boolean;
  isCompareMode?: boolean;
  compareCode?: string | null;
  onMergeApply?: (newThisCode: string, newOtherCode: string) => void;
  thisCode?: string;
  toolbarExtra?: React.ReactNode;
  /** Custom samples to use instead of Hello World samples */
  customSamples?: { label: string; i18nKey: string; code: string }[];
  /** Custom preview renderer (replaces syntax highlight preview) */
  renderPreview?: (code: string) => React.ReactNode;
  t: (key: string) => string;
}

/** Built-in Hello World sample panel (shown when no customSamples provided) */
function BuiltInSamplePanel({
  language, samplesOpen, setSamplesOpen, handleInsertSample, isDark, t,
}: Readonly<{
  language: string;
  samplesOpen: boolean;
  setSamplesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleInsertSample: (code: string) => void;
  isDark: boolean;
  t: (key: string) => string;
}>) {
  const currentLangSample = CODE_HELLO_SAMPLES[language];
  const sampleEntries = Object.entries(CODE_HELLO_SAMPLES);
  return (
    <Box sx={{ borderTop: 1, borderColor: getDivider(isDark), flexShrink: 0 }}>
      <Box
        onClick={() => setSamplesOpen((v) => !v)}
        sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.5, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: getActionHover(isDark) } }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: FS_PANEL_HEADER_FONT_SIZE, flex: 1 }}>
          {t("sampleContent")}
        </Typography>
      </Box>
      {samplesOpen && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, px: 1.5, pb: 1.5 }}>
          {currentLangSample && (
            <Chip
              label={`${language} (Hello World)`}
              size="small"
              color="primary"
              variant="outlined"
              onClick={() => handleInsertSample(currentLangSample)}
              sx={{ fontSize: CHIP_FONT_SIZE, height: FS_CHIP_HEIGHT }}
            />
          )}
          {sampleEntries
            .filter(([lang]) => lang !== language)
            .map(([lang, code]) => (
              <Chip
                key={lang}
                label={lang}
                size="small"
                onClick={() => handleInsertSample(code)}
                sx={{ fontSize: CHIP_FONT_SIZE, height: FS_CHIP_HEIGHT }}
              />
            ))}
        </Box>
      )}
    </Box>
  );
}

/** Syntax-highlighted code preview panel */
function SyntaxPreviewPanel({
  fsZP, renderPreview, fsCode, isDark, settings, highlightedHtml,
}: Readonly<{
  fsZP: ReturnType<typeof useZoomPan>;
  renderPreview?: (code: string) => React.ReactNode;
  fsCode: string;
  isDark: boolean;
  settings: ReturnType<typeof useEditorSettingsContext>;
  highlightedHtml: string;
}>) {
  if (renderPreview) {
    return (
      <>
        <ZoomToolbar fsZP={fsZP} t={() => ""} />
        <Box sx={{ flex: 1, overflow: "auto", bgcolor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG, p: 2 }}>
          {renderPreview(fsCode)}
        </Box>
      </>
    );
  }
  return (
    <>
      <ZoomToolbar fsZP={fsZP} t={() => ""} />
      <ZoomablePreview fsZP={fsZP} origin="top-left">
        <Box
          component="pre"
          sx={{
            fontFamily: "monospace",
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            p: 2,
            m: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            color: getTextPrimary(isDark),
            "& .hljs-keyword, & .hljs-selector-tag, & .hljs-built_in, & .hljs-type": { color: isDark ? "#ff7b72" : "#cf222e" },
            "& .hljs-string, & .hljs-attr, & .hljs-template-tag, & .hljs-template-variable": { color: isDark ? "#a5d6ff" : "#0a3069" },
            "& .hljs-comment, & .hljs-doctag": { color: isDark ? "#8b949e" : "#6e7781" },
            "& .hljs-number, & .hljs-literal, & .hljs-variable, & .hljs-regexp": { color: isDark ? "#79c0ff" : "#0550ae" },
            "& .hljs-title": { color: isDark ? "#d2a8ff" : "#8250df" },
            "& .hljs-params": { color: isDark ? "#c9d1d9" : "#24292f" },
            "& .hljs-meta": { color: isDark ? "#ffa657" : "#953800" },
            "& .hljs-symbol, & .hljs-bullet": { color: isDark ? "#ffa657" : "#953800" },
            "& .hljs-property, & .hljs-name": { color: isDark ? "#79c0ff" : "#0550ae" },
          }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedHtml, { ALLOWED_TAGS: ["span"], ALLOWED_ATTR: ["class"] }) }}
        />
      </ZoomablePreview>
    </>
  );
}

export function CodeBlockEditDialog({
  open, onClose, label, language, fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch: _fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, thisCode, toolbarExtra, customSamples, renderPreview,
  t,
}: Readonly<CodeBlockEditDialogProps>) {
  const isDark = useTheme().palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const fsZP = useZoomPan();

  const [samplesOpen, setSamplesOpen] = useState(false);

  const handleInsertSample = useCallback((code: string) => {
    onFsTextChange(code);
  }, [onFsTextChange]);

  // Syntax-highlighted HTML
  const highlightedHtml = useMemo(() => {
    if (!fsCode) return "";
    try {
      const tree = lowlight.listLanguages().includes(language)
        ? lowlight.highlight(language, fsCode)
        : lowlight.highlightAuto(fsCode);
      return hastToHtml(tree.children);
    } catch {
      return fsCode.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    }
  }, [fsCode, language]);

  const showCompareView = isCompareMode && compareCode != null;

  const builtInPanel = readOnly
    ? null
    : <BuiltInSamplePanel language={language} samplesOpen={samplesOpen} setSamplesOpen={setSamplesOpen} handleInsertSample={handleInsertSample} isDark={isDark} t={t} />;
  const samplePanel = customSamples
    ? <SamplePanel samples={customSamples} onInsert={handleInsertSample} readOnly={readOnly} t={t} />
    : builtInPanel;

  const codePanel = (
    <>
      <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: getDivider(isDark), px: 1, py: 0.25, minHeight: FS_TOOLBAR_HEIGHT }}>
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: FS_PANEL_HEADER_FONT_SIZE, flex: 1 }}>
          {t("codeTab")}
        </Typography>
        {toolbarExtra}
      </Box>
      <LineNumberTextarea
        textareaRef={fsTextareaRef}
        value={fsCode}
        onChange={onFsCodeChange}
        readOnly={readOnly}
        fontSize={settings.fontSize}
        lineHeight={settings.lineHeight}
        isDark={isDark}
      />
      {samplePanel}
    </>
  );

  const previewPanel = (
    <SyntaxPreviewPanel fsZP={fsZP} renderPreview={renderPreview} fsCode={fsCode} isDark={isDark} settings={settings} highlightedHtml={highlightedHtml} />
  );

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="codeblock-edit-title">
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} icon={<CodeIcon sx={{ fontSize: 18 }} />} t={t} />

      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={thisCode ?? fsCode}
          initialRightCode={compareCode}
          onMergeApply={onMergeApply ?? (() => {})}
          t={t}
        />
      ) : (
        <DraggableSplitLayout
          initialPercent={renderPreview ? 50 : undefined}
          left={codePanel}
          right={previewPanel}
          t={t}
        />
      )}
    </EditDialogWrapper>
  );
}
