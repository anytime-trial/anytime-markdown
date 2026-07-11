"use client";

import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
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
 * Drive から開く操作が未保存の下書きを上書きする直前の確認ダイアログ。
 * 「破棄して開く」を選んだときだけ下書きを捨てる（呼び出し側の責務）。
 */
interface DiscardDraftDialogProps {
  open: boolean;
  onDiscard: () => void;
  onCancel: () => void;
}

export const DiscardDraftDialog: FC<Readonly<DiscardDraftDialogProps>> = ({
  open,
  onDiscard,
  onCancel,
}) => {
  const t = useTranslations("Common");

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: "0.95rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningAmberOutlinedIcon sx={{ fontSize: 20, color: "warning.main" }} />
          {t("discardDraftTitle")}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {t("discardDraftBody")}
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
          onClick={onDiscard}
          variant="contained"
          color="warning"
          aria-label={t("discardDraftConfirm")}
          sx={{ textTransform: "none" }}
        >
          {t("discardDraftConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
