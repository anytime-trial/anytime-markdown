"use client";

import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { useCallback, useRef, useState } from "react";

import useConfirm from "@/hooks/useConfirm";

import { DEFAULT_DARK_CODE_BG, DEFAULT_LIGHT_CODE_BG, getActionHover, getDivider, getTextSecondary } from "../constants/colors";
import { FRONTMATTER_CODE_FONT_SIZE, SMALL_CAPTION_FONT_SIZE } from "../constants/dimensions";
import { useEditorSettingsContext } from "../useEditorSettings";

interface FrontmatterBlockProps {
  frontmatter: string | null;
  onChange: (value: string | null) => void;
  readOnly?: boolean;
  defaultCollapsed?: boolean;
  t: (key: string) => string;
}

export function FrontmatterBlock({ frontmatter, onChange, readOnly, defaultCollapsed, t }: Readonly<FrontmatterBlockProps>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      onChange(value || null);
    },
    [onChange],
  );

  if (frontmatter === null) return null;

  return (
    <Box
      sx={{
        border: 1,
        borderColor: getDivider(isDark),
        borderRadius: 1,
        overflow: "hidden",
        mb: 1,
        "@media print": { display: "none" },
      }}
    >
      {/* Toolbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 0.75,
          py: 0.25,
          bgcolor: getActionHover(isDark),
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <Typography
          variant="caption"
          sx={{
            fontFamily: "monospace",
            fontWeight: 600,
            color: getTextSecondary(isDark),
            fontSize: FRONTMATTER_CODE_FONT_SIZE,
          }}
        >
          {collapsed ? "▶" : "▼"} Frontmatter
        </Typography>
        <Box sx={{ flex: 1 }} />
        {!readOnly && (
          <IconButton
            size="small"
            title={t("delete")}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await confirm({
                  open: true,
                  title: t("delete"),
                  icon: "alert",
                  description: t("deleteFrontmatterConfirm"),
                });
              } catch {
                return;
              }
              onChange(null);
            }}
            sx={{ p: 0.25 }}
          >
            <Typography variant="caption" sx={{ fontSize: SMALL_CAPTION_FONT_SIZE, color: getTextSecondary(isDark) }}>
              ✕
            </Typography>
          </IconButton>
        )}
      </Box>

      {/* Code editor area */}
      {!collapsed && (
        <Box
          component="textarea"
          ref={textareaRef}
          data-frontmatter-editor=""
          value={frontmatter}
          onChange={readOnly ? () => {} : handleChange}
          onKeyDown={readOnly ? (e: React.KeyboardEvent) => {
            // 選択・コピー系以外のキー入力を無効化
            if (!e.ctrlKey && !e.metaKey && !e.key.startsWith("Arrow") && e.key !== "Home" && e.key !== "End" && e.key !== "Shift" && e.key !== "Control" && e.key !== "Meta" && e.key !== "Tab") {
              e.preventDefault();
            }
          } : undefined}
          rows={(frontmatter?.split("\n").length ?? 1) + 1}
          spellCheck={false}
          sx={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            m: 0,
            p: 1.5,
            border: "none",
            outline: "none",
            "&:focus": { outline: "none" },
            cursor: "text",
            resize: "vertical",
            fontFamily: "monospace",
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            bgcolor: isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG,
            color: isDark ? "grey.100" : "grey.900",
            maxHeight: 300,
            overflow: "auto",
          }}
        />
      )}
    </Box>
  );
}
