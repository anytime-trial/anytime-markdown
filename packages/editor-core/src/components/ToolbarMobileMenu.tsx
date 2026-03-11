import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ListAltIcon from "@mui/icons-material/ListAlt";
import SettingsIcon from "@mui/icons-material/Settings";
import ViewStreamIcon from "@mui/icons-material/ViewStream";
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
  onMerge: () => void;
  onSetHelpAnchor: (el: HTMLElement) => void;
  onOpenSettings?: () => void;
  onOpenVersionDialog?: () => void;
  t: TranslationFn;
}

export const ToolbarMobileMenu = React.memo(function ToolbarMobileMenu({
  anchorEl,
  onClose,
  mobileMoreRef,
  outlineOpen,
  commentOpen,
  inlineMergeOpen,
  sourceMode,
  readonlyMode,
  hideOutline,
  hideComments,
  hideSettings,
  hideVersionInfo,
  onToggleOutline,
  onToggleComments,
  onMerge,
  onSetHelpAnchor,
  onOpenSettings,
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
      <MenuItem
        onClick={() => { onMerge(); onClose(); }}
        disabled={readonlyMode}
      >
        <ListItemIcon>
          <ViewStreamIcon fontSize="small" sx={{ transform: "rotate(90deg)" }} color={inlineMergeOpen ? "primary" : "inherit"} />
        </ListItemIcon>
        <ListItemText>{inlineMergeOpen ? t("normalMode") : t("compare")}</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem
        onClick={() => {
          onClose();
          if (mobileMoreRef.current) onSetHelpAnchor(mobileMoreRef.current);
        }}
      >
        <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t("helpMenu")}</ListItemText>
      </MenuItem>
      {!hideSettings && (
        <MenuItem
          onClick={() => { onOpenSettings?.(); onClose(); }}
        >
          <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("editorSettings")}</ListItemText>
        </MenuItem>
      )}
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
