"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { type FC, type KeyboardEvent, useEffect, useState } from "react";

/**
 * Google Drive 上に新規ファイルとして保存する際のファイル名入力ダイアログ。
 * 保存先はマイドライブ直下（フォルダ選択は現状のスコープ外）。
 */
interface DriveSaveAsDialogProps {
  open: boolean;
  defaultName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export const DriveSaveAsDialog: FC<Readonly<DriveSaveAsDialogProps>> = ({
  open,
  defaultName,
  onConfirm,
  onCancel,
}) => {
  const t = useTranslations("Common");
  const [name, setName] = useState(defaultName);

  // ダイアログを開くたびに既定のファイル名へ初期化する。
  useEffect(() => {
    if (!open) return;
    setName(defaultName);
  }, [open, defaultName]);

  const handleConfirm = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleConfirm();
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: "0.95rem" }}>{t("driveSaveAsTitle")}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t("driveSaveAsLabel")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          helperText=""
          sx={{ mt: 0.5 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} aria-label={t("cancel")} sx={{ textTransform: "none" }}>
          {t("cancel")}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!name.trim()}
          aria-label={t("driveSaveAsConfirm")}
          sx={{ textTransform: "none" }}
        >
          {t("driveSaveAsConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
