import CloseIcon from "@mui/icons-material/Close";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import React from "react";

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
export function EditDialogHeader({ label, onClose, showCompareView, icon, extra, t }: EditDialogHeaderProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
      <Tooltip title={t("close")} placement="bottom">
        <IconButton size="small" onClick={onClose} sx={{ mr: 1 }} aria-label={t("close")}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
      {icon && <Box sx={{ display: "flex", alignItems: "center", mr: 0.75, color: "text.secondary" }}>{icon}</Box>}
      <Typography variant="subtitle2" sx={{ p: 0, fontSize: "0.875rem", fontWeight: 600, mr: 1 }}>
        {label}{showCompareView ? ` - ${t("compare")}` : ""}
      </Typography>
      <Box sx={{ flex: 1 }} />
      {extra}
    </Box>
  );
}
