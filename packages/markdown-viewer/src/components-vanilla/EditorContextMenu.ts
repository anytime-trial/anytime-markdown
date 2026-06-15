/**
 * 脱React の vanilla DOM 右クリックメニュー「EditorContextMenu」（framework-decoupling Phase 3）。
 *
 * React 原版 `components/EditorContextMenu.tsx`（MUI Menu / MenuItem / ListItemIcon / ListItemText /
 * Divider / Text 消費）の素 DOM 版。エディタ（editor.view.dom）および追加コンテナ（ソースモードの
 * textarea 等）の `contextmenu` イベントを捕捉し、クリック座標（anchorPosition）へアンカーした
 * メニューを `createMenu`（自前マウント）で開く。各項目の editor コマンド / textarea 操作 /
 * 活性条件は React 原版と同一ロジックを移植する。
 *
 * 変換規約:
 * - React props → opts（editor / readOnly / t / currentMode / onSwitchTo* / extraContainer /
 *   sourceTextarea）。戻り値は { destroy }（メニュー本体は開く時に createMenu で生成し、閉じる /
 *   destroy 時に handle.destroy で閉じる。トリガー要素は持たないため el は返さない）。
 * - useIsDark は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従するため isDark 分岐は削除）。
 *   React 原版が getBgPaper / getDivider / getTextSecondary で当てていた色は CSS 変数に置換する。
 * - useState（menuPos）→ closure 変数 + 開いている menu handle。useEffect（contextmenu / VS Code
 *   paste イベント購読）→ 明示的 addEventListener / removeEventListener（destroy で解除）。
 * - <Menu open anchorReference="anchorPosition" anchorPosition> → 開く時に createMenu(...) を生成し、
 *   onClose で handle.destroy。MenuItem / ListItemIcon / ListItemText / Divider は ui-vanilla の
 *   create* で構成する。editor 操作（chain / ProseMirror tr / clipboard）は React 版と同一。
 *
 * 本 PoC は **追加のみ・本番未配線**（React 原版 components/EditorContextMenu.tsx は変更しない）。
 */

import type { Node as PMNode } from "@anytime-markdown/markdown-pm/model";
import type { Editor } from "@anytime-markdown/markdown-core";

import { CONTEXT_MENU_FONT_SIZE, SHORTCUT_HINT_FONT_SIZE } from "../constants/dimensions";
import type { TranslationFn } from "../types";
import { findBlockNode, getCopiedBlockNode, performBlockCopy } from "../utils/blockClipboard";
import { boxTableToMarkdown, containsBoxTable } from "../utils/boxTableToMarkdown";
import { clearDocumentAndComments } from "../utils/clearEditor";
import { copyTextToClipboard, readTextFromClipboard } from "../utils/clipboardHelpers";
import { requestExternalImageDownloads, saveClipboardImageViaVscode } from "../utils/editorImageHandlers";
import {
  createDivider,
  createListItemIcon,
  createListItemText,
  createMenu,
  createMenuItem,
  svgIcon,
} from "../ui-vanilla";

// --- Material SVG path（ui/icons.tsx と同一）。React 原版が使うアイコンを補う ---
const PATH = {
  contentCut:
    "M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2m0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2m6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5M19 3l-6 6 2 2 7-7V3z",
  contentCopy:
    "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z",
  contentPaste:
    "M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1m7 18H5V4h2v3h10V4h2z",
  code: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z",
  clearAll: "M5 13h14v-2H5zm-2 4h14v-2H3zM7 7v2h14V7z",
  visibilityOutlined:
    "M12 6c3.79 0 7.17 2.13 8.82 5.5C19.17 14.87 15.79 17 12 17s-7.17-2.13-8.82-5.5C4.83 8.13 8.21 6 12 6m0-2C7 4 2.73 7.11 1 11.5 2.73 15.89 7 19 12 19s9.27-3.11 11-7.5C21.27 7.11 17 4 12 4m0 5c1.38 0 2.5 1.12 2.5 2.5S13.38 14 12 14s-2.5-1.12-2.5-2.5S10.62 9 12 9m0-2c-2.48 0-4.5 2.02-4.5 4.5S9.52 16 12 16s4.5-2.02 4.5-4.5S14.48 7 12 7",
  editOutlined:
    "m14.06 9.02.92.92L5.92 19H5v-.92zM17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29m-3.6 3.19L3 17.25V21h3.75L17.81 9.94z",
} as const;

/** {@link createEditorContextMenu} のオプション（React `EditorContextMenuProps` の vanilla 再現）。 */
export interface CreateEditorContextMenuOptions {
  /** editor（null 可）。選択・ブロック判定 / chain コマンドに使う。 */
  editor: Editor | null;
  /** 読み取り専用。cut / paste / clear などを無効化する。 */
  readOnly?: boolean;
  /** i18n。 */
  t: TranslationFn;
  /** 現在のモード（review / wysiwyg / source）。 */
  currentMode?: "review" | "wysiwyg" | "source";
  /** モード切替コールバック（指定時のみモード切替セクションを表示する）。 */
  onSwitchToReview?: () => void;
  onSwitchToWysiwyg?: () => void;
  onSwitchToSource?: () => void;
  /** ソースモード等、editor.view.dom 以外でも contextmenu を出す追加要素。 */
  extraContainer?: HTMLElement | null;
  /** ソースモードの textarea（Cut/Copy/Paste 操作用）。 */
  sourceTextarea?: HTMLTextAreaElement | null;
  /**
   * VS Code postMessage ブリッジ（クリップボード貼り付けフロー）。
   * 未指定時は `window.__vscode` へフォールバック（他 chrome の vscodeApi 注入規約と同一）。
   */
  vscodeApi?: VsCodeApi | null;
}

/** {@link createEditorContextMenu} の戻り値。 */
export interface EditorContextMenuHandle {
  /** editor / extraContainer / sourceTextarea / mode を反映する。 */
  update: (next: Partial<CreateEditorContextMenuOptions>) => void;
  /** 開いているメニューを閉じ、contextmenu / VS Code paste listener を解放する。 */
  destroy: () => void;
}

interface MenuPosition {
  mouseX: number;
  mouseY: number;
}

/** クリップボードテキストを Markdown として解析しエディタに挿入する。 */
function insertMarkdownText(editor: Editor, text: string): void {
  let md = text;
  if (containsBoxTable(md)) {
    md = boxTableToMarkdown(md);
  }
  editor.chain().focus().insertContent(md).run();
}

/** ソースモード時のテキスト貼り付け。 */
async function pasteIntoSource(
  insertTextIntoTextarea: (text: string) => void,
  handleClose: () => void,
): Promise<void> {
  const text = await readTextFromClipboard();
  if (text) insertTextIntoTextarea(text);
  handleClose();
}

/** コピーされたブロックノードの挿入。 */
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

/** クリップボードの画像アイテムを貼り付ける。 */
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

/** クリップボードの HTML アイテムを貼り付ける。 */
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

/** Clipboard API 経由の貼り付け（画像 → HTML → テキストの優先順）。 */
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

/** textarea に native value setter 経由で値を流し込み input を発火する（React 制御コンポーネント互換）。 */
function setTextareaValue(ta: HTMLTextAreaElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  nativeInputValueSetter?.call(ta, value);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Menu paper（ul）へ当てる追加スタイル。React 原版 getMenuPaperStyle（getBgPaper / getDivider）を
 * `--am-color-*` CSS 変数に置換し、メニュー項目寸法の CSS 変数（MenuItem / ListItemIcon が参照）を注入する。
 */
function menuPaperStyle(): Partial<CSSStyleDeclaration> {
  // CSS 変数は Partial<CSSStyleDeclaration> に型がないため index signature 経由で設定する。
  return {
    minWidth: "180px",
    backgroundColor: "var(--am-color-bg-paper)",
    border: "1px solid var(--am-color-divider)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    paddingTop: "4px",
    paddingBottom: "4px",
    // 旧 sx の & .MuiMenuItem-root / & .MuiListItemIcon-root を CSS 変数で反映する。
    ["--am-menu-item-font" as keyof CSSStyleDeclaration as string]: CONTEXT_MENU_FONT_SIZE,
    ["--am-menu-item-minh" as keyof CSSStyleDeclaration as string]: "28px",
    ["--am-menu-item-pad-y" as keyof CSSStyleDeclaration as string]: "2px",
    ["--am-menu-item-pad-x" as keyof CSSStyleDeclaration as string]: "16px",
    ["--am-menu-icon-minw" as keyof CSSStyleDeclaration as string]: "28px",
  } as Partial<CSSStyleDeclaration>;
}

/** ショートカットヒント span（React 原版 <Text variant="body2"> 相当）を作る。 */
function shortcutHint(label: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = label;
  span.style.cssText =
    `color:var(--am-color-text-secondary);font-size:${SHORTCUT_HINT_FONT_SIZE};margin-left:16px;`;
  return span;
}

/** 1 メニュー項目（アイコン + ラベル + 任意のショートカット）を構築するヘルパ引数。 */
interface MenuItemSpec {
  icon: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}

/** MenuItemSpec から createMenuItem の el を構築する（ListItemIcon / ListItemText / shortcut を組む）。 */
function buildMenuItem(spec: MenuItemSpec): { el: HTMLLIElement; destroy: () => void } {
  const iconEl = createListItemIcon({ children: svgIcon(spec.icon, 16) }).el;
  const textEl = createListItemText({ children: spec.label }).el;
  const children: (HTMLElement)[] = [iconEl, textEl];
  if (spec.shortcut !== undefined) children.push(shortcutHint(spec.shortcut));
  const item = createMenuItem({
    children,
    disabled: spec.disabled,
    onClick: () => spec.onClick(),
  });
  return { el: item.el, destroy: item.destroy };
}

/**
 * vanilla 右クリックコンテキストメニューを生成する。
 *
 * editor.view.dom と extraContainer の `contextmenu` でクリック座標を控え、`createMenu`（anchorPosition
 * 参照・自前マウント）でメニューを開く。各項目クリックは React 原版と同一の editor コマンド / textarea
 * 操作を実行し、`handleClose`（menu handle.destroy）で閉じる。
 */
export function createEditorContextMenu(
  opts: CreateEditorContextMenuOptions,
): EditorContextMenuHandle {
  let editor = opts.editor;
  const t = opts.t;
  let readOnly = opts.readOnly;
  let currentMode = opts.currentMode;
  let extraContainer = opts.extraContainer ?? null;
  let sourceTextarea = opts.sourceTextarea ?? null;
  const { onSwitchToReview, onSwitchToWysiwyg, onSwitchToSource } = opts;
  /** 注入された VS Code ブリッジ（未指定時は window.__vscode へフォールバック）。 */
  const vscodeApi = (): VsCodeApi | undefined =>
    opts.vscodeApi === null ? undefined : (opts.vscodeApi ?? window.__vscode);

  /** 現在開いているメニュー handle（無ければ null）。 */
  let openHandle: { destroy: () => void } | null = null;
  /** 各 MenuItem の destroy を集約（メニュー閉時に listener 解放する）。 */
  let itemDestroys: Array<() => void> = [];

  const handleClose = (): void => {
    if (openHandle) {
      openHandle.destroy();
      openHandle = null;
    }
    for (const d of itemDestroys) d();
    itemDestroys = [];
  };

  // --- 活性条件（React 原版と同一） ---
  const isSourceMode = (): boolean => currentMode === "source";

  const hasSelection = (): boolean => {
    if (isSourceMode() && sourceTextarea) {
      return sourceTextarea.selectionStart !== sourceTextarea.selectionEnd;
    }
    return editor ? editor.state.selection.from !== editor.state.selection.to : false;
  };

  // --- textarea 操作（ソースモード用） ---
  const insertTextIntoTextarea = (text: string): void => {
    const ta = sourceTextarea;
    if (!ta) return;
    const before = ta.value.substring(0, ta.selectionStart);
    const after = ta.value.substring(ta.selectionEnd);
    setTextareaValue(ta, before + text + after);
    const cursorPos = before.length + text.length;
    ta.setSelectionRange(cursorPos, cursorPos);
  };

  // --- 各アクション（React 原版 handle* と同一ロジック） ---
  const handleCut = (): void => {
    if (isSourceMode()) {
      const ta = sourceTextarea;
      if (!ta) return;
      const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
      if (selected) {
        copyTextToClipboard(selected);
        const before = ta.value.substring(0, ta.selectionStart);
        const after = ta.value.substring(ta.selectionEnd);
        setTextareaValue(ta, before + after);
        ta.setSelectionRange(before.length, before.length);
      }
      handleClose();
      return;
    }
    if (!editor?.isEditable) return;
    performBlockCopy(editor.view, true, (text) => copyTextToClipboard(text));
    handleClose();
  };

  const handleCopy = (): void => {
    if (isSourceMode()) {
      const ta = sourceTextarea;
      if (!ta) return;
      const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd);
      if (selected) copyTextToClipboard(selected);
      handleClose();
      return;
    }
    if (!editor) return;
    performBlockCopy(editor.view, false, (text) => copyTextToClipboard(text));
    handleClose();
  };

  const handlePaste = async (): Promise<void> => {
    if (isSourceMode()) {
      await pasteIntoSource(insertTextIntoTextarea, handleClose);
      return;
    }
    if (!editor || !!readOnly) {
      handleClose();
      return;
    }
    const copied = getCopiedBlockNode();
    if (copied) {
      pasteCopiedBlock(editor, copied, handleClose);
      return;
    }
    await pasteFromClipboardAPI(editor, vscodeApi(), handleClose);
  };

  const handlePasteAsMarkdown = async (): Promise<void> => {
    if (!editor?.isEditable) {
      handleClose();
      return;
    }
    const text = await readTextFromClipboard();
    if (text) {
      insertMarkdownText(editor, text);
      handleClose();
      return;
    }
    // VS Code 環境: 拡張側にクリップボード読み取りを依頼
    vscodeApi()?.postMessage({ type: "readClipboard" });
    handleClose();
  };

  const handlePasteAsCodeBlock = async (): Promise<void> => {
    if (!editor || !!readOnly) {
      handleClose();
      return;
    }
    const ed = editor;
    const pasteIntoCodeBlock = (text: string): void => {
      ed.chain().focus().insertContent({
        type: "codeBlock",
        attrs: { language: "" },
        content: [{ type: "text", text }],
      }).run();
    };
    const text = await readTextFromClipboard();
    if (text) {
      pasteIntoCodeBlock(text);
      handleClose();
      return;
    }
    // VS Code 環境: vscode-paste-codeblock イベントで処理
    vscodeApi()?.postMessage({ type: "readClipboardForCodeBlock" });
    handleClose();
  };

  const handleClearScreen = (): void => {
    if (isSourceMode()) {
      const ta = sourceTextarea;
      if (ta) setTextareaValue(ta, "");
      handleClose();
      return;
    }
    if (!editor?.isEditable) {
      handleClose();
      return;
    }
    // 本文＋コメント状態を一括クリア（共有ヘルパー H2）。
    clearDocumentAndComments(editor);
    handleClose();
  };

  const handleSwitchToReview = (): void => {
    onSwitchToReview?.();
    handleClose();
  };
  const handleSwitchToWysiwyg = (): void => {
    onSwitchToWysiwyg?.();
    handleClose();
  };
  const handleSwitchToSource = (): void => {
    onSwitchToSource?.();
    handleClose();
  };

  /** メニュー項目（li 群）と Divider を組み立てる（React 原版 menuItems 構築と同条件）。 */
  const buildMenuChildren = (): HTMLElement[] => {
    const canCopy =
      hasSelection() || (!isSourceMode() && editor ? !!findBlockNode(editor.state) : false);
    const ro = !!readOnly;
    const children: HTMLElement[] = [];

    const push = (spec: MenuItemSpec): void => {
      const built = buildMenuItem(spec);
      itemDestroys.push(built.destroy);
      children.push(built.el);
    };
    const pushDivider = (): void => {
      const div = createDivider().el;
      div.style.margin = "4px 0";
      children.push(div);
    };

    push({
      icon: PATH.contentCut,
      label: t("cut"),
      shortcut: "Ctrl+X",
      disabled: ro || !canCopy,
      onClick: handleCut,
    });
    push({
      icon: PATH.contentCopy,
      label: t("copy"),
      shortcut: "Ctrl+C",
      disabled: !canCopy,
      onClick: handleCopy,
    });
    push({
      icon: PATH.contentPaste,
      label: t("paste"),
      shortcut: "Ctrl+V",
      disabled: ro,
      onClick: () => void handlePaste(),
    });

    if (currentMode !== "source") {
      pushDivider();
      push({
        icon: PATH.contentPaste,
        label: t("pasteAsMarkdown"),
        shortcut: "Ctrl+Shift+V",
        disabled: ro,
        onClick: () => void handlePasteAsMarkdown(),
      });
      push({
        icon: PATH.code,
        label: t("pasteAsCodeBlock"),
        disabled: ro,
        onClick: () => void handlePasteAsCodeBlock(),
      });
    }

    pushDivider();
    push({
      icon: PATH.clearAll,
      label: t("clearScreen"),
      disabled: ro,
      onClick: handleClearScreen,
    });

    if (onSwitchToReview) {
      pushDivider();
      push({
        icon: PATH.visibilityOutlined,
        label: t("review"),
        disabled: currentMode === "review",
        onClick: handleSwitchToReview,
      });
      push({
        icon: PATH.editOutlined,
        label: t("wysiwyg"),
        disabled: currentMode === "wysiwyg",
        onClick: handleSwitchToWysiwyg,
      });
      push({
        icon: PATH.code,
        label: t("source"),
        disabled: currentMode === "source",
        onClick: handleSwitchToSource,
      });
    }

    return children;
  };

  /** クリック座標へアンカーしたメニューを開く（既存メニューがあれば閉じてから開き直す）。 */
  const openMenu = (pos: MenuPosition): void => {
    handleClose();
    const children = buildMenuChildren();
    openHandle = createMenu({
      anchorReference: "anchorPosition",
      anchorPosition: { top: pos.mouseY, left: pos.mouseX },
      onClose: handleClose,
      paperStyle: menuPaperStyle(),
      children,
    });
  };

  // --- contextmenu イベント購読（editor.view.dom + extraContainer） ---
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    openMenu({ mouseX: event.clientX, mouseY: event.clientY });
  };

  let boundDom: HTMLElement | null = null;
  let boundExtra: HTMLElement | null = null;

  const bindContextMenu = (): void => {
    const dom = (editor?.view.dom as HTMLElement | undefined) ?? null;
    if (dom !== boundDom) {
      boundDom?.removeEventListener("contextmenu", onContextMenu);
      dom?.addEventListener("contextmenu", onContextMenu);
      boundDom = dom;
    }
    if (extraContainer !== boundExtra) {
      boundExtra?.removeEventListener("contextmenu", onContextMenu);
      extraContainer?.addEventListener("contextmenu", onContextMenu);
      boundExtra = extraContainer;
    }
  };
  bindContextMenu();

  // --- VS Code 拡張からの Markdown / コードブロック貼り付けイベント ---
  const onPasteMarkdown = (e: Event): void => {
    const text = (e as CustomEvent<string>).detail;
    if (text && editor?.isEditable) {
      insertMarkdownText(editor, text);
    }
  };
  const onPasteCodeBlock = (e: Event): void => {
    const text = (e as CustomEvent<string>).detail;
    if (text && editor?.isEditable) {
      editor.chain().focus().insertContent({
        type: "codeBlock",
        attrs: { language: "" },
        content: [{ type: "text", text }],
      }).run();
    }
  };
  globalThis.addEventListener("vscode-paste-markdown", onPasteMarkdown);
  globalThis.addEventListener("vscode-paste-codeblock", onPasteCodeBlock);

  let destroyed = false;
  return {
    update(next: Partial<CreateEditorContextMenuOptions>) {
      if (next.editor !== undefined) editor = next.editor;
      if (next.readOnly !== undefined) readOnly = next.readOnly;
      if (next.currentMode !== undefined) currentMode = next.currentMode;
      if (next.extraContainer !== undefined) extraContainer = next.extraContainer ?? null;
      if (next.sourceTextarea !== undefined) sourceTextarea = next.sourceTextarea ?? null;
      // editor / extraContainer の差し替えで contextmenu の張り直しが要る。
      bindContextMenu();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      handleClose();
      boundDom?.removeEventListener("contextmenu", onContextMenu);
      boundExtra?.removeEventListener("contextmenu", onContextMenu);
      boundDom = null;
      boundExtra = null;
      globalThis.removeEventListener("vscode-paste-markdown", onPasteMarkdown);
      globalThis.removeEventListener("vscode-paste-codeblock", onPasteCodeBlock);
    },
  };
}
