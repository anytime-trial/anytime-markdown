"use client";

import { Button } from "../../ui/Button";
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "../../ui/Dialog";

interface DiscardDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
}

/**
 * 未保存の変更を破棄する確認ダイアログ。スプレッドシート編集・codeBlock 全画面編集など、
 * dirty 状態で閉じようとした時に共有する（i18n キーは `spreadsheetDiscard*`）。
 */
export function DiscardDialog({ open, onClose, onConfirm, t }: Readonly<DiscardDialogProps>) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t("spreadsheetDiscardTitle")}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("spreadsheetDiscardMessage")}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("spreadsheetDiscardCancel")}</Button>
        <Button onClick={onConfirm} color="error">{t("spreadsheetDiscardConfirm")}</Button>
      </DialogActions>
    </Dialog>
  );
}
