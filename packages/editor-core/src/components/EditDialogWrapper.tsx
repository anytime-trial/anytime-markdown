import { Dialog, useTheme } from "@mui/material";
import React from "react";

import { getEditDialogBg } from "../constants/colors";
import { useEditorSettingsContext } from "../useEditorSettings";

interface EditDialogWrapperProps {
  open: boolean;
  onClose: () => void;
  ariaLabelledBy: string;
  children: React.ReactNode;
}

/** ブロック要素編集ダイアログの共通ラッパー */
export function EditDialogWrapper({ open, onClose, ariaLabelledBy, children }: Readonly<EditDialogWrapperProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      aria-labelledby={ariaLabelledBy}
      slotProps={{ paper: { sx: { bgcolor: getEditDialogBg(isDark, settings), display: "flex", flexDirection: "column" } } }}
    >
      {children}
    </Dialog>
  );
}
