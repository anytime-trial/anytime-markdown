"use client";

import DrawIcon from "@mui/icons-material/Draw";
import ListAltIcon from "@mui/icons-material/ListAlt";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import { Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import { getTextSecondary } from "../constants/colors";
import type { ThemePresetName } from "../constants/themePresets";
import type { TranslationFn } from "../types";

interface FontSizeOption {
  value: number;
  iconSize: number;
  label: string;
}

interface ReadonlyToolbarProps {
  readonly outlineOpen: boolean;
  readonly onToggleOutline: () => void;
  readonly fontSize: number;
  readonly onFontSizeChange: (size: number) => void;
  readonly presetName?: ThemePresetName;
  readonly onPresetChange?: (name: ThemePresetName) => void;
  readonly t: TranslationFn;
}

const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { value: 14, iconSize: 12, label: "fontSmall" },
  { value: 16, iconSize: 15, label: "fontMedium" },
  { value: 18, iconSize: 18, label: "fontLarge" },
];

function getActiveBgColor(isDark: boolean): string {
  return isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)";
}

export function ReadonlyToolbar({ outlineOpen, onToggleOutline, fontSize, onFontSizeChange, presetName, onPresetChange, t }: ReadonlyToolbarProps) {
  const isDark = useTheme().palette.mode === "dark";
  const activeBg = getActiveBgColor(isDark);

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
            bgcolor: outlineOpen ? activeBg : "transparent",
          }}
          aria-label={t("outline")}
          aria-pressed={outlineOpen}
        >
          <ListAltIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {FONT_SIZE_OPTIONS.map(({ value, iconSize, label }) => {
          const isActive = fontSize === value;
          return (
            <Tooltip key={value} title={t(label)}>
              <IconButton
                size="small"
                onClick={() => onFontSizeChange(value)}
                sx={{
                  width: 28,
                  height: 28,
                  color: isActive ? "primary.main" : getTextSecondary(isDark),
                  bgcolor: isActive ? activeBg : "transparent",
                }}
                aria-label={t(label)}
                aria-pressed={isActive}
              >
                <Typography sx={{ fontSize: iconSize, fontWeight: 700, lineHeight: 1 }}>A</Typography>
              </IconButton>
            </Tooltip>
          );
        })}
        {onPresetChange && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title={t("settingThemePreset")}>
              <IconButton
                size="small"
                onClick={() => onPresetChange(presetName === "handwritten" ? "professional" : "handwritten")}
                sx={{
                  width: 28,
                  height: 28,
                  color: getTextSecondary(isDark),
                }}
                aria-label={t("settingThemePreset")}
                aria-pressed={presetName === "handwritten"}
              >
                {presetName === "handwritten" ? <DrawIcon sx={{ fontSize: 16 }} /> : <WorkspacePremiumIcon sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>
    </Box>
  );
}
