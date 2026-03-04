import React from "react";
import { IconButton, Tooltip } from "@mui/material";
import Paper from "@mui/material/Paper";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import BorderColorIcon from "@mui/icons-material/BorderColor";
import CodeIcon from "@mui/icons-material/Code";
import InsertLinkIcon from "@mui/icons-material/InsertLink";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";

interface MergeRightBubbleMenuProps {
  editor: Editor;
  sourceMode: boolean;
  t: (key: string) => string;
}

export function MergeRightBubbleMenu({
  editor,
  sourceMode,
  t,
}: MergeRightBubbleMenuProps) {
  if (sourceMode) return null;

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
        <Tooltip title={t("bold")}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleBold().run()}
            color={editor.isActive("bold") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <FormatBoldIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("italic")}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            color={editor.isActive("italic") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <FormatItalicIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("underline")}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            color={editor.isActive("underline") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <FormatUnderlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("strikethrough")}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            color={editor.isActive("strike") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <StrikethroughSIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("highlight")}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            color={editor.isActive("highlight") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <BorderColorIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("code")}>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().toggleCode().run()}
            color={editor.isActive("code") ? "primary" : "default"}
            sx={{ p: 0.5 }}
          >
            <CodeIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("link")}>
          <IconButton
            size="small"
            onClick={() => {
              if (editor.isActive("link")) {
                editor.chain().focus().unsetLink().run();
                return;
              }
              const storage = editor.storage as unknown as Record<string, Record<string, unknown>>;
              const openDialog = storage.linkDialog?.open as (() => void) | undefined;
              if (openDialog) {
                openDialog();
              }
            }}
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
