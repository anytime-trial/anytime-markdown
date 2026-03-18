"use client";

import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { getMarkdownStorage } from "../types";

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
      event.preventDefault();
      setMenuPos({ mouseX: event.clientX, mouseY: event.clientY });
    };
    dom.addEventListener("contextmenu", handler);
    return () => dom.removeEventListener("contextmenu", handler);
  }, [editor]);

  const handleClose = useCallback(() => {
    setMenuPos(null);
  }, []);

  const handlePasteAsMarkdown = useCallback(async () => {
    if (!editor || !editor.isEditable) { handleClose(); return; }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { handleClose(); return; }
      // Markdown パーサーで ProseMirror ノードに変換して挿入
      const { parser } = getMarkdownStorage(editor);
      const parsed = parser.parse(text);
      if (parsed) {
        const { from, to } = editor.state.selection;
        const tr = editor.state.tr.replaceWith(from, to, parsed.content);
        editor.view.dispatch(tr);
      }
    } catch {
      // clipboard API 未対応の場合はフォールバック不可
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
      <MenuItem onClick={handlePasteAsMarkdown} disabled={!editor?.isEditable}>
        <ListItemIcon>
          <ContentPasteIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("pasteAsMarkdown")}</ListItemText>
      </MenuItem>
    </Menu>
  );
}
