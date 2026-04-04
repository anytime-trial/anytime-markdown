import FileDownloadIcon from "@mui/icons-material/FileDownload";
import ImageIcon from "@mui/icons-material/Image";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { Box, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React, { useRef, useState } from "react";

import { getDivider, getTextSecondary } from "../constants/colors";
import { FS_TOOLBAR_HEIGHT, FS_ZOOM_LABEL_WIDTH, SMALL_CAPTION_FONT_SIZE } from "../constants/dimensions";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";

interface ZoomToolbarProps {
  fsZP: UseZoomPanReturn;
  /** Export button callback (diagram only) */
  onExport?: () => void;
  /** Export diagram source (.mmd / .puml) */
  onExportSource?: () => void;
  /** i18n key for source export label (e.g. "exportMmd", "exportPuml") */
  exportSourceKey?: string;
  t: (key: string) => string;
}

/** プレビュー側のズーム・パン操作ツールバー */
export function ZoomToolbar({ fsZP, onExport, onExportSource, exportSourceKey, t }: Readonly<ZoomToolbarProps>) {
  const isDark = useTheme().palette.mode === "dark";
  const iconSx = { fontSize: 16, color: getTextSecondary(isDark) };

  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const hasMenu = onExport && onExportSource;

  return (
    <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: getDivider(isDark), px: 1, py: 0.25, minHeight: FS_TOOLBAR_HEIGHT }}>
      {hasMenu && (<>
        <Tooltip title={t("capture")} placement="bottom">
          <IconButton ref={anchorRef} size="small" sx={{ p: 0.25, mr: 0.5 }} onClick={() => setMenuOpen(true)} aria-label={t("capture")} aria-haspopup="true">
            <FileDownloadIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorRef.current}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
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
      {onExport && !hasMenu && (
        <Tooltip title={t("capture")} placement="bottom">
          <IconButton size="small" sx={{ p: 0.25, mr: 0.5 }} onClick={onExport} aria-label={t("capture")}>
            <FileDownloadIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={t("zoomOut")} placement="bottom">
        <IconButton size="small" sx={{ p: 0.25 }} onClick={fsZP.zoomOut} aria-label={t("zoomOut")}>
          <ZoomOutIcon sx={iconSx} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("zoomIn")} placement="bottom">
        <IconButton size="small" sx={{ p: 0.25 }} onClick={fsZP.zoomIn} aria-label={t("zoomIn")}>
          <ZoomInIcon sx={iconSx} />
        </IconButton>
      </Tooltip>
      {fsZP.isDirty && (
        <Tooltip title={t("zoomReset")} placement="bottom">
          <IconButton size="small" sx={{ p: 0.25 }} onClick={fsZP.reset} aria-label={t("zoomReset")}>
            <RestartAltIcon sx={iconSx} />
          </IconButton>
        </Tooltip>
      )}
      <Typography variant="caption" sx={{ minWidth: FS_ZOOM_LABEL_WIDTH, textAlign: "center", fontSize: SMALL_CAPTION_FONT_SIZE }}>
        {Math.round(fsZP.zoom * 100)}%
      </Typography>
    </Box>
  );
}
