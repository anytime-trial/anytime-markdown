"use client";

import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  FormControl,
  MenuItem,
  Select,
  Switch,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import React from "react";

import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Slider } from "../ui/Slider";
import { ToggleButton } from "../ui/ToggleButton";
import { ToggleButtonGroup } from "../ui/ToggleButtonGroup";
import styles from "./EditorSettingsPanel.module.css";

import useConfirm from "@/hooks/useConfirm";

import { getTextSecondary } from "../constants/colors";
import { PAPER_MARGIN_MAX, PAPER_MARGIN_MIN, PAPER_MARGIN_STEP, PAPER_SIZE_OPTIONS } from "../constants/dimensions";
import type { ThemePresetName } from "../constants/themePresets";
import { PRESET_NAMES, THEME_PRESETS } from "../constants/themePresets";
import { useMarkdownLocale } from "../i18n/context";
import type { TranslationFn } from "../types";
import type { EditorSettings } from "../useEditorSettings";
import { Divider } from "../ui/Divider";
import { Drawer } from "../ui/Drawer";
import { Text } from "../ui/Text";

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
  const currentLocale = useMarkdownLocale();

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
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax;Secure`;
      globalThis.location.reload();
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      width={320}
      paperStyle={{ padding: 16 }}
      aria-labelledby="settings-panel-title"
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <Text variant="subtitle1" id="settings-panel-title" style={{ fontWeight: 700, flex: 1 }}>
          {t("editorSettings")}
        </Text>
        <IconButton size="small" onClick={onClose} aria-label={t("close")}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </div>

      {/* Dark Mode */}
      {themeMode !== undefined && onThemeModeChange && (
        <>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="caption" style={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
              {t("settingDarkMode")}
            </Text>
            <Switch
              checked={themeMode === 'dark'}
              onChange={(e) => onThemeModeChange(e.target.checked ? 'dark' : 'light')}
              size="small"
              slotProps={{ input: { role: "switch", "aria-label": t("settingDarkMode") } }}
            />
          </div>

          {/* Language */}
          <div style={{ marginBottom: 24 }}>
            <Text variant="caption" component="span" style={{ fontWeight: 600, color: getTextSecondary(isDark), marginBottom: 4, display: "block" }}>
              {t("settingLanguage")}
            </Text>
            <ToggleButtonGroup
              value={currentLocale}
              exclusive
              onChange={handleLocaleChange}
              size="small"
              className={styles.fullWidth}
              aria-label={t("languageSelect")}
            >
              <ToggleButton value="ja">日本語</ToggleButton>
              <ToggleButton value="en">English</ToggleButton>
            </ToggleButtonGroup>
          </div>

          {/* Theme Preset */}
          {presetName !== undefined && onPresetChange && (
            <div style={{ marginBottom: 16 }}>
              <Text variant="caption" component="span" style={{ fontWeight: 600, color: getTextSecondary(isDark), marginBottom: 4, display: "block" }}>
                {t("settingThemePreset")}
              </Text>
              <FormControl size="small" fullWidth>
                <Select
                  value={presetName}
                  onChange={(e) => onPresetChange(e.target.value)}
                  aria-label={t("settingThemePreset")}
                >
                  {PRESET_NAMES.map((name) => (
                    <MenuItem key={name} value={name}>
                      {THEME_PRESETS[name].label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </div>
          )}

          <Divider style={{ marginBottom: 16 }} />
        </>
      )}

      {/* Font Size */}
      <div style={{ marginBottom: 24 }}>
        <Text variant="caption" style={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
          {t("settingFontSize")}
        </Text>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
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
          <Text variant="body2" style={{ minWidth: 40, textAlign: "right", fontFamily: "monospace" }}>
            {settings.fontSize}px
          </Text>
        </div>
      </div>

      <Divider style={{ marginBottom: 16 }} />

      {/* Table Width */}
      <div style={{ marginBottom: 24 }}>
        <Text variant="caption" component="span" style={{ fontWeight: 600, color: getTextSecondary(isDark), marginBottom: 4, display: "block" }}>
          {t("settingTableWidth")}
        </Text>
        <ToggleButtonGroup
          value={settings.tableWidth}
          exclusive
          onChange={(_, v) => { if (v) updateSettings({ tableWidth: v }); }}
          size="small"
          className={styles.fullWidth}
          aria-label={t("tableWidthSelect")}
        >
          <ToggleButton value="auto">{t("settingTableAuto")}</ToggleButton>
          <ToggleButton value="100%">{t("settingTableFull")}</ToggleButton>
        </ToggleButtonGroup>
      </div>

      {/* Block Align */}
      <div style={{ marginBottom: 24 }}>
        <Text variant="caption" component="span" style={{ fontWeight: 600, color: getTextSecondary(isDark), marginBottom: 4, display: "block" }}>
          {t("settingBlockAlign")}
        </Text>
        <ToggleButtonGroup
          value={settings.blockAlign}
          exclusive
          onChange={(_, v) => { if (v) updateSettings({ blockAlign: v }); }}
          size="small"
          className={styles.fullWidth}
          aria-label={t("settingBlockAlign")}
        >
          <ToggleButton value="left">{t("settingAlignLeft")}</ToggleButton>
          <ToggleButton value="center">{t("settingAlignCenter")}</ToggleButton>
          <ToggleButton value="right">{t("settingAlignRight")}</ToggleButton>
        </ToggleButtonGroup>
      </div>

      {/* Paper Size */}
      <div style={{ marginBottom: 24 }}>
        <Text variant="caption" component="span" style={{ fontWeight: 600, color: getTextSecondary(isDark), marginBottom: 4, display: "block" }}>
          {t("settingPaperSize")}
        </Text>
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
      </div>

      {/* Paper Margin */}
      {settings.paperSize !== "off" && (
        <div style={{ marginBottom: 24 }}>
          <Text variant="caption" style={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
            {t("settingPaperMargin")}
          </Text>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
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
            <Text variant="body2" style={{ minWidth: 48, textAlign: "right", fontFamily: "monospace" }}>
              {settings.paperMargin}mm
            </Text>
          </div>
        </div>
      )}

      <Divider style={{ marginBottom: 16 }} />

      {/* Word Break */}
      <div style={{ marginBottom: 24 }}>
        <Text variant="caption" component="span" style={{ fontWeight: 600, color: getTextSecondary(isDark), marginBottom: 4, display: "block" }}>
          {t("settingWordBreak")}
        </Text>
        <ToggleButtonGroup
          value={settings.wordBreak}
          exclusive
          onChange={(_, v) => { if (v) updateSettings({ wordBreak: v }); }}
          size="small"
          className={styles.fullWidth}
          aria-label={t("settingWordBreak")}
        >
          <ToggleButton value="normal">{t("settingWordBreakNormal")}</ToggleButton>
          <ToggleButton value="keep-all">{t("settingWordBreakKeepAll")}</ToggleButton>
        </ToggleButtonGroup>
      </div>

      <Divider style={{ marginBottom: 16 }} />

      {/* Spell Check */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="caption" style={{ fontWeight: 600, color: getTextSecondary(isDark) }}>
          {t("settingSpellCheck")}
        </Text>
        <Switch
          checked={settings.spellCheck}
          onChange={(e) => updateSettings({ spellCheck: e.target.checked })}
          size="small"
          slotProps={{ input: { "aria-label": t("settingSpellCheck") } }}
        />
      </div>

      <Divider style={{ marginBottom: 16 }} />

      {/* Reset */}
      <Button
        variant="outlined"
        size="small"
        startIcon={<RestartAltIcon />}
        onClick={handleReset}
        className={styles.fullWidth}
      >
        {t("settingReset")}
      </Button>
    </Drawer>
  );
});
