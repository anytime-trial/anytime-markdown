import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, Chip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React, { useState } from "react";

import { getActionHover, getDivider, getTextSecondary } from "../constants/colors";
import { FS_CHIP_HEIGHT } from "../constants/dimensions";

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
export function SamplePanel({ samples, onInsert, readOnly, t }: SamplePanelProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [open, setOpen] = useState(false);

  if (readOnly || samples.length === 0) return null;

  return (
    <Box sx={{ borderTop: 1, borderColor: getDivider(isDark), flexShrink: 0 }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{ display: "flex", alignItems: "center", px: 1.5, py: 0.5, cursor: "pointer", userSelect: "none", "&:hover": { bgcolor: getActionHover(isDark) } }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.75rem", flex: 1 }}>
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
              sx={{ fontSize: "0.7rem", height: FS_CHIP_HEIGHT }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
