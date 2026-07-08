"use client";

import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { type FC, type KeyboardEvent, useEffect, useState } from "react";

/**
 * GitHub 保存時にコミットメッセージを入力させる確認ダイアログ。
 * 「次回から同じメッセージを使う」を選ぶと、呼び出し側（useEditorPage）が
 * 以降の保存でこのダイアログをスキップし同じメッセージを再利用する。
 */
interface CommitMessageDialogProps {
  open: boolean;
  defaultMessage: string;
  onConfirm: (message: string, remember: boolean) => void;
  onCancel: () => void;
}

export const CommitMessageDialog: FC<Readonly<CommitMessageDialogProps>> = ({
  open,
  defaultMessage,
  onConfirm,
  onCancel,
}) => {
  const t = useTranslations("Common");
  const [message, setMessage] = useState(defaultMessage);
  const [remember, setRemember] = useState(false);

  // ダイアログを開くたびに既定メッセージ・チェックボックスへ初期化する。
  useEffect(() => {
    if (!open) return;
    setMessage(defaultMessage);
    setRemember(false);
  }, [open, defaultMessage]);

  const handleConfirm = (): void => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onConfirm(trimmed, remember);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    handleConfirm();
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: "0.95rem" }}>
        {t("commitMessageDialogTitle")}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pt: 0.5 }}>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label={t("commitMessageLabel")}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            helperText=""
          />
          <FormControlLabel
            control={(
              <Checkbox
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
            )}
            label={t("commitMessageRememberLabel")}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} aria-label={t("cancel")} sx={{ textTransform: "none" }}>
          {t("cancel")}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!message.trim()}
          aria-label={t("commitMessageConfirm")}
          sx={{ textTransform: "none" }}
        >
          {t("commitMessageConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
