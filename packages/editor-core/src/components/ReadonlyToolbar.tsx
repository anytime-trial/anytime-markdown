"use client";

import ListAltIcon from "@mui/icons-material/ListAlt";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { getTextSecondary } from "../constants/colors";
import type { TranslationFn } from "../types";

interface FontSizeOption {
  value: number;
  iconSize: number;
  label: string;
}

interface ReadonlyToolbarProps {
  outlineOpen: boolean;
  onToggleOutline: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  t: TranslationFn;
}

const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { value: 14, iconSize: 12, label: "fontSmall" },
  { value: 16, iconSize: 15, label: "fontMedium" },
  { value: 18, iconSize: 18, label: "fontLarge" },
];

export function ReadonlyToolbar({ outlineOpen, onToggleOutline, fontSize, onFontSizeChange, t }: ReadonlyToolbarProps) {
  const isDark = useTheme().palette.mode === "dark";

  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
      <Tooltip title={t("outline")}>
        <IconButton
          size="small"
          onClick={onToggleOutline}
          sx={{
            width: 28,
            height: 28,
            color: outlineOpen ? "primary.main" : getTextSecondary(isDark),
            bgcolor: outlineOpen ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)") : "transparent",
          }}
          aria-label={t("outline")}
          aria-pressed={outlineOpen}
        >
          <ListAltIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {FONT_SIZE_OPTIONS.map(({ value, iconSize, label }) => (
          <Tooltip key={value} title={t(label)}>
            <IconButton
              size="small"
              onClick={() => onFontSizeChange(value)}
              sx={{
                width: 28,
                height: 28,
                color: fontSize === value ? "primary.main" : getTextSecondary(isDark),
                bgcolor: fontSize === value ? (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)") : "transparent",
              }}
              aria-label={t(label)}
              aria-pressed={fontSize === value}
            >
              <Typography sx={{ fontSize: iconSize, fontWeight: 700, lineHeight: 1 }}>A</Typography>
            </IconButton>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}
