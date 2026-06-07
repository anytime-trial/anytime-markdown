"use client";

import { DeleteOutlineIcon, DragIndicatorIcon, EditIcon, FileDownloadIcon, ImageIcon } from "../../ui/icons";
import { Tooltip } from "../../ui/Tooltip";
import { IconButton } from "../../ui/IconButton";
import { ListItemIcon } from "../../ui/ListItemIcon";
import { ListItemText } from "../../ui/ListItemText";
import { Menu } from "../../ui/Menu";
import { MenuItem } from "../../ui/MenuItem";
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
  const anchorRef = useRef<HTMLButtonElement>(null);

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
        <DragIndicatorIcon {...iconSx} />
      </div>
      <Text variant="caption" style={{ fontWeight: 600, color: getTextSecondary(isDark), flexShrink: 0 }}>
        {label}
      </Text>
      {labelDivider && onEdit && !collapsed && (
        <Divider orientation="vertical" flexItem style={{ margin: "0 2px" }} />
      )}
      {onEdit && !collapsed && (
        <Tooltip title={t("edit")} placement="top">
          <IconButton size="xs" onClick={onEdit} aria-label={t("edit")}>
            <EditIcon {...iconSx} />
          </IconButton>
        </Tooltip>
      )}
      {extra}
      <div style={{ flex: 1 }} />
      {hasMenu && !collapsed && (<>
        <Tooltip title={t("capture")} placement="top">
          <IconButton ref={anchorRef} size="xs" onClick={() => setMenuOpen(true)} aria-label={t("capture")} aria-haspopup="true">
            <FileDownloadIcon {...iconSx} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorRef.current}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          placement="bottom-end"
          minWidth={180}
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
          <IconButton size="xs" onClick={onExport} aria-label={t("capture")}>
            <FileDownloadIcon {...iconSx} />
          </IconButton>
        </Tooltip>
      )}
      {onDelete && !collapsed && (<>
        <Divider orientation="vertical" flexItem style={{ margin: "0 2px" }} />
        <Tooltip title={t("delete")} placement="top">
          <IconButton size="xs" onClick={onDelete} aria-label={t("delete")}>
            <DeleteOutlineIcon fontSize={16} />
          </IconButton>
        </Tooltip>
      </>)}
    </div>
  );
}
