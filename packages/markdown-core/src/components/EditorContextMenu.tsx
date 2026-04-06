"use client";

import ClearAllIcon from "@mui/icons-material/ClearAll";
import CodeIcon from "@mui/icons-material/Code";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Divider, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { getBgPaper, getDivider, getTextSecondary } from "../constants/colors";
import { CONTEXT_MENU_FONT_SIZE, SHORTCUT_HINT_FONT_SIZE } from "../constants/dimensions";
import { findBlockNode, getCopiedBlockNode, performBlockCopy } from "../utils/blockClipboard";
import { boxTableToMarkdown, containsBoxTable } from "../utils/boxTableToMarkdown";
import { copyTextToClipboard, readTextFromClipboard } from "../utils/clipboardHelpers";
import { requestExternalImageDownloads, saveClipboardImageViaVscode } from "../utils/editorImageHandlers";

interface EditorContextMenuProps {
  editor: Editor | null;
  readOnly?: boolean;
  t: (key: string) => string;
  currentMode?: "review" | "wysiwyg" | "source";
  onSwitchToReview?: () => void;
  onSwitchToWysiwyg?: () => void;
  onSwitchToSource?: () => void;
  /** ソースモード等、editor.view.dom 以外でもコンテキストメニューを出す追加要素 */
  extraContainerRef?: React.RefObject<HTMLElement | null>;
  /** ソースモードの textarea 参照（Cut/Copy/Paste 操作用） */
  sourceTextareaRef?: React.RefObject<HTMLTextAreaElement | null>;
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

export function EditorContextMenu({ editor, readOnly, t, currentMode, onSwitchToReview, onSwitchToWysiwyg, onSwitchToSource, extraContainerRef, sourceTextareaRef }: Readonly<EditorContextMenuProps>) {
  const isDark = useTheme().palette.mode === "dark";
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  const openMenu = useCallback((event: MouseEvent) => {
    event.preventDefault();
    setMenuPos({ mouseX: event.clientX, mouseY: event.clientY });
  }, []);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    dom.addEventListener("contextmenu", openMenu);
    return () => dom.removeEventListener("contextmenu", openMenu);
  }, [editor, openMenu]);

  useEffect(() => {
    const el = extraContainerRef?.current;
    if (!el) return;
    el.addEventListener("contextmenu", openMenu);
    return () => el.removeEventListener("contextmenu", openMenu);
  }, [extraContainerRef, openMenu]);

  // VS Code 拡張からの Markdown 貼り付けイベント
  useEffect(() => {
    if (!editor) return;
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text && editor.isEditable) {
        insertMarkdownText(editor, text);
      }
    };
    globalThis.addEventListener("vscode-paste-markdown", handler);
    return () => globalThis.removeEventListener("vscode-paste-markdown", handler);
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
    globalThis.addEventListener("vscode-paste-codeblock", handler);
    return () => globalThis.removeEventListener("vscode-paste-codeblock", handler);
  }, [editor]);

  const handleClose = useCallback(() => {
    setMenuPos(null);
  }, []);

  const isSource = currentMode === "source";
  const sourceHasSelection = isSource && sourceTextareaRef?.current
    ? sourceTextareaRef.current.selectionStart !== sourceTextareaRef.current.selectionEnd
    : false;
  const editorHasSelection = editor ? editor.state.selection.from !== editor.state.selection.to : false;
  const hasSelection = isSource ? sourceHasSelection : editorHasSelection;
  const blockInfo = !isSource && editor ? findBlockNode(editor.state) : null;
  const canCopy = hasSelection || !!blockInfo;

  const handleCut = useCallback(() => {
    if (isSource) {
      const ta = sourceTextareaRef?.current;
      if (!ta) return;
      const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
      if (selected) {
        copyTextToClipboard(selected);
        const before = ta.value.substring(0, ta.selectionStart);
        const after = ta.value.substring(ta.selectionEnd);
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeInputValueSetter?.call(ta, before + after);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.setSelectionRange(before.length, before.length);
      }
      handleClose();
      return;
    }
    if (!editor?.isEditable) return;
    performBlockCopy(editor.view, true, (text) => copyTextToClipboard(text));
    handleClose();
  }, [editor, isSource, sourceTextareaRef, handleClose]);

  const handleCopy = useCallback(() => {
    if (isSource) {
      const ta = sourceTextareaRef?.current;
      if (!ta) return;
      const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
      if (selected) copyTextToClipboard(selected);
      handleClose();
      return;
    }
    if (!editor) return;
    performBlockCopy(editor.view, false, (text) => copyTextToClipboard(text));
    handleClose();
  }, [editor, isSource, sourceTextareaRef, handleClose]);

  const insertTextIntoTextarea = useCallback((text: string) => {
    const ta = sourceTextareaRef?.current;
    if (!ta) return;
    const before = ta.value.substring(0, ta.selectionStart);
    const after = ta.value.substring(ta.selectionEnd);
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    nativeInputValueSetter?.call(ta, before + text + after);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const cursorPos = before.length + text.length;
    ta.setSelectionRange(cursorPos, cursorPos);
  }, [sourceTextareaRef]);

  const handlePaste = useCallback(async () => {
    if (isSource) {
      const text = await readTextFromClipboard();
      if (text) insertTextIntoTextarea(text);
      handleClose();
      return;
    }
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

    // クリップボードから画像・HTML を読み取り（navigator.clipboard.read が利用可能な場合）
    const vscodeApi = window.__vscode;
    if (typeof navigator.clipboard?.read === "function") {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          // 画像アイテムがあればローカル保存
          const imageType = item.types.find((tp) => tp.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result !== "string") return;
              const ext = imageType.split("/")[1] || "png";
              if (vscodeApi) {
                saveClipboardImageViaVscode(vscodeApi, reader.result, ext);
              } else {
                editor.chain().focus().setImage({ src: reader.result, alt: "" }).run();
              }
            };
            reader.readAsDataURL(blob);
            handleClose();
            return;
          }
          // HTML アイテム内の外部/base64 画像をダウンロード要求し、HTML として挿入
          if (item.types.includes("text/html")) {
            const htmlBlob = await item.getType("text/html");
            const html = await htmlBlob.text();
            if (vscodeApi) {
              requestExternalImageDownloads(html, vscodeApi);
            }
            editor.chain().focus().insertContent(html).run();
            handleClose();
            return;
          }
        }
      } catch {
        // clipboard.read() が失敗した場合はテキスト貼り付けにフォールバック
      }
    }

    const text = await readTextFromClipboard();
    if (text) {
      editor.chain().focus().insertContent(text, { parseOptions: { preserveWhitespace: true } }).run();
    }
    handleClose();
  }, [editor, readOnly, isSource, insertTextIntoTextarea, handleClose]);

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

  const handleSwitchToReview = useCallback(() => {
    onSwitchToReview?.();
    handleClose();
  }, [onSwitchToReview, handleClose]);

  const handleSwitchToWysiwyg = useCallback(() => {
    onSwitchToWysiwyg?.();
    handleClose();
  }, [onSwitchToWysiwyg, handleClose]);

  const handleSwitchToSource = useCallback(() => {
    onSwitchToSource?.();
    handleClose();
  }, [onSwitchToSource, handleClose]);

  const handleClearScreen = useCallback(() => {
    if (isSource) {
      const ta = sourceTextareaRef?.current;
      if (ta) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeInputValueSetter?.call(ta, "");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }
      handleClose();
      return;
    }
    if (!editor?.isEditable) { handleClose(); return; }
    editor.chain().focus().clearContent().run();
    handleClose();
  }, [editor, isSource, sourceTextareaRef, handleClose]);

  const handlePasteAsMarkdown = useCallback(async () => {
    if (!editor?.isEditable) { handleClose(); return; }
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

  const menuItems: React.ReactNode[] = [
    <MenuItem key="cut" onClick={handleCut} disabled={!!readOnly || !canCopy}>
      <ListItemIcon>
        <ContentCutIcon sx={{ fontSize: 16 }} />
      </ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
        {t("cut")}
      </ListItemText>
      <Typography variant="body2" sx={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, ml: 2 }}>
        Ctrl+X
      </Typography>
    </MenuItem>,
    <MenuItem key="copy" onClick={handleCopy} disabled={!canCopy}>
      <ListItemIcon>
        <ContentCopyIcon sx={{ fontSize: 16 }} />
      </ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
        {t("copy")}
      </ListItemText>
      <Typography variant="body2" sx={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, ml: 2 }}>
        Ctrl+C
      </Typography>
    </MenuItem>,
    <MenuItem key="paste" onClick={handlePaste} disabled={!!readOnly}>
      <ListItemIcon>
        <ContentPasteIcon sx={{ fontSize: 16 }} />
      </ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
        {t("paste")}
      </ListItemText>
      <Typography variant="body2" sx={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, ml: 2 }}>
        Ctrl+V
      </Typography>
    </MenuItem>,
  ];

  if (currentMode !== "source") {
    menuItems.push(
      <Divider key="d-paste" sx={{ my: 0.5 }} />,
      <MenuItem key="pasteAsMarkdown" onClick={handlePasteAsMarkdown} disabled={!!readOnly}>
        <ListItemIcon>
          <ContentPasteIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("pasteAsMarkdown")}
        </ListItemText>
        <Typography variant="body2" sx={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, ml: 2 }}>
          Ctrl+Shift+V
        </Typography>
      </MenuItem>,
      <MenuItem key="pasteAsCodeBlock" onClick={handlePasteAsCodeBlock} disabled={!!readOnly}>
        <ListItemIcon>
          <CodeIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("pasteAsCodeBlock")}
        </ListItemText>
      </MenuItem>,
    );
  }

  menuItems.push(
    <Divider key="d-clear" sx={{ my: 0.5 }} />,
    <MenuItem key="clearScreen" onClick={handleClearScreen} disabled={!!readOnly}>
      <ListItemIcon>
        <ClearAllIcon sx={{ fontSize: 16 }} />
      </ListItemIcon>
      <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
        {t("clearScreen")}
      </ListItemText>
    </MenuItem>,
  );

  if (onSwitchToReview) {
    menuItems.push(
      <Divider key="d-mode" sx={{ my: 0.5 }} />,
      <MenuItem key="review" onClick={handleSwitchToReview} disabled={currentMode === "review"}>
        <ListItemIcon>
          <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("review")}
        </ListItemText>
      </MenuItem>,
      <MenuItem key="wysiwyg" onClick={handleSwitchToWysiwyg} disabled={currentMode === "wysiwyg"}>
        <ListItemIcon>
          <EditOutlinedIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("wysiwyg")}
        </ListItemText>
      </MenuItem>,
      <MenuItem key="source" onClick={handleSwitchToSource} disabled={currentMode === "source"}>
        <ListItemIcon>
          <CodeIcon sx={{ fontSize: 16 }} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: CONTEXT_MENU_FONT_SIZE }}>
          {t("source")}
        </ListItemText>
      </MenuItem>,
    );
  }

  return (
    <Menu
      open={menuPos !== null}
      onClose={handleClose}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPos === null
          ? undefined
          : { top: menuPos.mouseY, left: menuPos.mouseX }
      }
      slotProps={{ paper: { sx: getMenuPaperSx(isDark) } }}
    >
      {menuItems}
    </Menu>
  );
}
