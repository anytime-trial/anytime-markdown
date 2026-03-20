"use client";

import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EditIcon from "@mui/icons-material/Edit";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import { Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React from "react";

import { getActionHover, getTextSecondary } from "../../constants/colors";

interface BlockInlineToolbarProps {
  /** Block label (e.g. "Mermaid", "Math", "Table") */
  label: string;
  /** Show edit button */
  onEdit?: () => void;
  /** Show delete button */
  onDelete?: () => void;
  /** Show capture as image button */
  onCapture?: () => void;
  /** Whether code/content is collapsed */
  collapsed?: boolean;
  /** Extra content between edit button and spacer */
  extra?: React.ReactNode;
  /** Show label only (no buttons) */
  labelOnly?: boolean;
  /** Translation function */
  t: (key: string) => string;
}

export function BlockInlineToolbar({
  label, onEdit, onDelete, onCapture, collapsed, extra, labelOnly, t,
}: BlockInlineToolbarProps) {
  const isDark = useTheme().palette.mode === "dark";
  const iconSx = { fontSize: 16, color: getTextSecondary(isDark) };
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
        sx={{ cursor: "grab", display: "flex", alignItems: "center", opacity: 0.7, "&:hover, &:focus-visible": { opacity: 1 }, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", borderRadius: 0.5 } }}
      >
        <DragIndicatorIcon sx={iconSx} />
      </Box>
      <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark), flexShrink: 0 }}>
        {label}
      </Typography>
      {onEdit && !collapsed && (
        <Tooltip title={t("edit")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={onEdit} aria-label={t("edit")}>
            <EditIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
      )}
      {extra}
      <Box sx={{ flex: 1 }} />
      {onCapture && !collapsed && (
        <Tooltip title={t("capture")} placement="top">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={onCapture} aria-label={t("capture")}>
            <PhotoCameraIcon sx={iconSx} />
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
