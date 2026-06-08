import DOMPurify from "dompurify";
import React, { useCallback, useState } from "react";

import { getDivider, getErrorMain, getPrimaryMain, getTextSecondary, FS_PANEL_HEADER_FONT_SIZE, MENU_ITEM_FONT_SIZE, MATH_SAMPLES, useEditorFeaturesContext, useEditorSettingsContext, useIsDark, EditDialogHeader, EditDialogWrapper } from "@anytime-markdown/markdown-viewer";
import { IconButton } from "@anytime-markdown/markdown-viewer/src/ui/IconButton";
import { Tooltip } from "@anytime-markdown/markdown-viewer/src/ui/Tooltip";
import { Text } from "@anytime-markdown/markdown-viewer/src/ui/Text";
import { FunctionsIcon, ShowChartIcon } from "@anytime-markdown/markdown-viewer/src/ui/icons";
import styles from "./MathEditDialog.module.css";
import panels from "./dialogPanels.module.css";
import type { TextareaSearchState } from "@anytime-markdown/markdown-viewer";
import { MATH_SANITIZE_CONFIG, useKatexRender } from "../hooks/useKatexRender";
import { useZoomPan } from "../hooks/useZoomPan";
import { GraphView } from "./codeblock/GraphView";
import { DraggableSplitLayout } from "./DraggableSplitLayout";
import { FullscreenDiffView } from "./FullscreenDiffView";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { SamplePanel } from "./SamplePanel";
import { ZoomablePreview } from "./ZoomablePreview";
import { ZoomToolbar } from "./ZoomToolbar";

interface MathEditDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
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
  onApply?: () => void;
  dirty?: boolean;
  t: (key: string) => string;
}

export function MathEditDialog({
  open, onClose, label,
  fsCode, onFsCodeChange, onFsTextChange, fsTextareaRef, fsSearch: _fsSearch,
  readOnly, isCompareMode, compareCode, onMergeApply, thisCode, toolbarExtra,
  onApply, dirty, t,
}: Readonly<MathEditDialogProps>) {
  const isDark = useIsDark();
  const settings = useEditorSettingsContext();
  const { hideGraph } = useEditorFeaturesContext();
  const [graphEnabled, setGraphEnabled] = useState(false);

  // Zoom/pan for preview
  const fsZP = useZoomPan();

  // Live math preview
  const { html: mathHtml, error: mathError } = useKatexRender({ code: fsCode, isMath: open });

  // --- Sample panel ---
  const handleInsertSample = useCallback((sampleCode: string) => {
    onFsTextChange(sampleCode);
  }, [onFsTextChange]);

  const showCompareView = isCompareMode && compareCode != null;

  return (
    <EditDialogWrapper open={open} onClose={onClose} ariaLabelledBy="math-edit-title">
      <EditDialogHeader label={label} onClose={onClose} showCompareView={showCompareView} icon={<FunctionsIcon fontSize={18} />} onApply={onApply} dirty={dirty} t={t} />

      {/* Compare view */}
      {showCompareView ? (
        <FullscreenDiffView
          initialLeftCode={thisCode ?? fsCode}
          initialRightCode={compareCode}
          onMergeApply={onMergeApply ?? (() => {})}
          t={t}
        />
      ) : (
        /* Normal view: Code + Divider + Preview */
        <DraggableSplitLayout
          t={t}
          left={
            <>
              {/* Code toolbar */}
              <div className={panels.codeHeader} style={{ borderBottomColor: getDivider(isDark) }}>
                <Text variant="caption" className={panels.panelHeaderText} style={{ fontSize: FS_PANEL_HEADER_FONT_SIZE }}>
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
              <SamplePanel samples={MATH_SAMPLES.filter(s => s.enabled)} onInsert={handleInsertSample} readOnly={readOnly} t={t} />
            </>
          }
          right={
            <div className={styles.rightCol}>
              <div className={styles.toolbarRow}>
                <div className={styles.flex1}>
                  <ZoomToolbar fsZP={fsZP} t={t} />
                </div>
                {!hideGraph && (
                <Tooltip title={graphEnabled ? t("hideGraph") : t("showGraph")} placement="bottom">
                  <IconButton
                    size="xs"
                    style={{ marginRight: 8 }}
                    onClick={() => setGraphEnabled(prev => !prev)}
                    aria-label={graphEnabled ? t("hideGraph") : t("showGraph")}
                  >
                    <ShowChartIcon fontSize={16} color={graphEnabled ? getPrimaryMain(isDark) : getTextSecondary(isDark)} />
                  </IconButton>
                </Tooltip>
                )}
              </div>
              {!hideGraph && graphEnabled ? (
                <div className={styles.graphPane}>
                  <GraphView code={fsCode} enabled={graphEnabled} isDark={isDark} fill />
                </div>
              ) : (
                <ZoomablePreview fsZP={fsZP}>
                  {mathError && (
                    <Text style={{ color: getErrorMain(isDark), fontFamily: "monospace", fontSize: MENU_ITEM_FONT_SIZE }}>
                      {mathError}
                    </Text>
                  )}
                  {mathHtml && (
                    <div
                      className={styles.katexBox}
                      role="img"
                      aria-label={`${t("mathFormula")}: ${fsCode}`}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathHtml, MATH_SANITIZE_CONFIG) }}
                    />
                  )}
                </ZoomablePreview>
              )}
            </div>
          }
        />
      )}
    </EditDialogWrapper>
  );
}
