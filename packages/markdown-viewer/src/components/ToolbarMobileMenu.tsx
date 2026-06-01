import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SaveIcon from "@mui/icons-material/Save";
import SaveAsIcon from "@mui/icons-material/SaveAs";
import SettingsIcon from "@mui/icons-material/Settings";
import {
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import React from "react";

import type { TranslationFn } from "../types";
import type { ToolbarFileCapabilities, ToolbarFileHandlers } from "../types/toolbar";

interface ToolbarMobileMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  mobileMoreRef: React.RefObject<HTMLButtonElement | null>;

  outlineOpen: boolean;
  commentOpen?: boolean;
  inlineMergeOpen: boolean;
  sourceMode: boolean;
  readonlyMode?: boolean;

  hideOutline?: boolean;
  hideComments?: boolean;
  hideSettings?: boolean;
  hideVersionInfo?: boolean;
  hideFileOps?: boolean;

  fileHandlers?: ToolbarFileHandlers;
  fileCapabilities?: ToolbarFileCapabilities;

  onToggleOutline: () => void;
  onToggleComments?: () => void;
  onSetHelpAnchor: (el: HTMLElement) => void;
  onOpenSettings?: () => void;
  onOpenVersionDialog?: () => void;
  t: TranslationFn;
}

export const ToolbarMobileMenu = React.memo(function ToolbarMobileMenu({
  anchorEl,
  onClose,
  mobileMoreRef: _mobileMoreRef,
  outlineOpen,
  commentOpen,
  inlineMergeOpen,
  sourceMode,
  readonlyMode,
  hideOutline,
  hideComments,
  hideSettings,
  hideVersionInfo,
  hideFileOps,
  fileHandlers,
  fileCapabilities,
  onToggleOutline,
  onToggleComments,
  onSetHelpAnchor: _onSetHelpAnchor,
  onOpenSettings,
  onOpenVersionDialog,
  t,
}: ToolbarMobileMenuProps) {
  const { hasFileHandle, supportsDirectAccess, externalSaveOnly } = fileCapabilities ?? {};
  const readOnly = readonlyMode;

  function buildFileItems(): React.ReactNode[] {
    if (hideFileOps || !fileHandlers) return [];
    const items: React.ReactNode[] = [];
    if (externalSaveOnly) {
      items.push(
        <MenuItem key="f-save" onClick={() => { fileHandlers.onSaveFile?.(); onClose(); }} disabled={readOnly || !hasFileHandle}>
          <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("saveFile")}</ListItemText>
        </MenuItem>,
      );
    } else if (supportsDirectAccess) {
      items.push(
        <MenuItem key="f-open" onClick={() => { fileHandlers.onOpenFile?.(); onClose(); }}>
          <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("openFile")}</ListItemText>
        </MenuItem>,
        <MenuItem key="f-save" onClick={() => { fileHandlers.onSaveFile?.(); onClose(); }} disabled={readOnly || !hasFileHandle}>
          <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("saveFile")}</ListItemText>
        </MenuItem>,
        <MenuItem key="f-saveAs" onClick={() => { fileHandlers.onSaveAsFile?.(); onClose(); }} disabled={readOnly}>
          <ListItemIcon><SaveAsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("saveAsFile")}</ListItemText>
        </MenuItem>,
      );
    } else {
      items.push(
        <MenuItem key="f-open" onClick={() => { fileHandlers.onImport(); onClose(); }}>
          <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("openFile")}</ListItemText>
        </MenuItem>,
        <MenuItem key="f-saveAs" onClick={() => { fileHandlers.onDownload(); onClose(); }} disabled={readOnly}>
          <ListItemIcon><SaveAsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("saveAsFile")}</ListItemText>
        </MenuItem>,
      );
    }
    if (fileHandlers.onExportPdf) {
      items.push(
        <MenuItem key="f-pdf" onClick={() => { fileHandlers.onExportPdf?.(); onClose(); }} disabled={sourceMode || inlineMergeOpen}>
          <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("exportPdf")}</ListItemText>
        </MenuItem>,
      );
    }
    return items;
  }

  const fileItems = buildFileItems();

  return (
    <Menu
      anchorEl={anchorEl}
      open={!!anchorEl}
      onClose={onClose}
    >
      {[
        ...fileItems,
        ...(fileItems.length > 0 ? [<Divider key="divider-file" />] : []),
        ...(hideOutline ? [] : [
          <MenuItem
            key="outline"
            onClick={() => { onToggleOutline(); onClose(); }}
            disabled={inlineMergeOpen || sourceMode}
          >
            <ListItemIcon><ListAltIcon fontSize="small" color={outlineOpen ? "primary" : "inherit"} /></ListItemIcon>
            <ListItemText>{t("outline")}</ListItemText>
          </MenuItem>,
        ]),
        ...(!hideComments && onToggleComments ? [
          <MenuItem
            key="comments"
            onClick={() => { onToggleComments(); onClose(); }}
            disabled={inlineMergeOpen || sourceMode}
          >
            <ListItemIcon><ChatBubbleOutlineIcon fontSize="small" color={commentOpen ? "primary" : "inherit"} /></ListItemIcon>
            <ListItemText>{t("commentPanel") || "Comments"}</ListItemText>
          </MenuItem>,
        ] : []),
        <Divider key="divider-panel" />,
        ...(!hideSettings && onOpenSettings ? [
          <MenuItem
            key="settings"
            onClick={() => { onOpenSettings(); onClose(); }}
          >
            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("editorSettings")}</ListItemText>
          </MenuItem>,
        ] : []),
        <Divider key="divider" />,
        ...(hideVersionInfo ? [] : [
          <MenuItem
            key="versionInfo"
            onClick={() => { onOpenVersionDialog?.(); onClose(); }}
          >
            <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("versionInfo")}</ListItemText>
          </MenuItem>,
        ]),
      ]}
    </Menu>
  );
});
