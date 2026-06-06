"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditIcon from "@mui/icons-material/Edit";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ImageIcon from "@mui/icons-material/Image";
import { ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from "@mui/material";
import { IconButton } from "../../ui/IconButton";
import { useTheme } from "@mui/material/styles";
import React, { useRef, useState } from "react";

import { getActionHover, getPrimaryMain, getTextSecondary } from "../../constants/colors";
import { Divider } from "../../ui/Divider";
import { Text } from "../../ui/Text";
import styles from "./BlockInlineToolbar.module.css";

export interface BlockInlineToolbarProps {
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
  const anchorRef = useRef<HTMLSpanElement>(null);

  if (labelOnly) {
    return (
      <div
        data-block-toolbar=""
        aria-label={label}
        style={{ backgroundColor: getActionHover(isDark), padding: "2px 6px", display: "flex", alignItems: "center", gap: 2 }}
        contentEditable={false}
      >
        <Text variant="caption" style={{ fontWeight: 600, color: getTextSecondary(isDark), flexShrink: 0 }}>
          {label}
        </Text>
      </div>
    );
  }

  const hasMenu = onExport && onExportSource;

  return (
    <div
      data-block-toolbar=""
      role="toolbar"
      aria-label={label}
      style={{ backgroundColor: getActionHover(isDark), padding: "2px 6px", display: "flex", alignItems: "center", gap: 2 }}
      contentEditable={false}
    >
      <div
        data-drag-handle=""
        role="button"
        tabIndex={0}
        aria-roledescription="draggable item"
        aria-label={t("dragHandle")}
        className={styles.dragHandle}
        style={{ "--drag-handle-outline-color": getPrimaryMain(isDark) } as React.CSSProperties}
      >
        <DragIndicatorIcon sx={iconSx} />
      </div>
      <Text variant="caption" style={{ fontWeight: 600, color: getTextSecondary(isDark), flexShrink: 0 }}>
        {label}
      </Text>
      {labelDivider && onEdit && !collapsed && (
        <Divider orientation="vertical" flexItem style={{ margin: "0 2px" }} />
      )}
      {onEdit && !collapsed && (
        <Tooltip title={t("edit")} placement="top">
          <IconButton size="small" className={styles.iconButtonCompact} onClick={onEdit} aria-label={t("edit")}>
            <EditIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
      )}
      {extra}
      <div style={{ flex: 1 }} />
      {hasMenu && !collapsed && (<>
        <Tooltip title={t("capture")} placement="top">
          <span ref={anchorRef}>
            <IconButton size="small" className={styles.iconButtonCompact} onClick={() => setMenuOpen(true)} aria-label={t("capture")} aria-haspopup="true">
              <FileDownloadIcon sx={iconSx} />
            </IconButton>
          </span>
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
          <IconButton size="small" className={styles.iconButtonCompact} onClick={onExport} aria-label={t("capture")}>
            <FileDownloadIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
      )}
      {onDelete && !collapsed && (<>
        <Divider orientation="vertical" flexItem style={{ margin: "0 2px" }} />
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="small" className={styles.iconButtonCompact} onClick={onDelete} aria-label={t("delete")}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </>)}
    </div>
  );
}
