"use client";

import { DrawIcon, ListAltIcon, WorkspacePremiumIcon } from "../ui/icons";
import { Tooltip } from "../ui/Tooltip";

import { getTextSecondary } from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import type { ThemePresetName } from "../constants/themePresets";
import type { TranslationFn } from "../types";
import { Divider } from "../ui/Divider";
import { IconButton } from "../ui/IconButton";
import { Text } from "../ui/Text";
import styles from "./ReadonlyToolbar.module.css";

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
  const isDark = useIsDark();
  const activeBg = getActiveBgColor(isDark);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <Tooltip title={t("outline")}>
        <IconButton
          size="small"
          onClick={onToggleOutline}
          className={styles.iconBtn}
          style={{
            color: outlineOpen ? "var(--am-color-primary-main)" : getTextSecondary(isDark),
            background: outlineOpen ? activeBg : "transparent",
          }}
          aria-label={t("outline")}
          aria-pressed={outlineOpen}
        >
          <ListAltIcon fontSize={16} />
        </IconButton>
      </Tooltip>
      <div style={{ display: "flex", gap: 4 }}>
        {FONT_SIZE_OPTIONS.map(({ value, iconSize, label }) => {
          const isActive = fontSize === value;
          return (
            <Tooltip key={value} title={t(label)}>
              <IconButton
                size="small"
                onClick={() => onFontSizeChange(value)}
                className={styles.iconBtn}
                style={{
                  color: isActive ? "var(--am-color-primary-main)" : getTextSecondary(isDark),
                  background: isActive ? activeBg : "transparent",
                }}
                aria-label={t(label)}
                aria-pressed={isActive}
              >
                <Text component="span" style={{ fontSize: iconSize, fontWeight: 700, lineHeight: 1 }}>A</Text>
              </IconButton>
            </Tooltip>
          );
        })}
        {onPresetChange && (
          <>
            <Divider orientation="vertical" flexItem style={{ marginLeft: 4, marginRight: 4 }} />
            <Tooltip title={t("settingThemePreset")}>
              <IconButton
                size="small"
                onClick={() => onPresetChange(presetName === "handwritten" ? "professional" : "handwritten")}
                className={styles.iconBtn}
                style={{
                  color: getTextSecondary(isDark),
                }}
                aria-label={t("settingThemePreset")}
                aria-pressed={presetName === "handwritten"}
              >
                {presetName === "handwritten" ? <DrawIcon fontSize={16} /> : <WorkspacePremiumIcon fontSize={16} />}
              </IconButton>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
