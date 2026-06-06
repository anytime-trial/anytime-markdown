import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SaveIcon from "@mui/icons-material/Save";
import SaveAsIcon from "@mui/icons-material/SaveAs";
import { Tooltip } from "../ui/Tooltip";
import React from "react";

import { Divider } from "../ui/Divider";
import { ToggleButton } from "../ui/ToggleButton";
import { ToggleButtonGroup } from "../ui/ToggleButtonGroup";
import styles from "./ToolbarFileActions.module.css";

import type { TranslationFn } from "../types";
import type { ToolbarFileCapabilities, ToolbarFileHandlers } from "../types/toolbar";

/** ツールチップにショートカットキーを付加 */
function tip(t: TranslationFn, key: string, shortcuts: Record<string, string>): string {
  const shortcut = shortcuts[key];
  return shortcut ? `${t(key)}  (${shortcut})` : t(key);
}

interface ToolbarFileActionsProps {
  fileHandlers: ToolbarFileHandlers;
  fileCapabilities?: ToolbarFileCapabilities;
  sourceMode: boolean;
  readonlyMode?: boolean;
  reviewMode?: boolean;
  inlineMergeOpen: boolean;
  tooltipShortcuts: Record<string, string>;
  t: TranslationFn;
}

export const ToolbarFileActions = React.memo(function ToolbarFileActions({
  fileHandlers,
  fileCapabilities,
  sourceMode,
  readonlyMode,
  reviewMode: _reviewMode,
  inlineMergeOpen,
  tooltipShortcuts,
  t,
}: ToolbarFileActionsProps) {
  const {
    onDownload, onImport, onOpenFile, onSaveFile, onSaveAsFile,
    onExportPdf, onLoadRightFile,
  } = fileHandlers;
  const { hasFileHandle, supportsDirectAccess, externalSaveOnly } = fileCapabilities ?? {};

  return (
    <>
      {/* Desktop: individual file buttons */}
      <div className={styles.desktopContents}>
        <ToggleButtonGroup size="small" aria-label={t("fileActions")} className={styles.groupHeight}>
        {externalSaveOnly ? ([
          <ToggleButton key="save" value="save" onClick={onSaveFile} disabled={readonlyMode || !hasFileHandle} aria-label={t("saveFile")} className={styles.toggleBtn}>
            <Tooltip title={hasFileHandle ? tip(t, "saveFile", tooltipShortcuts) : t("saveFileNoHandle")}>
              <span style={{ display: "inline-flex" }}><SaveIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>,
        ]) : ([
          ...(supportsDirectAccess ? [
            <ToggleButton key="open" value="open" onClick={onOpenFile} aria-label={t("openFile")} className={styles.toggleBtn}>
              <Tooltip title={tip(t, "openFile", tooltipShortcuts)}>
                <FolderOpenIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="save" value="save" onClick={onSaveFile} disabled={readonlyMode || !hasFileHandle} aria-label={t("saveFile")} className={styles.toggleBtn}>
              <Tooltip title={hasFileHandle ? tip(t, "saveFile", tooltipShortcuts) : t("saveFileNoHandle")}>
                <span style={{ display: "inline-flex" }}><SaveIcon fontSize="small" /></span>
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="saveAs" value="saveAs" onClick={onSaveAsFile} disabled={readonlyMode} aria-label={t("saveAsFile")} className={styles.toggleBtn}>
              <Tooltip title={tip(t, "saveAsFile", tooltipShortcuts)}>
                <span style={{ display: "inline-flex" }}><SaveAsIcon fontSize="small" /></span>
              </Tooltip>
            </ToggleButton>,
          ] : [
            <ToggleButton key="open" value="open" onClick={onImport} aria-label={t("openFile")} className={styles.toggleBtn}>
              <Tooltip title={t("openFile")}>
                <FolderOpenIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="saveAs" value="saveAs" onClick={onDownload} disabled={readonlyMode} aria-label={t("saveAsFile")} className={styles.toggleBtn}>
              <Tooltip title={t("saveAsFile")}>
                <span style={{ display: "inline-flex" }}><SaveAsIcon fontSize="small" /></span>
              </Tooltip>
            </ToggleButton>,
          ]),
        ])}
        {onExportPdf && (
          <ToggleButton value="exportPdf" onClick={onExportPdf} disabled={sourceMode || inlineMergeOpen} aria-label={t("exportPdf")} className={styles.toggleBtn}>
            <Tooltip title={t("exportPdf")}>
              <span style={{ display: "inline-flex" }}><PictureAsPdfIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>
        )}
        </ToggleButtonGroup>
        {inlineMergeOpen && (
          <>
            <Divider orientation="vertical" flexItem style={{ marginLeft: "4px", marginRight: "4px" }} />
            <ToggleButtonGroup size="small" aria-label={t("mergeRight")} className={styles.groupHeight}>
              <ToggleButton value="open" onClick={onLoadRightFile} aria-label={t("loadCompareFile")} className={styles.toggleBtn}>
                <Tooltip title={t("mergeLoadFileRight")}>
                  <FolderOpenIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </>
        )}
      </div>
    </>
  );
});
