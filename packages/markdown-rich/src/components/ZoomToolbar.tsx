import React, { useRef, useState } from "react";

import { getDivider, getTextSecondary, FS_ZOOM_LABEL_WIDTH, SMALL_CAPTION_FONT_SIZE, useIsDark } from "@anytime-markdown/markdown-viewer";
import { IconButton } from "@anytime-markdown/markdown-viewer/src/ui/IconButton";
import { ListItemIcon } from "@anytime-markdown/markdown-viewer/src/ui/ListItemIcon";
import { ListItemText } from "@anytime-markdown/markdown-viewer/src/ui/ListItemText";
import { Menu } from "@anytime-markdown/markdown-viewer/src/ui/Menu";
import { MenuItem } from "@anytime-markdown/markdown-viewer/src/ui/MenuItem";
import { Text } from "@anytime-markdown/markdown-viewer/src/ui/Text";
import { Tooltip } from "@anytime-markdown/markdown-viewer/src/ui/Tooltip";
import { FileDownloadIcon, ImageIcon, RestartAltIcon, ZoomInIcon, ZoomOutIcon } from "@anytime-markdown/markdown-viewer/src/ui/icons";
import type { UseZoomPanReturn } from "../hooks/useZoomPan";

import styles from "./ZoomToolbar.module.css";

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
  const isDark = useIsDark();
  const iconColor = getTextSecondary(isDark);

  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const hasMenu = onExport && onExportSource;

  return (
    <div
      className={styles.toolbar}
      style={{ borderColor: getDivider(isDark) }}
    >
      {hasMenu && (<>
        <Tooltip title={t("capture")} placement="bottom">
          <IconButton
            ref={anchorRef}
            size="small"
            className={[styles.iconBtn, styles.iconBtnMr].join(" ")}
            onClick={() => setMenuOpen(true)}
            aria-label={t("capture")}
            aria-haspopup="true"
          >
            <FileDownloadIcon fontSize={16} color={iconColor} />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorRef.current}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          placement="bottom-start"
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
      {onExport && !hasMenu && (
        <Tooltip title={t("capture")} placement="bottom">
          <IconButton
            size="small"
            className={[styles.iconBtn, styles.iconBtnMr].join(" ")}
            onClick={onExport}
            aria-label={t("capture")}
          >
            <FileDownloadIcon fontSize={16} color={iconColor} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={t("zoomOut")} placement="bottom">
        <IconButton size="small" className={styles.iconBtn} onClick={fsZP.zoomOut} aria-label={t("zoomOut")}>
          <ZoomOutIcon fontSize={16} color={iconColor} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("zoomIn")} placement="bottom">
        <IconButton size="small" className={styles.iconBtn} onClick={fsZP.zoomIn} aria-label={t("zoomIn")}>
          <ZoomInIcon fontSize={16} color={iconColor} />
        </IconButton>
      </Tooltip>
      {fsZP.isDirty && (
        <Tooltip title={t("zoomReset")} placement="bottom">
          <IconButton size="small" className={styles.iconBtn} onClick={fsZP.reset} aria-label={t("zoomReset")}>
            <RestartAltIcon fontSize={16} color={iconColor} />
          </IconButton>
        </Tooltip>
      )}
      <Text
        variant="caption"
        style={{ minWidth: FS_ZOOM_LABEL_WIDTH, textAlign: "center", fontSize: SMALL_CAPTION_FONT_SIZE }}
      >
        {Math.round(fsZP.zoom * 100)}%
      </Text>
    </div>
  );
}
