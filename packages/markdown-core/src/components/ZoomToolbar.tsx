import FileDownloadIcon from "@mui/icons-material/FileDownload";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React from "react";

import { getDivider, getTextSecondary } from "../constants/colors";
import { FS_TOOLBAR_HEIGHT, FS_ZOOM_LABEL_WIDTH, SMALL_CAPTION_FONT_SIZE } from "../constants/dimensions";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";

interface ZoomToolbarProps {
  fsZP: UseZoomPanReturn;
  /** Export button callback (diagram only) */
  onExport?: () => void;
  t: (key: string) => string;
}

/** プレビュー側のズーム・パン操作ツールバー */
export function ZoomToolbar({ fsZP, onExport, t }: Readonly<ZoomToolbarProps>) {
  const isDark = useTheme().palette.mode === "dark";
  const iconSx = { fontSize: 16, color: getTextSecondary(isDark) };
  return (
    <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: getDivider(isDark), px: 1, py: 0.25, minHeight: FS_TOOLBAR_HEIGHT }}>
      {onExport && (
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
