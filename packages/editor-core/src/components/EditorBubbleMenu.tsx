import React from "react";
import BorderColorIcon from "@mui/icons-material/BorderColor";
import CodeIcon from "@mui/icons-material/Code";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import InsertLinkIcon from "@mui/icons-material/InsertLink";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import { IconButton, Paper, Tooltip } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { modKey } from "../constants/shortcuts";

/** ツールチップキー → ショートカットキー表示マッピング */
const TOOLTIP_SHORTCUTS: Record<string, string> = {
  bold: `${modKey}+B`,
  italic: `${modKey}+I`,
  underline: `${modKey}+U`,
  strikethrough: `${modKey}+Shift+X`,
  highlight: `${modKey}+Shift+H`,
  link: `${modKey}+K`,
  code: `${modKey}+E`,
};

/** ツールチップにショートカットキーを付加 */
function tip(t: (key: string) => string, key: string): string {
  const shortcut = TOOLTIP_SHORTCUTS[key];
  return shortcut ? `${t(key)}  (${shortcut})` : t(key);
}

interface EditorBubbleMenuProps {
  editor: Editor;
  onLink: () => void;
  t: (key: string) => string;
}

export function EditorBubbleMenu({ editor, onLink, t }: EditorBubbleMenuProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const buttons = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll(
        "button:not([disabled])",
      ),
    ) as HTMLElement[];
    const current = buttons.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowRight"
        ? (current + 1) % buttons.length
        : (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, state }) => {
        const { selection } = state;
        if (selection.empty) return false;
        if (e.isActive("codeBlock")) return false;
        return true;
      }}
    >
      <Paper
        role="toolbar"
        aria-label={t("textFormatMenu")}
        onKeyDown={handleKeyDown}
        elevation={8}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.25,
          px: 0.5,
          py: 0.25,
          borderRadius: 1,
        }}
      >
        <Tooltip title={tip(t, "bold")}>
          <IconButton
            size="small"
            aria-label={t("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            color={editor.isActive("bold") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <FormatBoldIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={tip(t, "italic")}>
          <IconButton
            size="small"
            aria-label={t("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            color={editor.isActive("italic") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <FormatItalicIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={tip(t, "underline")}>
          <IconButton
            size="small"
            aria-label={t("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            color={editor.isActive("underline") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <FormatUnderlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={tip(t, "strikethrough")}>
          <IconButton
            size="small"
            aria-label={t("strikethrough")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            color={editor.isActive("strike") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <StrikethroughSIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={tip(t, "highlight")}>
          <IconButton
            size="small"
            aria-label={t("highlight")}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            color={editor.isActive("highlight") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <BorderColorIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={tip(t, "code")}>
          <IconButton
            size="small"
            aria-label={t("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
            color={editor.isActive("code") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <CodeIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={tip(t, "link")}>
          <IconButton
            size="small"
            aria-label={t("link")}
            onClick={onLink}
            color={editor.isActive("link") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <InsertLinkIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Paper>
    </BubbleMenu>
  );
}
