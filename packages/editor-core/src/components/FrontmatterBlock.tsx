"use client";

import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { useCallback, useRef, useState } from "react";
import useConfirm from "@/hooks/useConfirm";
import { useEditorSettingsContext } from "../useEditorSettings";

interface FrontmatterBlockProps {
  frontmatter: string | null;
  onChange: (value: string | null) => void;
  readOnly?: boolean;
  t: (key: string) => string;
}

export function FrontmatterBlock({ frontmatter, onChange, readOnly, t }: FrontmatterBlockProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const settings = useEditorSettingsContext();
  const [collapsed, setCollapsed] = useState(false);
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
        borderColor: "divider",
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
          bgcolor: "action.hover",
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
            color: "text.secondary",
            fontSize: "0.75rem",
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
            <Typography variant="caption" sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
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
            bgcolor: isDark ? "grey.900" : "grey.50",
            color: isDark ? "grey.100" : "grey.900",
            maxHeight: 300,
            overflow: "auto",
          }}
        />
      )}
    </Box>
  );
}
