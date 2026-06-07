import DOMPurify from "dompurify";
import { common, createLowlight } from "lowlight";
import React, { useCallback, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { CODE_HELLO_SAMPLES } from "../constants/codeHelloSamples";
import { DEFAULT_DARK_BG, DEFAULT_LIGHT_BG, getActionHover, getDivider, getPrimaryMain, getTextPrimary, HLJS_DARK, HLJS_LIGHT, CHIP_FONT_SIZE, FS_CHIP_HEIGHT, FS_PANEL_HEADER_FONT_SIZE, useEditorSettingsContext, useIsDark, EditDialogHeader, EditDialogWrapper } from "@anytime-markdown/markdown-viewer";
import { Chip } from "@anytime-markdown/markdown-viewer/src/ui/Chip";
import { Text } from "@anytime-markdown/markdown-viewer/src/ui/Text";
import { CodeIcon } from "@anytime-markdown/markdown-viewer/src/ui/icons";
import styles from "./CodeBlockEditDialog.module.css";
import type { TextareaSearchState } from "@anytime-markdown/markdown-viewer";
import { useZoomPan } from "../hooks/useZoomPan";
import { DraggableSplitLayout } from "./DraggableSplitLayout";
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
  onApply?: () => void;
  dirty?: boolean;
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
    <div className={styles.samplePanelRoot} style={{ borderTopColor: getDivider(isDark) }}>
      <div
        onClick={() => setSamplesOpen((v) => !v)}
        className={styles.sampleHeader}
        style={{ ["--am-sample-hover-bg"]: getActionHover(isDark) } as CSSProperties}
      >
        <Text variant="caption" className={styles.panelHeaderText} style={{ fontSize: FS_PANEL_HEADER_FONT_SIZE }}>
          {t("sampleContent")}
        </Text>
      </div>
      {samplesOpen && (
        <div className={styles.chipsWrap}>
          {currentLangSample && (
            <Chip
              label={`${language} (Hello World)`}
              size="small"
              variant="outlined"
              onClick={() => handleInsertSample(currentLangSample)}
              style={{ fontSize: CHIP_FONT_SIZE, height: FS_CHIP_HEIGHT, color: getPrimaryMain(isDark), borderColor: getPrimaryMain(isDark) }}
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
                style={{ fontSize: CHIP_FONT_SIZE, height: FS_CHIP_HEIGHT }}
              />
            ))}
        </div>
      )}
    </div>
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
        <div className={styles.previewPane} style={{ backgroundColor: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG }}>
          {renderPreview(fsCode)}
        </div>
      </>
    );
  }
  const h = isDark ? HLJS_DARK : HLJS_LIGHT;
  const hljsVars: CSSProperties = {
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    color: getTextPrimary(isDark),
    ["--hljs-keyword"]: h.keyword,
    ["--hljs-string"]: h.string,
    ["--hljs-comment"]: h.comment,
    ["--hljs-number"]: h.number,
    ["--hljs-title"]: h.title,
    ["--hljs-params"]: h.params,
    ["--hljs-meta"]: h.meta,
    ["--hljs-addition"]: h.addition,
    ["--hljs-addition-bg"]: h.additionBg,
    ["--hljs-deletion"]: h.deletion,
    ["--hljs-deletion-bg"]: h.deletionBg,
  } as CSSProperties;
  return (
    <>
      <ZoomToolbar fsZP={fsZP} t={() => ""} />
      <ZoomablePreview fsZP={fsZP} origin="top-left">
        <pre
          className={styles.hljsPre}
          style={hljsVars}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedHtml, { ALLOWED_TAGS: ["span"], ALLOWED_ATTR: ["class"] }) }}
        />
      </ZoomablePreview>
    </>
  );
}

export function CodeBlockEditDialog({
  open, onClose, label, language, fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch: _fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, thisCode, toolbarExtra, customSamples, renderPreview,
  onApply, dirty, t,
}: Readonly<CodeBlockEditDialogProps>) {
  const isDark = useIsDark();
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
      if (!lowlight.listLanguages().includes(language) || language === "plaintext") {
        return fsCode.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      }
      const tree = lowlight.highlight(language, fsCode);
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
      <div className={styles.codeHeader} style={{ borderBottomColor: getDivider(isDark) }}>
        <Text variant="caption" className={styles.panelHeaderText} style={{ fontSize: FS_PANEL_HEADER_FONT_SIZE }}>
          {t("codeTab")}
        </Text>
        {toolbarExtra}
      </div>
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
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} icon={<CodeIcon fontSize={18} />} onApply={onApply} dirty={dirty} t={t} />

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
