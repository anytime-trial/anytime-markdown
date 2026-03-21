"use client";

import CodeIcon from "@mui/icons-material/Code";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import { Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { getBgPaper, getDivider, getTextSecondary } from "../constants/colors";
import { CONTEXT_MENU_FONT_SIZE, SHORTCUT_HINT_FONT_SIZE } from "../constants/dimensions";
import { findBlockNode, getCopiedBlockNode, performBlockCopy } from "../utils/blockClipboard";
import { boxTableToMarkdown, containsBoxTable } from "../utils/boxTableToMarkdown";
import { copyTextToClipboard, readTextFromClipboard } from "../utils/clipboardHelpers";

interface EditorContextMenuProps {
  editor: Editor | null;
  readOnly?: boolean;
  t: (key: string) => string;
}

interface MenuPosition {
  mouseX: number;
  mouseY: number;
}

/** クリップボードテキストを Markdown として解析しエディタに挿入 */
function insertMarkdownText(editor: Editor, text: string): void {
  let md = text;
  if (containsBoxTable(md)) {
    md = boxTableToMarkdown(md);
  }
  editor.chain().focus().insertContent(md).run();
}

function getMenuPaperSx(isDark: boolean) { return {
  minWidth: 180,
  bgcolor: getBgPaper(isDark),
  border: 1,
  borderColor: getDivider(isDark),
  borderRadius: 1,
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  py: 0.5,
  "& .MuiMenuItem-root": {
    fontSize: CONTEXT_MENU_FONT_SIZE,
    minHeight: 28,
    px: 2,
    py: 0.25,
  },
  "& .MuiListItemIcon-root": {
    minWidth: 28,
  },
} as const; }

export function EditorContextMenu({ editor, readOnly, t }: EditorContextMenuProps) {
  const isDark = useTheme().palette.mode === "dark";
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

  // VS Code 拡張からの Markdown 貼り付けイベント
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text && editor.isEditable) {
        insertMarkdownText(editor, text);
      }
    };
    window.addEventListener("vscode-paste-markdown", handler);
    return () => window.removeEventListener("vscode-paste-markdown", handler);
  }, [editor]);

  // VS Code 拡張からのコードブロック貼り付けイベント
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text && editor.isEditable) {
        editor.chain().focus().insertContent({
          type: "codeBlock",
          attrs: { language: "" },
          content: [{ type: "text", text }],
        }).run();
      }
    };
    window.addEventListener("vscode-paste-codeblock", handler);
    return () => window.removeEventListener("vscode-paste-codeblock", handler);
  }, [editor]);

  const handleClose = useCallback(() => {
    setMenuPos(null);
  }, []);

  const hasSelection = editor ? editor.state.selection.from !== editor.state.selection.to : false;
  const blockInfo = editor ? findBlockNode(editor.state) : null;
  const canCopy = hasSelection || !!blockInfo;

  const handleCut = useCallback(() => {
    if (!editor || !editor.isEditable) return;
    performBlockCopy(editor.view, true, (text) => copyTextToClipboard(text));
    handleClose();
  }, [editor, handleClose]);

  const handleCopy = useCallback(() => {
    if (!editor) return;
    performBlockCopy(editor.view, false, (text) => copyTextToClipboard(text));
    handleClose();
  }, [editor, handleClose]);

  const handlePaste = useCallback(async () => {
    if (!editor || !!readOnly) { handleClose(); return; }

    // コンテキストメニューまたは Ctrl+C でコピーしたブロックノードがある場合はそれを挿入
    const copied = getCopiedBlockNode();
    if (copied) {
      const { $from } = editor.state.selection;
      const insertPos = $from.after(1); // 現在のブロックの末尾に挿入
      const { tr } = editor.state;
      tr.insert(Math.min(insertPos, tr.doc.content.size), copied.copy(copied.content));
      editor.view.dispatch(tr.scrollIntoView());
      handleClose();
      return;
    }

    const text = await readTextFromClipboard();
    if (text) {
      editor.chain().focus().insertContent(text, { parseOptions: { preserveWhitespace: true } }).run();
    }
    handleClose();
  }, [editor, readOnly, handleClose]);

  const handlePasteAsCodeBlock = useCallback(async () => {
    if (!editor || !!readOnly) { handleClose(); return; }
    const pasteIntoCodeBlock = (text: string) => {
      editor.chain().focus().insertContent({
        type: "codeBlock",
        attrs: { language: "" },
        content: [{ type: "text", text }],
      }).run();
    };
    const text = await readTextFromClipboard();
    if (text) { pasteIntoCodeBlock(text); handleClose(); return; }
    // VS Code 環境: vscode-paste-codeblock イベントで処理
    if (window.__vscode) {
      window.__vscode.postMessage({ type: "readClipboardForCodeBlock" });
    }
    handleClose();
  }, [editor, readOnly, handleClose]);

  const handlePasteAsMarkdown = useCallback(async () => {
    if (!editor || !editor.isEditable) { handleClose(); return; }
    const text = await readTextFromClipboard();
    if (text) {
      insertMarkdownText(editor, text);
      handleClose();
      return;
    }
    // VS Code 環境: 拡張側にクリップボード読み取りを依頼
    if (window.__vscode) {
      window.__vscode.postMessage({ type: "readClipboard" });
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
      slotProps={{ paper: { sx: getMenuPaperSx(isDark) } }}
    >
      <MenuItem onClick={handleCut} disabled={!!readOnly || !canCopy}>
        <ListItemIcon>
          <ContentCutIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("cut")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, ml: 2 }}>
          Ctrl+X
        </Typography>
      </MenuItem>
      <MenuItem onClick={handleCopy} disabled={!canCopy}>
        <ListItemIcon>
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("copy")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, ml: 2 }}>
          Ctrl+C
        </Typography>
      </MenuItem>
      <MenuItem onClick={handlePaste} disabled={!!readOnly}>
        <ListItemIcon>
          <ContentPasteIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("paste")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, ml: 2 }}>
          Ctrl+V
        </Typography>
      </MenuItem>
      <Divider sx={{ my: 0.5 }} />
      <MenuItem onClick={handlePasteAsMarkdown} disabled={!!readOnly}>
        <ListItemIcon>
          <ContentPasteIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("pasteAsMarkdown")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, ml: 2 }}>
          Ctrl+Shift+V
        </Typography>
      </MenuItem>
      <MenuItem onClick={handlePasteAsCodeBlock} disabled={!!readOnly}>
        <ListItemIcon>
          <CodeIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("pasteAsCodeBlock")}
        </ListItemText>
      </MenuItem>
    </Menu>
  );
}
