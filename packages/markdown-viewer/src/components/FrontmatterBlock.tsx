"use client";

import { IconButton } from "../ui/IconButton";
import { useCallback, useRef, useState } from "react";

import useConfirm from "@/hooks/useConfirm";

import { DEFAULT_DARK_CODE_BG, DEFAULT_LIGHT_CODE_BG, getActionHover, getDivider, getTextSecondary } from "../constants/colors";
import { useIsDark } from "../contexts/ThemeModeContext";
import { FRONTMATTER_CODE_FONT_SIZE, SMALL_CAPTION_FONT_SIZE } from "../constants/dimensions";
import { useEditorSettingsContext } from "../useEditorSettings";
import { Text } from "../ui/Text";
import styles from "./FrontmatterBlock.module.css";

interface FrontmatterBlockProps {
  frontmatter: string | null;
  onChange: (value: string | null) => void;
  readOnly?: boolean;
  defaultCollapsed?: boolean;
  t: (key: string) => string;
}

export function FrontmatterBlock({ frontmatter, onChange, readOnly, defaultCollapsed, t }: Readonly<FrontmatterBlockProps>) {
  const isDark = useIsDark();
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
    <div
      className={styles.root}
      style={{
        border: `1px solid ${getDivider(isDark)}`,
        borderRadius: 4,
        overflow: "hidden",
        marginBottom: 8,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
          backgroundColor: getActionHover(isDark),
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setCollapsed((prev) => !prev)}
      >
        <Text
          variant="caption"
          style={{
            fontFamily: "monospace",
            fontWeight: 600,
            color: getTextSecondary(isDark),
            fontSize: FRONTMATTER_CODE_FONT_SIZE,
          }}
        >
          {collapsed ? "▶" : "▼"} Frontmatter
        </Text>
        <div style={{ flex: 1 }} />
        {!readOnly && (
          <IconButton
            size="xs"
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
          >
            <Text variant="caption" style={{ fontSize: SMALL_CAPTION_FONT_SIZE, color: getTextSecondary(isDark) }}>
              ✕
            </Text>
          </IconButton>
        )}
      </div>

      {/* Code editor area */}
      {!collapsed && (
        <textarea
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
          className={styles.textarea}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            margin: 0,
            padding: 12,
            border: "none",
            outline: "none",
            cursor: "text",
            resize: "vertical",
            fontFamily: "monospace",
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            backgroundColor: isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG,
            color: isDark ? "#f5f5f5" : "#212121",
            maxHeight: 300,
            overflow: "auto",
          }}
        />
      )}
    </div>
  );
}
