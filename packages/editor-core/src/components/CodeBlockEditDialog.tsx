import CodeIcon from "@mui/icons-material/Code";
import { Box, Chip, Typography, useTheme } from "@mui/material";
import DOMPurify from "dompurify";
import { common, createLowlight } from "lowlight";
import React, { useCallback, useMemo, useState } from "react";

import { CODE_HELLO_SAMPLES } from "../constants/codeHelloSamples";
import { FS_CHIP_HEIGHT, FS_TOOLBAR_HEIGHT } from "../constants/dimensions";
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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  toolbarExtra?: React.ReactNode;
  /** Custom samples to use instead of Hello World samples */
  customSamples?: { label: string; i18nKey: string; code: string }[];
  /** Custom preview renderer (replaces syntax highlight preview) */
  renderPreview?: (code: string) => React.ReactNode;
  t: (key: string) => string;
}

export function CodeBlockEditDialog({
  open, onClose, label, language, fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch: _fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, toolbarExtra, customSamples, renderPreview,
  t,
}: CodeBlockEditDialogProps) {
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
      return fsCode.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  }, [fsCode, language]);

  const currentLangSample = CODE_HELLO_SAMPLES[language];
  const sampleEntries = Object.entries(CODE_HELLO_SAMPLES);

  const showCompareView = isCompareMode && compareCode != null;

  const codePanel = (
    <>
      {/* Code toolbar */}
      <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", px: 1, py: 0.25, minHeight: FS_TOOLBAR_HEIGHT }}>
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", flex: 1 }}>
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
      {/* Sample panel */}
      {customSamples ? (
        <SamplePanel samples={customSamples} onInsert={handleInsertSample} readOnly={readOnly} t={t} />
      ) : !readOnly && (
        <Box sx={{ borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
          <Box
            onClick={() => setSamplesOpen((v) => !v)}
            sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.5, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: "action.hover" } }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", flex: 1 }}>
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
                  sx={{ fontSize: "0.7rem", height: FS_CHIP_HEIGHT }}
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
                    sx={{ fontSize: "0.7rem", height: FS_CHIP_HEIGHT }}
                  />
                ))}
            </Box>
          )}
        </Box>
      )}
    </>
  );

  const previewPanel = (
    <>
      <ZoomToolbar fsZP={fsZP} t={t} />
      {renderPreview ? (
        <Box sx={{ flex: 1, overflow: "auto", bgcolor: isDark ? "#F8F9FA" : undefined, p: 2 }}>
          {renderPreview(fsCode)}
        </Box>
      ) : (
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
              color: "text.primary",
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
      )}
    </>
  );

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="codeblock-edit-title">
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} icon={<CodeIcon sx={{ fontSize: 18 }} />} t={t} />

      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={fsCode}
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
