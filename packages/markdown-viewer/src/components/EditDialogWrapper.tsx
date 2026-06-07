import React from "react";

import { getEditDialogBg } from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import { Dialog } from "../ui/Dialog";
import { useEditorSettingsContext } from "../useEditorSettings";

interface EditDialogWrapperProps {
  open: boolean;
  onClose: () => void;
  ariaLabelledBy: string;
  children: React.ReactNode;
}

/** ブロック要素編集ダイアログの共通ラッパー */
export function EditDialogWrapper({ open, onClose, ariaLabelledBy, children }: Readonly<EditDialogWrapperProps>) {
  const isDark = useIsDark();
  const settings = useEditorSettingsContext();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      labelledBy={ariaLabelledBy}
      paperStyle={{ backgroundColor: getEditDialogBg(isDark, settings) }}
    >
      {children}
    </Dialog>
  );
}
