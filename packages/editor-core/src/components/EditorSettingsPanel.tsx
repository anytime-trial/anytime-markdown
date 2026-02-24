"use client";

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
import type { EditorSettings } from "../useEditorSettings";

interface EditorSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  settings: EditorSettings;
  updateSettings: (patch: Partial<EditorSettings>) => void;
  resetSettings: () => void;
  t: (key: string) => string;
}

export function EditorSettingsPanel({
  open,
  onClose,
  settings,
  updateSettings,
  resetSettings,
  t,
}: EditorSettingsPanelProps) {
  const confirm = useConfirm();

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

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: 320, p: 2 } } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          {t("editorSettings")}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label={t("close")}>
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

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
        >
          <ToggleButton value="auto">{t("settingTableAuto")}</ToggleButton>
          <ToggleButton value="100%">{t("settingTableFull")}</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Show Title */}
      <Box sx={{ mb: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
          {t("settingShowTitle")}
        </Typography>
        <Switch
          checked={settings.showTitle}
          onChange={(e) => updateSettings({ showTitle: e.target.checked })}
          size="small"
          inputProps={{ "aria-label": t("settingShowTitle") }}
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
}
