import React, { useState } from "react";

import { getActionHover, getDivider, getTextSecondary, CHIP_FONT_SIZE, FS_CHIP_HEIGHT, FS_PANEL_HEADER_FONT_SIZE, useIsDark } from "@anytime-markdown/markdown-viewer";
import { Chip } from "@anytime-markdown/markdown-viewer/src/ui/Chip";
import { Text } from "@anytime-markdown/markdown-viewer/src/ui/Text";
import { ExpandLessIcon, ExpandMoreIcon } from "@anytime-markdown/markdown-viewer/src/ui/icons";

import styles from "./SamplePanel.module.css";

interface SampleItem {
  label: string;
  i18nKey: string;
  code: string;
}

interface SamplePanelProps {
  samples: SampleItem[];
  onInsert: (code: string) => void;
  readOnly?: boolean;
  t: (key: string) => string;
}

/** 折りたたみ式サンプル挿入チップパネル */
export function SamplePanel({ samples, onInsert, readOnly, t }: Readonly<SamplePanelProps>) {
  const isDark = useIsDark();
  const [open, setOpen] = useState(false);

  if (readOnly || samples.length === 0) return null;

  const iconColor = getTextSecondary(isDark);

  return (
    <div
      className={styles.root}
      style={{ borderColor: getDivider(isDark) }}
    >
      <div
        onClick={() => setOpen((v) => !v)}
        className={styles.header}
        style={{ ["--am-sample-header-hover-bg" as string]: getActionHover(isDark) }}
      >
        <Text
          variant="caption"
          style={{ fontWeight: 600, fontSize: FS_PANEL_HEADER_FONT_SIZE, flex: 1 }}
        >
          {t("sampleContent")}
        </Text>
        {open
          ? <ExpandLessIcon fontSize={16} color={iconColor} />
          : <ExpandMoreIcon fontSize={16} color={iconColor} />
        }
      </div>
      {open && (
        <div className={styles.chips}>
          {samples.map((sample) => (
            <Chip
              key={sample.label}
              label={t(sample.i18nKey)}
              size="small"
              onClick={() => onInsert(sample.code)}
              style={{ fontSize: CHIP_FONT_SIZE, height: FS_CHIP_HEIGHT }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
