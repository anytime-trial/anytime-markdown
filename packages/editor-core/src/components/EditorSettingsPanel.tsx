"use client";

import React from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import useConfirm from "@/hooks/useConfirm";
import { useLocale } from "next-intl";
import type { EditorSettings } from "../useEditorSettings";
import type { TranslationFn } from "../types";

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
}: EditorSettingsPanelProps) {
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
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;
      window.location.reload();
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
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
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
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", mb: 0.5, display: "block" }}>
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

          <Divider sx={{ mb: 2 }} />
        </>
      )}

      {/* Line Height */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
          {t("settingLineHeight")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
          <Slider
            value={settings.lineHeight}
            onChange={(_, v) => updateSettings({ lineHeight: v as number })}
            min={1.0}
            max={2.0}
            step={0.1}
            size="small"
            aria-label={t("settingLineHeight")}
            aria-valuetext={`${settings.lineHeight}x`}
          />
          <Typography variant="body2" sx={{ minWidth: 32, textAlign: "right", fontFamily: "monospace" }}>
            {settings.lineHeight.toFixed(1)}
          </Typography>
        </Box>
      </Box>

      {/* Font Size */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
          {t("settingFontSize")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
          <Slider
            value={settings.fontSize}
            onChange={(_, v) => updateSettings({ fontSize: v as number })}
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
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", mb: 0.5, display: "block" }}>
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
