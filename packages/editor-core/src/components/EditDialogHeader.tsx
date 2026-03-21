import CloseIcon from "@mui/icons-material/Close";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React from "react";

import { getDivider, getTextSecondary } from "../constants/colors";
import { DIALOG_HEADER_FONT_SIZE } from "../constants/dimensions";

interface EditDialogHeaderProps {
  label: string;
  onClose: () => void;
  showCompareView?: boolean;
  /** Icon displayed before the label */
  icon?: React.ReactNode;
  /** Extra content after label (e.g. size display) */
  extra?: React.ReactNode;
  t: (key: string) => string;
}

/** ブロック要素編集ダイアログの共通ヘッダー */
export function EditDialogHeader({ label, onClose, showCompareView, icon, extra, t }: Readonly<EditDialogHeaderProps>) {
  const isDark = useTheme().palette.mode === "dark";
  return (
    <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: getDivider(isDark) }}>
      <Tooltip title={t("close")} placement="bottom">
        <IconButton size="small" onClick={onClose} sx={{ mr: 1 }} aria-label={t("close")}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      {icon && <Box sx={{ display: "flex", alignItems: "center", mr: 0.75, color: getTextSecondary(isDark) }}>{icon}</Box>}
      <Typography variant="subtitle2" sx={{ p: 0, fontSize: DIALOG_HEADER_FONT_SIZE, fontWeight: 600, mr: 1 }}>
        {label}{showCompareView ? ` - ${t("compare")}` : ""}
      </Typography>
      <Box sx={{ flex: 1 }} />
      {extra}
    </Box>
  );
}
