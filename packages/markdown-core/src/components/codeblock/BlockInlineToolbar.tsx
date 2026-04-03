"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditIcon from "@mui/icons-material/Edit";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ImageIcon from "@mui/icons-material/Image";
import { Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React, { useRef, useState } from "react";

import { getActionHover, getPrimaryMain, getTextSecondary } from "../../constants/colors";

interface BlockInlineToolbarProps {
  /** Block label (e.g. "Mermaid", "Math", "Table") */
  label: string;
  /** Show edit button */
  onEdit?: () => void;
  /** Show delete button */
  onDelete?: () => void;
  /** Show export as image button */
  onExport?: () => void;
  /** Export diagram source (.mmd / .puml) */
  onExportSource?: () => void;
  /** i18n key for source export label (e.g. "exportMmd", "exportPuml") */
  exportSourceKey?: string;
  /** Whether code/content is collapsed */
  collapsed?: boolean;
  /** Extra content between edit button and spacer */
  extra?: React.ReactNode;
  /** Show divider between label and edit button */
  labelDivider?: boolean;
  /** Show label only (no buttons) */
  labelOnly?: boolean;
  /** Translation function */
  t: (key: string) => string;
}

export function BlockInlineToolbar({
  label, onEdit, onDelete, onExport, onExportSource, exportSourceKey, collapsed, extra, labelDivider, labelOnly, t,
}: Readonly<BlockInlineToolbarProps>) {
  const isDark = useTheme().palette.mode === "dark";
  const iconSx = { fontSize: 16, color: getTextSecondary(isDark) };

  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  if (labelOnly) {
    return (
      <Box
        data-block-toolbar=""
        aria-label={label}
        sx={{ bgcolor: getActionHover(isDark), px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
        contentEditable={false}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark), flexShrink: 0 }}>
          {label}
        </Typography>
      </Box>
    );
  }

  const hasMenu = onExport && onExportSource;

  return (
    <Box
      data-block-toolbar=""
      role="toolbar"
      aria-label={label}
      sx={{ bgcolor: getActionHover(isDark), px: 0.75, py: 0.25, display: "flex", alignItems: "center", gap: 0.25 }}
      contentEditable={false}
    >
      <Box
        data-drag-handle=""
        role="button"
        tabIndex={0}
        aria-roledescription="draggable item"
        aria-label={t("dragHandle")}
        sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: getPrimaryMain(isDark), borderRadius: 0.5 } }}
      >
        <DragIndicatorIcon sx={iconSx} />
      </Box>
      <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark), flexShrink: 0 }}>
        {label}
      </Typography>
      {labelDivider && onEdit && !collapsed && (
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
      )}
      {onEdit && !collapsed && (
        <Tooltip title={t("edit")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={onEdit} aria-label={t("edit")}>
            <EditIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
      )}
      {extra}
      <Box sx={{ flex: 1 }} />
      {hasMenu && !collapsed && (<>
        <Tooltip title={t("capture")} placement="top">
          <IconButton ref={anchorRef} size="small" sx={{ p: 0.25 }} onClick={() => setMenuOpen(true)} aria-label={t("capture")} aria-haspopup="true">
            <FileDownloadIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorRef.current}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { minWidth: 180 } } }}
        >
          <MenuItem onClick={() => { setMenuOpen(false); onExport(); }}>
            <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t("exportPng")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setMenuOpen(false); onExportSource(); }}>
            <ListItemIcon><FileDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t(exportSourceKey ?? "exportMmd")}</ListItemText>
          </MenuItem>
        </Menu>
      </>)}
      {onExport && !hasMenu && !collapsed && (
        <Tooltip title={t("capture")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={onExport} aria-label={t("capture")}>
            <FileDownloadIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
      )}
      {onDelete && !collapsed && (<>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={onDelete} aria-label={t("delete")}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </>)}
    </Box>
  );
}
