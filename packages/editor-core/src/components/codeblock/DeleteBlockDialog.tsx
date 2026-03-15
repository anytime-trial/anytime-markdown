"use client";

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

interface DeleteBlockDialogProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export function DeleteBlockDialog({ open, onClose, onDelete, t }: DeleteBlockDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t("delete")}</DialogTitle>
      <DialogContent><Typography>{t("clearConfirm")}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button color="error" variant="contained" onClick={() => { onClose(); onDelete(); }}>{t("delete")}</Button>
      </DialogActions>
    </Dialog>
  );
}
