import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import React from "react";

import { FS_TOOLBAR_HEIGHT, FS_ZOOM_LABEL_WIDTH } from "../constants/dimensions";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";

interface ZoomToolbarProps {
  fsZP: UseZoomPanReturn;
  /** Capture button callback (diagram only) */
  onCapture?: () => void;
  t: (key: string) => string;
}

const iconSx = { fontSize: 16, color: "text.secondary" };

/** プレビュー側のズーム・パン操作ツールバー */
export function ZoomToolbar({ fsZP, onCapture, t }: ZoomToolbarProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", px: 1, py: 0.25, minHeight: FS_TOOLBAR_HEIGHT }}>
      {onCapture && (
        <Tooltip title={t("capture")} placement="bottom">
          <IconButton size="small" sx={{ p: 0.25, mr: 0.5 }} onClick={onCapture} aria-label={t("capture")}>
            <PhotoCameraIcon sx={iconSx} />
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
      <Typography variant="caption" sx={{ minWidth: FS_ZOOM_LABEL_WIDTH, textAlign: "center", fontSize: "0.7rem" }}>
        {Math.round(fsZP.zoom * 100)}%
      </Typography>
    </Box>
  );
}
