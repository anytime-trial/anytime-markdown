import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ListAltIcon from "@mui/icons-material/ListAlt";
import {
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import React from "react";

import type { TranslationFn } from "../types";

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
  readonlyMode: _readonlyMode,
  hideOutline,
  hideComments,
  hideSettings: _hideSettings,
  hideVersionInfo,
  onToggleOutline,
  onToggleComments,
  onSetHelpAnchor: _onSetHelpAnchor,
  onOpenSettings: _onOpenSettings,
  onOpenVersionDialog,
  t,
}: ToolbarMobileMenuProps) {
  return (
    <Menu
      anchorEl={anchorEl}
      open={!!anchorEl}
      onClose={onClose}
    >
      {!hideOutline && <MenuItem
        onClick={() => { onToggleOutline(); onClose(); }}
        disabled={inlineMergeOpen || sourceMode}
      >
        <ListItemIcon><ListAltIcon fontSize="small" color={outlineOpen ? "primary" : "inherit"} /></ListItemIcon>
        <ListItemText>{t("outline")}</ListItemText>
      </MenuItem>}
      {!hideComments && onToggleComments && (
        <MenuItem
          onClick={() => { onToggleComments(); onClose(); }}
          disabled={inlineMergeOpen || sourceMode}
        >
          <ListItemIcon><ChatBubbleOutlineIcon fontSize="small" color={commentOpen ? "primary" : "inherit"} /></ListItemIcon>
          <ListItemText>{t("commentPanel") || "Comments"}</ListItemText>
        </MenuItem>
      )}
      <Divider />
      {!hideVersionInfo && (
        <MenuItem
          onClick={() => { onOpenVersionDialog?.(); onClose(); }}
        >
          <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("versionInfo")}</ListItemText>
        </MenuItem>
      )}
    </Menu>
  );
});
