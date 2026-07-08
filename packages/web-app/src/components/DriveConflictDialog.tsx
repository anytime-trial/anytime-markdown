"use client";

import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import type { FC } from "react";

/**
 * Google Drive 保存時に headRevisionId 不一致（他所での更新）を検知した場合の確認ダイアログ。
 * 「上書きして保存」を選ぶと最新の headRevisionId で再 PUT を行う（呼び出し側の責務）。
 */
interface DriveConflictDialogProps {
  open: boolean;
  onOverwrite: () => void;
  onCancel: () => void;
}

export const DriveConflictDialog: FC<Readonly<DriveConflictDialogProps>> = ({
  open,
  onOverwrite,
  onCancel,
}) => {
  const t = useTranslations("Common");

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: "0.95rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CloudOffOutlinedIcon sx={{ fontSize: 20, color: "warning.main" }} />
          {t("driveConflictTitle")}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("driveConflictBody")}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={onCancel}
          aria-label={t("cancel")}
          sx={{ textTransform: "none" }}
        >
          {t("cancel")}
        </Button>
        <Button
          onClick={onOverwrite}
          variant="contained"
          color="warning"
          aria-label={t("driveConflictOverwrite")}
          sx={{ textTransform: "none" }}
        >
          {t("driveConflictOverwrite")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
