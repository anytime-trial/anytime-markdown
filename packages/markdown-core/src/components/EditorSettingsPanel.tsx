"use client";

import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Box,
  Button,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useLocale } from "next-intl";
import React from "react";

import useConfirm from "@/hooks/useConfirm";

import { getTextSecondary } from "../constants/colors";
import { PAPER_MARGIN_MAX, PAPER_MARGIN_MIN, PAPER_MARGIN_STEP, PAPER_SIZE_OPTIONS } from "../constants/dimensions";
import type { ThemePresetName } from "../constants/themePresets";
import { PRESET_NAMES, THEME_PRESETS } from "../constants/themePresets";
import type { TranslationFn } from "../types";
import type { EditorSettings } from "../useEditorSettings";

interface EditorSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: EditorSettings;
  updateSettings: (patch: Partial<EditorSettings>) => void;
  resetSettings: () => void;
  t: TranslationFn;
  themeMode?: 'light' | 'dark';
  onThemeModeChange?: (mode: 'light' | 'dark') => void;
  onLocaleChange?: (locale: string) => void;
  presetName?: ThemePresetName;
  onPresetChange?: (name: ThemePresetName) => void;
}

export const EditorSettingsPanel = React.memo(function EditorSettingsPanel({
  open,
  onClose,
  settings,
  updateSettings,
  resetSettings,
  t,
  themeMode,
  onThemeModeChange,
  onLocaleChange,
  presetName,
  onPresetChange,
}: EditorSettingsPanelProps) {
  const isDark = useTheme().palette.mode === "dark";
  const confirm = useConfirm();
  const currentLocale = useLocale();

  const handleReset = async () => {
    try {
      await confirm({
        open: true,
        title: t("settingReset"),
        icon: "info",
        description: t("resetSettingsConfirm"),
      });
    } catch {
      return;
    }
    resetSettings();
  };

  const handleLocaleChange = (_: React.MouseEvent<HTMLElement>, newLocale: string | null) => {
    if (!newLocale || newLocale === currentLocale) return;
    if (onLocaleChange) {
      onLocaleChange(newLocale);
    } else {
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
      globalThis.location.reload();
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 320, p: 2 } } }}
      aria-labelledby="settings-panel-title"
    >
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Typography variant="subtitle1" id="settings-panel-title" sx={{ fontWeight: 700, flex: 1 }}>
          {t("editorSettings")}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label={t("close")}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      {/* Dark Mode */}
      {themeMode !== undefined && onThemeModeChange && (
        <>
          <Box sx={{ mb: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
              {t("settingDarkMode")}
            </Typography>
            <Switch
              checked={themeMode === 'dark'}
              onChange={(e) => onThemeModeChange(e.target.checked ? 'dark' : 'light')}
              size="small"
              inputProps={{ "aria-label": t("settingDarkMode") }}
            />
          </Box>

          {/* Language */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark), mb: 0.5, display: "block" }}>
              {t("settingLanguage")}
            </Typography>
            <ToggleButtonGroup
              value={currentLocale}
              exclusive
              onChange={handleLocaleChange}
              size="small"
              fullWidth
              aria-label={t("languageSelect")}
            >
              <ToggleButton value="ja">日本語</ToggleButton>
              <ToggleButton value="en">English</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Theme Preset */}
          {presetName !== undefined && onPresetChange && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark), mb: 0.5, display: "block" }}>
                {t("settingThemePreset")}
              </Typography>
              <FormControl size="small" fullWidth>
                <Select
                  value={presetName}
                  onChange={(e) => onPresetChange(e.target.value as ThemePresetName)}
                  aria-label={t("settingThemePreset")}
                >
                  {PRESET_NAMES.map((name) => (
                    <MenuItem key={name} value={name}>
                      {THEME_PRESETS[name].label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          <Divider sx={{ mb: 2 }} />
        </>
      )}

      {/* Font Size */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
          {t("settingFontSize")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
          <Slider
            value={settings.fontSize}
            onChange={(_, v) => updateSettings({ fontSize: v })}
            min={12}
            max={20}
            step={1}
            size="small"
            aria-label={t("settingFontSize")}
            aria-valuetext={`${settings.fontSize}px`}
          />
          <Typography variant="body2" sx={{ minWidth: 40, textAlign: "right", fontFamily: "monospace" }}>
            {settings.fontSize}px
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Table Width */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark), mb: 0.5, display: "block" }}>
          {t("settingTableWidth")}
        </Typography>
        <ToggleButtonGroup
          value={settings.tableWidth}
          exclusive
          onChange={(_, v) => { if (v) updateSettings({ tableWidth: v }); }}
          size="small"
          fullWidth
          aria-label={t("tableWidthSelect")}
        >
          <ToggleButton value="auto">{t("settingTableAuto")}</ToggleButton>
          <ToggleButton value="100%">{t("settingTableFull")}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Block Align */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark), mb: 0.5, display: "block" }}>
          {t("settingBlockAlign")}
        </Typography>
        <ToggleButtonGroup
          value={settings.blockAlign}
          exclusive
          onChange={(_, v) => { if (v) updateSettings({ blockAlign: v }); }}
          size="small"
          fullWidth
          aria-label={t("settingBlockAlign")}
        >
          <ToggleButton value="left">{t("settingAlignLeft")}</ToggleButton>
          <ToggleButton value="center">{t("settingAlignCenter")}</ToggleButton>
          <ToggleButton value="right">{t("settingAlignRight")}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Paper Size */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark), mb: 0.5, display: "block" }}>
          {t("settingPaperSize")}
        </Typography>
        <FormControl size="small" fullWidth>
          <Select
            value={settings.paperSize}
            onChange={(e) => updateSettings({ paperSize: e.target.value })}
            aria-label={t("settingPaperSize")}
          >
            {PAPER_SIZE_OPTIONS.map((size) => (
              <MenuItem key={size} value={size}>
                {size === "off" ? t("settingPaperSizeOff") : size}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Paper Margin */}
      {settings.paperSize !== "off" && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
            {t("settingPaperMargin")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <Slider
              value={settings.paperMargin}
              onChange={(_, v) => updateSettings({ paperMargin: v })}
              min={PAPER_MARGIN_MIN}
              max={PAPER_MARGIN_MAX}
              step={PAPER_MARGIN_STEP}
              size="small"
              aria-label={t("settingPaperMargin")}
              aria-valuetext={`${settings.paperMargin}mm`}
            />
            <Typography variant="body2" sx={{ minWidth: 48, textAlign: "right", fontFamily: "monospace" }}>
              {settings.paperMargin}mm
            </Typography>
          </Box>
        </Box>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Spell Check */}
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
          {t("settingSpellCheck")}
        </Typography>
        <Switch
          checked={settings.spellCheck}
          onChange={(e) => updateSettings({ spellCheck: e.target.checked })}
          size="small"
          inputProps={{ "aria-label": t("settingSpellCheck") }}
        />
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Reset */}
      <Button
        variant="outlined"
        size="small"
        startIcon={<RestartAltIcon />}
        onClick={handleReset}
        fullWidth
      >
        {t("settingReset")}
      </Button>
    </Drawer>
  );
});
