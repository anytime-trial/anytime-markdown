"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { getMarkdownFromEditor } from "../types";

interface EditorContextMenuProps {
  editor: Editor | null;
  t: (key: string) => string;
}

interface MenuPosition {
  mouseX: number;
  mouseY: number;
}

export function EditorContextMenu({ editor, t }: EditorContextMenuProps) {
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const handler = (event: MouseEvent) => {
      const { from, to } = editor.state.selection;
      if (from === to) return; // 選択なしはブラウザデフォルト
      event.preventDefault();
      setMenuPos({ mouseX: event.clientX, mouseY: event.clientY });
    };
    dom.addEventListener("contextmenu", handler);
    return () => dom.removeEventListener("contextmenu", handler);
  }, [editor]);

  const handleClose = useCallback(() => {
    setMenuPos(null);
  }, []);

  const handleCopyAsMarkdown = useCallback(async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    let markdown: string;
    if (from === to) {
      markdown = getMarkdownFromEditor(editor);
    } else {
      markdown = editor.state.doc.textBetween(from, to, "\n\n", "\n");
    }
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = markdown;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    handleClose();
  }, [editor, handleClose]);

  return (
    <Menu
      open={menuPos !== null}
      onClose={handleClose}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPos !== null
          ? { top: menuPos.mouseY, left: menuPos.mouseX }
          : undefined
      }
      slotProps={{
        paper: { sx: { minWidth: 180 } },
      }}
    >
      <MenuItem onClick={handleCopyAsMarkdown}>
        <ListItemIcon>
          <ContentCopyIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("copyAsMarkdown")}</ListItemText>
      </MenuItem>
    </Menu>
  );
}
