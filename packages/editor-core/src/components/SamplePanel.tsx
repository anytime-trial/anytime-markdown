import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Chip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React, { useState } from "react";

import { getActionHover, getDivider, getTextSecondary } from "../constants/colors";
import { CHIP_FONT_SIZE, FS_CHIP_HEIGHT, FS_PANEL_HEADER_FONT_SIZE } from "../constants/dimensions";

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
  const isDark = useTheme().palette.mode === "dark";
  const [open, setOpen] = useState(false);

  if (readOnly || samples.length === 0) return null;

  return (
    <Box sx={{ borderTop: 1, borderColor: getDivider(isDark), flexShrink: 0 }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.5, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: getActionHover(isDark) } }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: FS_PANEL_HEADER_FONT_SIZE, flex: 1 }}>
          {t("sampleContent")}
        </Typography>
        {open ? <ExpandLessIcon sx={{ fontSize: 16, color: getTextSecondary(isDark) }} /> : <ExpandMoreIcon sx={{ fontSize: 16, color: getTextSecondary(isDark) }} />}
      </Box>
      {open && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, px: 1.5, pb: 1.5 }}>
          {samples.map((sample) => (
            <Chip
              key={sample.label}
              label={t(sample.i18nKey)}
              size="small"
              onClick={() => onInsert(sample.code)}
              sx={{ fontSize: CHIP_FONT_SIZE, height: FS_CHIP_HEIGHT }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
