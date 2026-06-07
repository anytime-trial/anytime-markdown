"use client";

import { ClearAllIcon, CodeIcon, ContentCopyIcon, ContentCutIcon, ContentPasteIcon, EditOutlinedIcon, VisibilityOutlinedIcon } from "../ui/icons";
import { ListItemIcon } from "../ui/ListItemIcon";
import { ListItemText } from "../ui/ListItemText";
import { Menu } from "../ui/Menu";
import { MenuItem } from "../ui/MenuItem";
import { useIsDark } from "../contexts/ThemeModeContext";
import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import type { Editor } from "@anytime-markdown/markdown-react";
import { useCallback, useEffect, useState } from "react";

import { getBgPaper, getDivider, getTextSecondary } from "../constants/colors";
import { Divider } from "../ui/Divider";
import { Text } from "../ui/Text";
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

function getMenuPaperStyle(isDark: boolean): React.CSSProperties {
  return {
    minWidth: 180,
    backgroundColor: getBgPaper(isDark),
    border: `1px solid ${getDivider(isDark)}`,
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    paddingTop: 4,
    paddingBottom: 4,
    // 旧 sx の & .MuiMenuItem-root / & .MuiListItemIcon-root をプリミティブの CSS 変数で反映。
    ["--am-menu-item-font" as string]: CONTEXT_MENU_FONT_SIZE,
    ["--am-menu-item-minh" as string]: "28px",
    ["--am-menu-item-pad-y" as string]: "2px",
    ["--am-menu-item-pad-x" as string]: "16px",
    ["--am-menu-icon-minw" as string]: "28px",
  };
}

/** ソースモード時のテキスト貼り付け */
async function pasteIntoSource(
  insertTextIntoTextarea: (text: string) => void,
  handleClose: () => void,
): Promise<void> {
  const text = await readTextFromClipboard();
  if (text) insertTextIntoTextarea(text);
  handleClose();
}

/** コピーされたブロックノードの挿入 */
function pasteCopiedBlock(
  editor: Editor,
  copied: PMNode,
  handleClose: () => void,
): void {
  const { $from } = editor.state.selection;
  const insertPos = $from.after(1); // 現在のブロックの末尾に挿入
  const { tr } = editor.state;
  tr.insert(Math.min(insertPos, tr.doc.content.size), copied.copy(copied.content));
  editor.view.dispatch(tr.scrollIntoView());
  handleClose();
}

/** Clipboard API 経由の貼り付け（画像 → HTML → テキストの優先順） */
async function pasteFromClipboardAPI(
  editor: Editor,
  vscodeApi: VsCodeApi | undefined,
  handleClose: () => void,
): Promise<void> {
  if (typeof navigator.clipboard?.read === "function") {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((tp) => tp.startsWith("image/"));
        if (imageType) {
          await pasteClipboardImage(editor, vscodeApi, item, imageType);
          handleClose();
          return;
        }
        if (item.types.includes("text/html")) {
          await pasteClipboardHtml(editor, vscodeApi, item);
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
}

/** クリップボードの画像アイテムを貼り付け */
async function pasteClipboardImage(
  editor: Editor,
  vscodeApi: VsCodeApi | undefined,
  item: ClipboardItem,
  imageType: string,
): Promise<void> {
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
}

/** クリップボードの HTML アイテムを貼り付け */
async function pasteClipboardHtml(
  editor: Editor,
  vscodeApi: VsCodeApi | undefined,
  item: ClipboardItem,
): Promise<void> {
  const htmlBlob = await item.getType("text/html");
  const html = await htmlBlob.text();
  if (vscodeApi) {
    requestExternalImageDownloads(html, vscodeApi);
  }
  editor.chain().focus().insertContent(html).run();
}

export function EditorContextMenu({ editor, readOnly, t, currentMode, onSwitchToReview, onSwitchToWysiwyg, onSwitchToSource, extraContainerRef, sourceTextareaRef }: Readonly<EditorContextMenuProps>) {
  const isDark = useIsDark();
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
      await pasteIntoSource(insertTextIntoTextarea, handleClose);
      return;
    }
    if (!editor || !!readOnly) { handleClose(); return; }

    const copied = getCopiedBlockNode();
    if (copied) {
      pasteCopiedBlock(editor, copied, handleClose);
      return;
    }

    await pasteFromClipboardAPI(editor, window.__vscode, handleClose);
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
        <ContentCutIcon fontSize={16} />
      </ListItemIcon>
      <ListItemText>
        {t("cut")}
      </ListItemText>
      <Text variant="body2" style={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, marginLeft: "16px" }}>
        Ctrl+X
      </Text>
    </MenuItem>,
    <MenuItem key="copy" onClick={handleCopy} disabled={!canCopy}>
      <ListItemIcon>
        <ContentCopyIcon fontSize={16} />
      </ListItemIcon>
      <ListItemText>
        {t("copy")}
      </ListItemText>
      <Text variant="body2" style={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, marginLeft: "16px" }}>
        Ctrl+C
      </Text>
    </MenuItem>,
    <MenuItem key="paste" onClick={handlePaste} disabled={!!readOnly}>
      <ListItemIcon>
        <ContentPasteIcon fontSize={16} />
      </ListItemIcon>
      <ListItemText>
        {t("paste")}
      </ListItemText>
      <Text variant="body2" style={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, marginLeft: "16px" }}>
        Ctrl+V
      </Text>
    </MenuItem>,
  ];

  if (currentMode !== "source") {
    menuItems.push(
      <Divider key="d-paste" style={{ margin: "4px 0" }} />,
      <MenuItem key="pasteAsMarkdown" onClick={handlePasteAsMarkdown} disabled={!!readOnly}>
        <ListItemIcon>
          <ContentPasteIcon fontSize={16} />
        </ListItemIcon>
        <ListItemText>
          {t("pasteAsMarkdown")}
        </ListItemText>
        <Text variant="body2" style={{ color: getTextSecondary(isDark), fontSize: SHORTCUT_HINT_FONT_SIZE, marginLeft: "16px" }}>
          Ctrl+Shift+V
        </Text>
      </MenuItem>,
      <MenuItem key="pasteAsCodeBlock" onClick={handlePasteAsCodeBlock} disabled={!!readOnly}>
        <ListItemIcon>
          <CodeIcon fontSize={16} />
        </ListItemIcon>
        <ListItemText>
          {t("pasteAsCodeBlock")}
        </ListItemText>
      </MenuItem>,
    );
  }

  menuItems.push(
    <Divider key="d-clear" style={{ margin: "4px 0" }} />,
    <MenuItem key="clearScreen" onClick={handleClearScreen} disabled={!!readOnly}>
      <ListItemIcon>
        <ClearAllIcon fontSize={16} />
      </ListItemIcon>
      <ListItemText>
        {t("clearScreen")}
      </ListItemText>
    </MenuItem>,
  );

  if (onSwitchToReview) {
    menuItems.push(
      <Divider key="d-mode" style={{ margin: "4px 0" }} />,
      <MenuItem key="review" onClick={handleSwitchToReview} disabled={currentMode === "review"}>
        <ListItemIcon>
          <VisibilityOutlinedIcon fontSize={16} />
        </ListItemIcon>
        <ListItemText>
          {t("review")}
        </ListItemText>
      </MenuItem>,
      <MenuItem key="wysiwyg" onClick={handleSwitchToWysiwyg} disabled={currentMode === "wysiwyg"}>
        <ListItemIcon>
          <EditOutlinedIcon fontSize={16} />
        </ListItemIcon>
        <ListItemText>
          {t("wysiwyg")}
        </ListItemText>
      </MenuItem>,
      <MenuItem key="source" onClick={handleSwitchToSource} disabled={currentMode === "source"}>
        <ListItemIcon>
          <CodeIcon fontSize={16} />
        </ListItemIcon>
        <ListItemText>
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
      paperStyle={getMenuPaperStyle(isDark)}
    >
      {menuItems}
    </Menu>
  );
}
