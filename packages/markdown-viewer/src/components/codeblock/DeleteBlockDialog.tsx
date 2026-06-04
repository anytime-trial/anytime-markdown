"use client";

import { Button } from "../../ui/Button";
import { Dialog, DialogActions, DialogContent, DialogTitle, useDialogTitleId } from "../../ui/Dialog";

interface DeleteBlockDialogProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export function DeleteBlockDialog({ open, onClose, onDelete, t }: Readonly<DeleteBlockDialogProps>) {
  const titleId = useDialogTitleId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId}>
      <DialogTitle id={titleId}>{t("delete")}</DialogTitle>
      <DialogContent>{t("clearConfirm")}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button color="error" variant="contained" onClick={() => { onClose(); onDelete(); }}>{t("delete")}</Button>
      </DialogActions>
    </Dialog>
  );
}
