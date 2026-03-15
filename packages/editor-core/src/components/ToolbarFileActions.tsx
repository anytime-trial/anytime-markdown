import DescriptionIcon from "@mui/icons-material/Description";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SaveIcon from "@mui/icons-material/Save";
import SaveAsIcon from "@mui/icons-material/SaveAs";
import {
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import React, { useState } from "react";

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
  reviewMode,
  inlineMergeOpen,
  tooltipShortcuts,
  t,
}: ToolbarFileActionsProps) {
  const {
    onDownload, onImport, onClear, onOpenFile, onSaveFile, onSaveAsFile,
    onExportPdf, onLoadRightFile,
  } = fileHandlers;
  const { hasFileHandle, supportsDirectAccess, externalSaveOnly } = fileCapabilities ?? {};
  const [fileMenuAnchorEl, setFileMenuAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      {/* Mobile: single file menu button */}
      <IconButton
        size="small"
        aria-label={t("fileActions")}
        onClick={(e) => setFileMenuAnchorEl(e.currentTarget)}
        sx={{ display: { xs: "inline-flex", md: "none" } }}
      >
        <InsertDriveFileIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={fileMenuAnchorEl}
        open={!!fileMenuAnchorEl}
        onClose={() => setFileMenuAnchorEl(null)}
      >
        {!externalSaveOnly && (
          <MenuItem onClick={() => { onClear(); setFileMenuAnchorEl(null); }} disabled={readonlyMode || reviewMode}>
            <ListItemIcon><DescriptionIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("createNew")}</ListItemText>
          </MenuItem>
        )}
        {externalSaveOnly ? ([
          <MenuItem key="save" onClick={() => { onSaveFile?.(); setFileMenuAnchorEl(null); }} disabled={!hasFileHandle}>
            <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("saveFile")}</ListItemText>
          </MenuItem>,
        ]) : supportsDirectAccess ? ([
          <MenuItem key="open" onClick={() => { onOpenFile?.(); setFileMenuAnchorEl(null); }}>
            <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("openFile")}</ListItemText>
          </MenuItem>,
          <MenuItem key="save" onClick={() => { onSaveFile?.(); setFileMenuAnchorEl(null); }} disabled={!hasFileHandle}>
            <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("saveFile")}</ListItemText>
          </MenuItem>,
          <MenuItem key="saveAs" onClick={() => { onSaveAsFile?.(); setFileMenuAnchorEl(null); }}>
            <ListItemIcon><SaveAsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("saveAsFile")}</ListItemText>
          </MenuItem>,
        ]) : ([
          <MenuItem key="open" onClick={() => { onImport(); setFileMenuAnchorEl(null); }}>
            <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("openFile")}</ListItemText>
          </MenuItem>,
          <MenuItem key="saveAs" onClick={() => { onDownload(); setFileMenuAnchorEl(null); }}>
            <ListItemIcon><SaveAsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("saveAsFile")}</ListItemText>
          </MenuItem>,
        ])}
        {onExportPdf && (
          <MenuItem onClick={() => { onExportPdf(); setFileMenuAnchorEl(null); }} disabled={sourceMode || inlineMergeOpen}>
            <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("exportPdf")}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Desktop: individual file buttons */}
      <Box sx={{ display: { xs: "none", md: "contents" } }}>
        <ToggleButtonGroup size="small" aria-label={t("fileActions")} sx={{ height: 30 }}>
        {externalSaveOnly ? ([
          <ToggleButton key="save" value="save" onClick={onSaveFile} disabled={!hasFileHandle} aria-label={t("saveFile")} sx={{ px: 0.75, py: 0.25 }}>
            <Tooltip title={hasFileHandle ? tip(t, "saveFile", tooltipShortcuts) : t("saveFileNoHandle")}>
              <span style={{ display: "inline-flex" }}><SaveIcon fontSize="small" /></span>
            </Tooltip>
          </ToggleButton>,
        ]) : ([
          <ToggleButton key="new" value="new" onClick={onClear} disabled={readonlyMode || reviewMode} aria-label={t("createNew")} sx={{ px: 0.75, py: 0.25 }}>
            <Tooltip title={tip(t, "createNew", tooltipShortcuts)}>
              <DescriptionIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>,
          ...(supportsDirectAccess ? [
            <ToggleButton key="open" value="open" onClick={onOpenFile} aria-label={t("openFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={tip(t, "openFile", tooltipShortcuts)}>
                <FolderOpenIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="save" value="save" onClick={onSaveFile} disabled={!hasFileHandle} aria-label={t("saveFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={hasFileHandle ? tip(t, "saveFile", tooltipShortcuts) : t("saveFileNoHandle")}>
                <span style={{ display: "inline-flex" }}><SaveIcon fontSize="small" /></span>
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="saveAs" value="saveAs" onClick={onSaveAsFile} aria-label={t("saveAsFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={tip(t, "saveAsFile", tooltipShortcuts)}>
                <SaveAsIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>,
          ] : [
            <ToggleButton key="open" value="open" onClick={onImport} aria-label={t("openFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={t("openFile")}>
                <FolderOpenIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>,
            <ToggleButton key="saveAs" value="saveAs" onClick={onDownload} aria-label={t("saveAsFile")} sx={{ px: 0.75, py: 0.25 }}>
              <Tooltip title={t("saveAsFile")}>
                <SaveAsIcon fontSize="small" />
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
