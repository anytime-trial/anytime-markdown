"use client";

import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getMarkdownStorage } from "../types";
import { boxTableToMarkdown, containsBoxTable } from "../utils/boxTableToMarkdown";

interface EditorContextMenuProps {
  editor: Editor | null;
  t: (key: string) => string;
}

interface MenuPosition {
  mouseX: number;
  mouseY: number;
}

/** VS Code ウェブビューの API が利用可能か */
function getVscodeApi(): { postMessage: (msg: unknown) => void } | null {
  try {
    // VS Code webview では acquireVsCodeApi() がグローバルに存在する
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.__vscode_api) return w.__vscode_api;
    if (typeof w.acquireVsCodeApi === "function") {
      // acquireVsCodeApi は1回しか呼べないため、App.tsx で既に呼ばれている
      // window に保存されている vscode オブジェクトを探す
    }
    // App.tsx が window.postMessage 経由ではなく vscode.postMessage を使う場合
    // ここでは直接アクセスできない可能性がある
  } catch { /* ignore */ }
  return null;
}

/** クリップボードテキストを Markdown として解析しエディタに挿入 */
function insertMarkdownText(editor: Editor, text: string): void {
  let md = text;
  if (containsBoxTable(md)) {
    md = boxTableToMarkdown(md);
  }
  const { parser } = getMarkdownStorage(editor);
  const parsed = parser.parse(md);
  if (parsed) {
    const { from, to } = editor.state.selection;
    const tr = editor.state.tr.replaceWith(from, to, parsed.content);
    editor.view.dispatch(tr);
  }
}

export function EditorContextMenu({ editor, t }: EditorContextMenuProps) {
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const pendingPasteRef = useRef(false);

  // 右クリックメニュー表示
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

  // VS Code からのクリップボードテキスト応答をリッスン
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === "clipboardText" && typeof msg.text === "string" && pendingPasteRef.current) {
        pendingPasteRef.current = false;
        if (editor && editor.isEditable && msg.text) {
          insertMarkdownText(editor, msg.text);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [editor]);

  const handleClose = useCallback(() => {
    setMenuPos(null);
  }, []);

  const readClipboardText = useCallback(async (): Promise<string | null> => {
    // 1. Clipboard API を試行
    try {
      const text = await navigator.clipboard.readText();
      if (text) return text;
    } catch { /* Clipboard API 不可 */ }

    // 2. VS Code メッセージパッシング
    // postMessage で readClipboard を送り、clipboardText 応答を待つ
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (w.__vscode) {
        pendingPasteRef.current = true;
        w.__vscode.postMessage({ type: "readClipboard" });
        return null; // 応答は message イベントで処理
      }
    } catch { /* ignore */ }

    return null;
  }, []);

  const handlePasteAsMarkdown = useCallback(async () => {
    if (!editor || !editor.isEditable) { handleClose(); return; }
    const text = await readClipboardText();
    if (text) {
      insertMarkdownText(editor, text);
    }
    // text が null の場合は VS Code メッセージパッシング待ち（応答は message イベントで処理）
    handleClose();
  }, [editor, handleClose, readClipboardText]);

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
