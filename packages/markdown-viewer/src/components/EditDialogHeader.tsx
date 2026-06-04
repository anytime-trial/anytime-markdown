import React from "react";

import { Button } from "../ui/Button";
import { CheckIcon, CloseIcon } from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { Tooltip } from "../ui/Tooltip";
import styles from "./EditDialogHeader.module.css";

interface EditDialogHeaderProps {
  label: string;
  onClose: () => void;
  showCompareView?: boolean;
  /** Icon displayed before the label */
  icon?: React.ReactNode;
  /** Extra content after label (e.g. size display) */
  extra?: React.ReactNode;
  /** 適用ボタンのコールバック */
  onApply?: () => void;
  /** 未適用の変更があるか */
  dirty?: boolean;
  t: (key: string) => string;
}

/** ブロック要素編集ダイアログの共通ヘッダー */
export function EditDialogHeader({ label, onClose, showCompareView, icon, extra, onApply, dirty, t }: Readonly<EditDialogHeaderProps>) {
  return (
    <div className={styles.header}>
      <Tooltip title={t("close")} placement="bottom">
        <IconButton size="small" onClick={onClose} className={styles.closeBtn} aria-label={t("close")}>
          <CloseIcon size={20} />
        </IconButton>
      </Tooltip>
      {icon && <span className={styles.iconSlot}>{icon}</span>}
      <span className={styles.label}>
        {label}{showCompareView ? ` - ${t("compare")}` : ""}
      </span>
      <span className={styles.spacer} />
      {onApply && (
        <Tooltip title={t("apply")} placement="bottom">
          <Button
            size="small"
            variant={dirty ? "contained" : "outlined"}
            color={dirty ? "primary" : "inherit"}
            startIcon={<CheckIcon size={14} />}
            onClick={onApply}
            className={styles.applyBtn}
          >
            {t("apply")}
          </Button>
        </Tooltip>
      )}
      {extra}
    </div>
  );
}
