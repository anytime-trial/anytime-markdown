"use client";

import CodeIcon from "@mui/icons-material/Code";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import { Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { findBlockNode, getCopiedBlockNode, setCopiedBlockNode } from "../utils/blockClipboard";
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

const menuPaperSx = {
  minWidth: 180,
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  borderRadius: 1,
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  py: 0.5,
  "& .MuiMenuItem-root": {
    fontSize: "0.8125rem",
    minHeight: 28,
    px: 2,
    py: 0.25,
  },
  "& .MuiListItemIcon-root": {
    minWidth: 28,
  },
};

export function EditorContextMenu({ editor, readOnly, t }: EditorContextMenuProps) {
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
  const blockInfo = editor ? findBlockNode(editor) : null;
  const canCopy = hasSelection || !!blockInfo;

  const handleCut = useCallback(() => {
    if (!editor || !editor.isEditable) return;
    const { from, to } = editor.state.selection;

    if (from !== to) {
      setCopiedBlockNode(null);
      const text = editor.state.doc.textBetween(from, to, "\n");
      copyTextToClipboard(text);
      editor.chain().focus().deleteSelection().run();
      handleClose();
      return;
    }

    const block = findBlockNode(editor);
    if (block) {
      setCopiedBlockNode(block.node);
      copyTextToClipboard(block.text);
      const { tr } = editor.state;
      tr.delete(block.pos, block.pos + block.node.nodeSize);
      editor.view.dispatch(tr);
    }
    handleClose();
  }, [editor, handleClose]);

  const handleCopy = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;

    if (from !== to) {
      setCopiedBlockNode(null);
      const text = editor.state.doc.textBetween(from, to, "\n");
      copyTextToClipboard(text);
      handleClose();
      return;
    }

    const block = findBlockNode(editor);
    if (block) {
      setCopiedBlockNode(block.node);
      copyTextToClipboard(block.text);
    }
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
      slotProps={{ paper: { sx: menuPaperSx } }}
    >
      <MenuItem onClick={handleCut} disabled={!!readOnly || !canCopy}>
        <ListItemIcon>
          <ContentCutIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.8125rem" }}>
          {t("cut")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.75rem", ml: 2 }}>
          Ctrl+X
        </Typography>
      </MenuItem>
      <MenuItem onClick={handleCopy} disabled={!canCopy}>
        <ListItemIcon>
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.8125rem" }}>
          {t("copy")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.75rem", ml: 2 }}>
          Ctrl+C
        </Typography>
      </MenuItem>
      <MenuItem onClick={handlePaste} disabled={!!readOnly}>
        <ListItemIcon>
          <ContentPasteIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.8125rem" }}>
          {t("paste")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.75rem", ml: 2 }}>
          Ctrl+V
        </Typography>
      </MenuItem>
      <Divider sx={{ my: 0.5 }} />
      <MenuItem onClick={handlePasteAsMarkdown} disabled={!!readOnly}>
        <ListItemIcon>
          <ContentPasteIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.8125rem" }}>
          {t("pasteAsMarkdown")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.75rem", ml: 2 }}>
          Ctrl+Shift+V
        </Typography>
      </MenuItem>
      <MenuItem onClick={handlePasteAsCodeBlock} disabled={!!readOnly}>
        <ListItemIcon>
          <CodeIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.8125rem" }}>
          {t("pasteAsCodeBlock")}
        </ListItemText>
      </MenuItem>
    </Menu>
  );
}
