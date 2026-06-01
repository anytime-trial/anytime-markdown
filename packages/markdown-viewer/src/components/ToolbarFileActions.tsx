import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SaveIcon from "@mui/icons-material/Save";
import SaveAsIcon from "@mui/icons-material/SaveAs";
import {
  Box,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import React from "react";

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
      <Box sx={{ display: { xs: "none", md: "contents" } }}>
        <ToggleButtonGroup size="small" aria-label={t("fileActions")} sx={{ height: 30 }}>
        {externalSaveOnly ? ([
          <ToggleButton key="save" value="save" onClick={onSaveFile} disabled={readonlyMode || !hasFileHandle} aria-label={t("saveFile")} sx={{ px: 0.75, py: 0.25 }}>
            <Tooltip title={hasFileHandle ? tip(t, "saveFile", tooltipShortcuts) : t("saveFileNoHandle")}>
              <span style={{ display: "inline-flex" }}><SaveIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>,
        ]) : ([
          ...(supportsDirectAccess ? [
            <ToggleButton key="open" value="open" onClick={onOpenFile} aria-label={t("openFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={tip(t, "openFile", tooltipShortcuts)}>
                <FolderOpenIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="save" value="save" onClick={onSaveFile} disabled={readonlyMode || !hasFileHandle} aria-label={t("saveFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={hasFileHandle ? tip(t, "saveFile", tooltipShortcuts) : t("saveFileNoHandle")}>
                <span style={{ display: "inline-flex" }}><SaveIcon fontSize="small" /></span>
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="saveAs" value="saveAs" onClick={onSaveAsFile} disabled={readonlyMode} aria-label={t("saveAsFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={tip(t, "saveAsFile", tooltipShortcuts)}>
                <span style={{ display: "inline-flex" }}><SaveAsIcon fontSize="small" /></span>
              </Tooltip>
            </ToggleButton>,
          ] : [
            <ToggleButton key="open" value="open" onClick={onImport} aria-label={t("openFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={t("openFile")}>
                <FolderOpenIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="saveAs" value="saveAs" onClick={onDownload} disabled={readonlyMode} aria-label={t("saveAsFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={t("saveAsFile")}>
                <span style={{ display: "inline-flex" }}><SaveAsIcon fontSize="small" /></span>
              </Tooltip>
            </ToggleButton>,
          ]),
        ])}
        {onExportPdf && (
          <ToggleButton value="exportPdf" onClick={onExportPdf} disabled={sourceMode || inlineMergeOpen} aria-label={t("exportPdf")} sx={{ px: 0.75, py: 0.25 }}>
            <Tooltip title={t("exportPdf")}>
              <span style={{ display: "inline-flex" }}><PictureAsPdfIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>
        )}
        </ToggleButtonGroup>
        {inlineMergeOpen && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <ToggleButtonGroup size="small" aria-label={t("mergeRight")} sx={{ height: 30 }}>
              <ToggleButton value="open" onClick={onLoadRightFile} aria-label={t("loadCompareFile")} sx={{ px: 0.75, py: 0.25 }}>
                <Tooltip title={t("mergeLoadFileRight")}>
                  <FolderOpenIcon fontSize="small" />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </>
        )}
      </Box>
    </>
  );
});
