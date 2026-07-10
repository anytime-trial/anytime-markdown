/**
 * 脱React の vanilla DOM chrome「EditorMenuPopovers」（framework-decoupling Phase 3）。
 *
 * React 原版 `components/EditorMenuPopovers.tsx`（MUI Popover / MenuItem / ListItemIcon /
 * ListItemText / IconButton / Tooltip / Divider 消費）の素 DOM 版。複数の Popover
 * （help / diagram / sample / template / heading）を **個別に開閉管理** し、`destroy()` で
 * 全 close する。各 Popover は開く時に `createPopover({ anchor, onClose, children })` で生成
 * （ui-vanilla の Popover は self-append: 生成時に document.body へ自前マウントし destroy で取外す）、
 * 閉じる時にそのハンドルを destroy する。
 *
 * 変換規約:
 * - React props（editor / コールバック / flag）→ ファクトリ options（opts）。
 * - `useMarkdownLocale()` → `opts.locale`（builtinTemplates の言語判定）。
 * - `useIsDark()` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従するため isDark 分岐は削除）。
 *   sample アイコン枠の border 色は `getDivider(isDark)` → `var(--am-color-divider)` に置換。
 * - `useMemo` → 開く時に `getBuiltinTemplates(locale)` を直接呼ぶ（毎回少数の計算で十分・キャッシュ不要）。
 * - React の `<Popover open anchorEl>` パターン → 開く時に `createPopover` で生成（自前マウント）、
 *   閉じる時にハンドルを destroy。MenuItem / ListItemIcon / ListItemText は ui-vanilla の create* で構成。
 * - editor 操作（chain / commands / ProseMirror selection 解析）は React 版と同一ロジックを移植。
 *
 * 各 Popover は同時に 1 つだけ開く想定（React 版も anchor state は別々だが UI 上排他）。
 * `openXxx()` 呼び出し時に同名の既存ハンドルがあれば閉じてから開き直す。`destroy()` で全ハンドルを
 * 閉じ、editor 参照を解放する。
 *
 * 本 chrome は **追加のみ・本番未配線**（React 原版 components/EditorMenuPopovers.tsx は変更しない）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { MENU_ITEM_FONT_SIZE } from "../constants/dimensions";
import { PLANTUML_SAMPLES } from "../constants/samples";
import { getBuiltinTemplates, type MarkdownTemplate } from "../constants/templates";
import type { TranslationFn } from "../types";
import {
  createDivider,
  createIconButton,
  createListItemIcon,
  createListItemText,
  createMenuItem,
  createPopover,
  createTooltip,
  svgIcon,
} from "@anytime-markdown/ui-core";

// --- Material SVG path（ui/icons.tsx と同一）。React 原版が消費する MUI アイコンの素 DOM 化 ---
const PATH = {
  chatBubbleOutline:
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H6l-2 2V4h16z",
  checkBox:
    "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2m-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z",
  formatListBulleted:
    "M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5m0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5m0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5M7 19h14v-2H7zm0-6h14v-2H7zm0-8v2h14V5z",
  formatListNumbered:
    "M2 17h2v.5H3v1h1v.5H2v1h3v-4H2zm1-9h1V4H2v1h1zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2zm5-6v2h14V5zm0 14h14v-2H7zm0-6h14v-2H7z",
  formatQuote: "M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z",
  infoOutlined:
    "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8",
  listAlt:
    "M19 5v14H5V5zm1.1-2H3.9c-.5 0-.9.4-.9.9v16.2c0 .4.4.9.9.9h16.2c.4 0 .9-.5.9-.9V3.9c0-.5-.5-.9-.9-.9M11 7h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6zM7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7z",
  folderOpen:
    "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V8h16z",
  addToDrive:
    "m12.01 1.485 4.99 8.645-2.807 4.865H8.653l-1.404-2.43zM7.192 3.63 2.2 12.275l2.807 4.865 4.99-8.645zM15.5 16.37H5.52l-2.81 4.865h9.98z",
  save: "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m3-10H5V5h10z",
  saveAs:
    "M21 12.4V7l-4-4H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h7.4zM15 15c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3M6 6h9v4H6zm13.99 10.25 1.77 1.77L16.77 23H15v-1.77zm3.26.26-.85.85-1.77-1.77.85-.85c.2-.2.51-.2.71 0l1.06 1.06c.2.2.2.52 0 .71",
  schema:
    "M14 9v2h-3V9H8.5V7H11V1H4v6h2.5v2H4v6h2.5v2H4v6h7v-6H8.5v-2H11v-2h3v2h7V9z",
  settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6",
  // Mermaid.js official logo（icons/MermaidIcon.tsx と同一・viewBox 0 0 490.16 490.16）。
  mermaid: [
    "M407.48,111.18A165.2,165.2,0,0,0,245.08,220,165.2,165.2,0,0,0,82.68,111.18a165.5,165.5,0,0,0,72.06,143.64,88.81,88.81,0,0,1,38.53,73.45v50.86H296.9V328.27a88.8,88.8,0,0,1,38.52-73.45,165.41,165.41,0,0,0,72.06-143.64Z",
    "M160.63,328.27a56.09,56.09,0,0,0-24.27-46.49,198.74,198.74,0,0,1-28.54-23.66A196.87,196.87,0,0,1,82.53,227V379.13h78.1Z",
    "M329.53,328.27a56.09,56.09,0,0,1,24.27-46.49,198.74,198.74,0,0,0,28.54-23.66A196.87,196.87,0,0,0,407.63,227V379.13h-78.1Z",
  ],
} as const;

/** MenuItem 共通の inline style（React 原版の fontSize / minHeight 指定相当）。 */
const MENU_ITEM_STYLE: Partial<CSSStyleDeclaration> = {
  fontSize: MENU_ITEM_FONT_SIZE,
  minHeight: "36px",
};

/** Mermaid ロゴ専用 SVG（独自 viewBox のため svgIcon を使わず手組みする）。currentColor で塗る。 */
function mermaidSvg(size = 18): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 490.16 490.16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  for (const d of PATH.mermaid) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}

/** heading popover が受ける引数（React 原版 headingMenu state と同形）。 */
interface HeadingMenuTarget {
  anchorEl: HTMLElement;
  pos: number;
  currentLevel: number;
}

/** {@link createEditorMenuPopovers} のオプション（React `EditorMenuPopoversProps` の vanilla 再現）。 */
interface CreateEditorMenuPopoversOptions {
  /** editor（null 可）。各メニュー操作で参照する。 */
  editor: Editor | null;
  /** i18n。 */
  t: TranslationFn;
  /** ビルトインテンプレート言語判定（useMarkdownLocale 相当）。 */
  locale: string;
  /** template 選択時のコールバック（React 原版 onInsertTemplate）。 */
  onInsertTemplate?: (template: MarkdownTemplate) => void;
  /** source モード（diagram は editor ではなく source 用コールバックへ委譲）。 */
  sourceMode?: boolean;
  /** source モードでの Mermaid 挿入。 */
  onSourceInsertMermaid?: () => void;
  /** source モードでの PlantUML 挿入。 */
  onSourceInsertPlantUml?: () => void;
  /** version info を隠す。 */
  hideVersionInfo?: boolean;
  /** outline トグル（提供時のみ help メニューに項目を出す）。 */
  onToggleOutline?: () => void;
  /** comments トグル（提供時のみ help メニューに項目を出す）。 */
  onToggleComments?: () => void;
  /** settings 起動（提供時のみ help メニューに項目を出す）。 */
  onOpenSettings?: () => void;
  /** version dialog 起動（React 原版 setVersionDialogOpen(true) 相当）。 */
  onOpenVersionDialog?: () => void;
  /** outline 現在の開閉（help メニューのアイコン色判定）。 */
  outlineOpen?: boolean;
  /** comments 現在の開閉（help メニューのアイコン色判定）。 */
  commentOpen?: boolean;
}

/** {@link EditorMenuPopoversHandle.openFileMenu} が並べる選択肢。 */
export interface OpenFileMenuHandlers {
  /** ローカルのファイル選択（File System Access API もしくは file input）。 */
  onOpenLocal: () => void | Promise<void>;
  /** Google Drive（Picker）からの読み込み。 */
  onOpenFromDrive: () => void | Promise<void>;
}

/** {@link EditorMenuPopoversHandle.openSaveMenu} が並べる選択肢。 */
export interface SaveMenuHandlers {
  /** 上書き保存。`overwriteDisabled` が true の場合は項目が無効化される。 */
  onSaveFile: () => void | Promise<void>;
  /** 名前を付けて保存（ローカル）。 */
  onSaveAsFile: () => void | Promise<void>;
  /** Google Drive へ新規保存（注入時のみ項目が並ぶ）。 */
  onSaveToDrive?: () => void | Promise<void>;
  /** 上書き保存の宛先が無い / 未編集 / readonly のとき true。 */
  overwriteDisabled: boolean;
}

/** {@link createEditorMenuPopovers} の戻り値。 */
export interface EditorMenuPopoversHandle {
  /** help popover を anchorEl にアンカーして開く（既存があれば開き直す）。 */
  openHelp: (anchorEl: HTMLElement) => void;
  /** 「開く」メニューを anchorEl にアンカーして開く。 */
  openFileMenu: (anchorEl: HTMLElement, handlers: OpenFileMenuHandlers) => void;
  /** 「保存」メニューを anchorEl にアンカーして開く。 */
  openSaveMenu: (anchorEl: HTMLElement, handlers: SaveMenuHandlers) => void;
  /** diagram 選択 popover を開く。 */
  openDiagram: (anchorEl: HTMLElement) => void;
  /** PlantUML サンプル選択 popover を開く。 */
  openSample: (anchorEl: HTMLElement) => void;
  /** template 選択 popover を開く。 */
  openTemplate: (anchorEl: HTMLElement) => void;
  /** heading レベル変更 popover を開く。 */
  openHeading: (target: HeadingMenuTarget) => void;
  /** 開いている全 popover を閉じる。 */
  closeAll: () => void;
  /** 可変オプション（editor / flag / コールバック）の反映。 */
  update: (next: Partial<CreateEditorMenuPopoversOptions>) => void;
  /** 全 popover を閉じ、参照を解放する。 */
  destroy: () => void;
}

/** popover ハンドル（createPopover 戻り値の最小形）。 */
type PopoverHandle = { destroy: () => void };

/**
 * editor の選択位置からリスト / blockquote を解除する chain を組む（React 原版 stripListAndBlockquote と同一）。
 * anchorEl の DOM 構造（ul / ol / data-type / blockquote）からリスト種別を判定し、対応する toggle を chain へ積む。
 */
function stripListAndBlockquote(
  editor: Editor,
  anchorEl: HTMLElement,
): { chain: ReturnType<ReturnType<Editor["chain"]>["focus"]>; inBlockquote: boolean } {
  const inBlockquote =
    anchorEl.tagName.toLowerCase() === "blockquote" || !!anchorEl.closest("blockquote");
  const parentList = anchorEl.closest("ul, ol") as HTMLElement | null;
  const inTaskList = !!parentList?.dataset.type?.includes("taskList");
  const inBulletList = !inTaskList && parentList?.tagName.toLowerCase() === "ul";
  const inOrderedList = parentList?.tagName.toLowerCase() === "ol";
  const chain = editor.chain().focus();
  if (inBulletList) chain.toggleBulletList();
  else if (inOrderedList) chain.toggleOrderedList();
  else if (inTaskList) chain.toggleTaskList();
  if (inBlockquote) chain.lift("blockquote");
  return { chain, inBlockquote };
}

/** heading レベルを適用する（React 原版 applyHeadingLevel と同一）。 */
function applyHeadingLevel(
  editor: Editor,
  headingMenu: { anchorEl: HTMLElement; pos: number },
  level: number,
): void {
  editor.chain().focus().setTextSelection(headingMenu.pos).run();
  const { chain, inBlockquote } = stripListAndBlockquote(editor, headingMenu.anchorEl);
  if (level === 0) {
    if (!inBlockquote) chain.setParagraph();
  } else {
    chain.setHeading({ level: level as 1 | 2 | 3 | 4 | 5 });
  }
  chain.run();
}

/**
 * vanilla EditorMenuPopovers を生成する。
 *
 * 5 つの Popover（help / diagram / sample / template / heading）を個別に開閉管理する。各 `openXxx()`
 * は `createPopover`（self-append）で生成し、`onClose`（背景クリック / ESC）でハンドルを destroy する。
 * `closeAll()` / `destroy()` で全 popover を閉じる。
 */
export function createEditorMenuPopovers(
  opts: CreateEditorMenuPopoversOptions,
): EditorMenuPopoversHandle {
  let editor = opts.editor;
  const t = opts.t;
  let locale = opts.locale;
  let onInsertTemplate = opts.onInsertTemplate;
  let sourceMode = opts.sourceMode ?? false;
  let onSourceInsertMermaid = opts.onSourceInsertMermaid;
  let onSourceInsertPlantUml = opts.onSourceInsertPlantUml;
  let hideVersionInfo = opts.hideVersionInfo ?? false;
  let onToggleOutline = opts.onToggleOutline;
  let onToggleComments = opts.onToggleComments;
  let onOpenSettings = opts.onOpenSettings;
  let onOpenVersionDialog = opts.onOpenVersionDialog;
  let outlineOpen = opts.outlineOpen ?? false;
  let commentOpen = opts.commentOpen ?? false;

  // 各 popover の現在ハンドル（開いていなければ null）。MenuItem ハンドルも個別 popover ごとに収集する。
  const handles: Record<
    "help" | "openFile" | "saveFile" | "diagram" | "sample" | "template" | "heading",
    PopoverHandle | null
  > = {
    help: null,
    openFile: null,
    saveFile: null,
    diagram: null,
    sample: null,
    template: null,
    heading: null,
  };
  // 各 popover が生成した MenuItem / Tooltip / IconButton ハンドルの cleanup。
  const childCleanup: Record<string, Array<{ destroy: () => void }>> = {
    help: [],
    openFile: [],
    saveFile: [],
    diagram: [],
    sample: [],
    template: [],
    heading: [],
  };

  /** 指定 popover を閉じ、その子ハンドルを解放する。 */
  function close(name: keyof typeof handles): void {
    handles[name]?.destroy();
    handles[name] = null;
    for (const c of childCleanup[name]) c.destroy();
    childCleanup[name] = [];
  }

  // --- help popover ---
  function openHelp(anchorEl: HTMLElement): void {
    close("help");
    const container = document.createElement("div");
    container.style.cssText = "padding-top:4px;padding-bottom:4px;min-width:160px;";
    const cleanup = childCleanup.help;

    const addItem = (
      icon: SVGSVGElement,
      label: string,
      onClick: () => void,
      o: { disabled?: boolean } = {},
    ): void => {
      const iconWrap = createListItemIcon({ children: icon });
      const text = createListItemText({ children: label });
      const item = createMenuItem({
        children: [iconWrap.el, text.el],
        disabled: o.disabled,
        style: MENU_ITEM_STYLE,
        onClick,
      });
      cleanup.push(item);
      container.appendChild(item.el);
    };

    if (onToggleOutline) {
      const icon = svgIcon(PATH.listAlt, 20);
      if (outlineOpen) icon.style.color = "var(--am-color-primary-main)";
      addItem(icon, t("outline"), () => {
        onToggleOutline?.();
        close("help");
      }, { disabled: sourceMode });
    }
    if (onToggleComments) {
      const icon = svgIcon(PATH.chatBubbleOutline, 20);
      if (commentOpen) icon.style.color = "var(--am-color-primary-main)";
      addItem(icon, t("commentPanel"), () => {
        onToggleComments?.();
        close("help");
      }, { disabled: sourceMode });
    }
    if (onOpenSettings) {
      addItem(svgIcon(PATH.settings, 20), t("editorSettings"), () => {
        onOpenSettings?.();
        close("help");
      });
    }
    if ((onToggleOutline || onToggleComments || onOpenSettings) && !hideVersionInfo) {
      container.appendChild(createDivider().el);
    }
    if (!hideVersionInfo) {
      addItem(svgIcon(PATH.infoOutlined, 20), t("versionInfo"), () => {
        onOpenVersionDialog?.();
        close("help");
      });
    }

    handles.help = createPopover({
      anchor: anchorEl,
      onClose: () => close("help"),
      paperRole: "menu",
      ariaLabel: t("helpMenu"),
      children: container,
    });
  }

  // --- 「開く」メニュー popover ---
  function openFileMenu(anchorEl: HTMLElement, handlers: OpenFileMenuHandlers): void {
    close("openFile");
    const container = document.createElement("div");
    container.style.cssText = "padding-top:4px;padding-bottom:4px;min-width:200px;";
    const cleanup = childCleanup.openFile;

    const addItem = (iconPath: string, label: string, onSelect: () => void | Promise<void>): void => {
      const iconWrap = createListItemIcon({ children: svgIcon(iconPath, 20) });
      const text = createListItemText({ children: label });
      const item = createMenuItem({
        children: [iconWrap.el, text.el],
        style: MENU_ITEM_STYLE,
        onClick: () => {
          close("openFile");
          void onSelect();
        },
      });
      cleanup.push(item);
      container.appendChild(item.el);
    };

    addItem(PATH.folderOpen, t("openFromLocal"), handlers.onOpenLocal);
    addItem(PATH.addToDrive, t("openFromDrive"), handlers.onOpenFromDrive);

    handles.openFile = createPopover({
      anchor: anchorEl,
      onClose: () => close("openFile"),
      paperRole: "menu",
      ariaLabel: t("openFileMenu"),
      children: container,
    });
  }

  // --- 「保存」メニュー popover ---
  function openSaveMenu(anchorEl: HTMLElement, handlers: SaveMenuHandlers): void {
    close("saveFile");
    const container = document.createElement("div");
    container.style.cssText = "padding-top:4px;padding-bottom:4px;min-width:200px;";
    const cleanup = childCleanup.saveFile;

    const addItem = (
      iconPath: string,
      label: string,
      onSelect: () => void | Promise<void>,
      o: { disabled?: boolean } = {},
    ): void => {
      const iconWrap = createListItemIcon({ children: svgIcon(iconPath, 20) });
      const text = createListItemText({ children: label });
      const item = createMenuItem({
        children: [iconWrap.el, text.el],
        disabled: o.disabled,
        style: MENU_ITEM_STYLE,
        onClick: () => {
          close("saveFile");
          void onSelect();
        },
      });
      cleanup.push(item);
      container.appendChild(item.el);
    };

    addItem(PATH.save, t("saveFile"), handlers.onSaveFile, { disabled: handlers.overwriteDisabled });
    addItem(PATH.saveAs, t("saveAsFile"), handlers.onSaveAsFile);
    if (handlers.onSaveToDrive) {
      addItem(PATH.addToDrive, t("saveToDrive"), handlers.onSaveToDrive);
    }

    handles.saveFile = createPopover({
      anchor: anchorEl,
      onClose: () => close("saveFile"),
      paperRole: "menu",
      ariaLabel: t("saveFileMenu"),
      children: container,
    });
  }

  // --- diagram 選択 popover ---
  function openDiagram(anchorEl: HTMLElement): void {
    close("diagram");
    const container = document.createElement("div");
    container.style.cssText = "display:flex;flex-direction:column;padding:4px;";
    const cleanup = childCleanup.diagram;

    const addDiagramBtn = (
      iconNode: SVGSVGElement,
      label: string,
      onClick: () => void,
    ): void => {
      const btn = createIconButton({
        size: "small",
        ariaLabel: label,
        children: iconNode,
        onClick: () => {
          onClick();
          close("diagram");
        },
      });
      btn.el.setAttribute("role", "menuitem");
      cleanup.push(btn);
      const tip = createTooltip({ reference: btn.el, title: label, placement: "right" });
      cleanup.push(tip);
      container.appendChild(btn.el);
    };

    addDiagramBtn(mermaidSvg(18), t("mermaid"), () => {
      if (sourceMode) {
        onSourceInsertMermaid?.();
      } else {
        editor?.chain().focus().setCodeBlock({ language: "mermaid" }).run();
        editor?.commands.insertContent({ type: "text", text: "" });
      }
    });
    addDiagramBtn(svgIcon(PATH.schema, 18), t("plantuml"), () => {
      if (sourceMode) {
        onSourceInsertPlantUml?.();
      } else {
        editor?.chain().focus().setCodeBlock({ language: "plantuml" }).run();
      }
    });

    handles.diagram = createPopover({
      anchor: anchorEl,
      onClose: () => close("diagram"),
      paperRole: "menu",
      ariaLabel: t("diagramMenu"),
      children: container,
    });
  }

  // --- PlantUML サンプル選択 popover ---
  function openSample(anchorEl: HTMLElement): void {
    close("sample");
    const container = document.createElement("div");
    container.style.cssText = "display:flex;flex-direction:column;padding:4px;";
    const cleanup = childCleanup.sample;

    for (const sample of PLANTUML_SAMPLES.filter((s) => s.enabled)) {
      const code = sample.code;
      const label = t(sample.i18nKey);
      // sample アイコン枠（React 原版 span。border 色は getDivider → var(--am-color-divider)）。
      const iconSpan = document.createElement("span");
      iconSpan.setAttribute("aria-hidden", "true");
      iconSpan.textContent = sample.icon;
      iconSpan.style.cssText =
        "font-size:9px;font-family:monospace;font-weight:700;line-height:1;" +
        "border:1px solid var(--am-color-divider);border-radius:2px;width:28px;height:28px;" +
        "display:flex;align-items:center;justify-content:center;";
      const btn = createIconButton({
        size: "small",
        ariaLabel: label,
        children: iconSpan,
        onClick: () => {
          insertPlantUmlSample(code);
          close("sample");
        },
      });
      btn.el.setAttribute("role", "menuitem");
      cleanup.push(btn);
      const tip = createTooltip({ reference: btn.el, title: label, placement: "right" });
      cleanup.push(tip);
      container.appendChild(btn.el);
    }

    handles.sample = createPopover({
      anchor: anchorEl,
      onClose: () => close("sample"),
      paperRole: "menu",
      ariaLabel: t("plantumlSampleMenu"),
      children: container,
    });
  }

  /** 現在の選択が属する plantuml codeBlock を sample.code で置換する（React 原版と同一ロジック）。 */
  function insertPlantUmlSample(code: string): void {
    if (!editor) return;
    const { $from } = editor.state.selection;
    let depth = $from.depth;
    while (depth > 0) {
      const node = $from.node(depth);
      if (node.type.name === "codeBlock" && node.attrs.language === "plantuml") break;
      depth--;
    }
    if (depth > 0) {
      const start = $from.start(depth);
      const end = $from.end(depth);
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.replaceWith(start, end, editor!.schema.text(code));
          return true;
        })
        .run();
    }
  }

  // --- template 選択 popover ---
  function openTemplate(anchorEl: HTMLElement): void {
    close("template");
    const container = document.createElement("div");
    container.style.cssText = "padding-top:4px;padding-bottom:4px;min-width:180px;";
    const cleanup = childCleanup.template;

    for (const tmpl of getBuiltinTemplates(locale)) {
      const item = createMenuItem({
        children: t(tmpl.name),
        style: MENU_ITEM_STYLE,
        onClick: () => {
          onInsertTemplate?.(tmpl);
          close("template");
        },
      });
      cleanup.push(item);
      container.appendChild(item.el);
    }

    handles.template = createPopover({
      anchor: anchorEl,
      onClose: () => close("template"),
      paperRole: "menu",
      ariaLabel: t("templateMenu"),
      children: container,
    });
  }

  // --- heading レベル変更 popover ---
  function openHeading(target: HeadingMenuTarget): void {
    close("heading");
    const container = document.createElement("div");
    container.style.cssText = "padding-top:4px;padding-bottom:4px;";
    const cleanup = childCleanup.heading;

    const isActive = (name: string): boolean => !!editor?.isActive(name);

    // level 系（Paragraph / H1〜H5）。
    const levels: Array<{ level: number; label: string }> = [
      { level: 0, label: t("headingParagraph") },
      { level: 1, label: "H1" },
      { level: 2, label: "H2" },
      { level: 3, label: "H3" },
      { level: 4, label: "H4" },
      { level: 5, label: "H5" },
    ];
    for (const { level, label } of levels) {
      const selected =
        target.currentLevel === level &&
        (level !== 0 ||
          !(isActive("bulletList") || isActive("orderedList") || isActive("taskList") || isActive("blockquote")));
      const item = createMenuItem({
        children: label,
        selected,
        style: MENU_ITEM_STYLE,
        onClick: () => {
          if (!editor) return;
          applyHeadingLevel(editor, target, level);
          close("heading");
        },
      });
      cleanup.push(item);
      container.appendChild(item.el);
    }

    container.appendChild(createDivider({}).el);

    // リスト系（bullet / ordered / task）。アイコン + テキストの行（gap 8px）。
    const addListItem = (
      iconPath: string,
      labelKey: string,
      activeName: string,
      toggle: (
        chain: ReturnType<ReturnType<Editor["chain"]>["focus"]>,
      ) => ReturnType<ReturnType<Editor["chain"]>["focus"]>,
    ): void => {
      const item = createMenuItem({
        children: [svgIcon(iconPath, 18), labelText(t(labelKey))],
        selected: isActive(activeName),
        style: { ...MENU_ITEM_STYLE, gap: "8px" },
        onClick: () => {
          if (!editor) return;
          toggle(editor.chain().focus().setTextSelection(target.pos)).run();
          close("heading");
        },
      });
      cleanup.push(item);
      container.appendChild(item.el);
    };

    addListItem(PATH.formatListBulleted, "bulletList", "bulletList", (c) => c.toggleBulletList());
    addListItem(PATH.formatListNumbered, "orderedList", "orderedList", (c) => c.toggleOrderedList());
    addListItem(PATH.checkBox, "taskList", "taskList", (c) => c.toggleTaskList());

    container.appendChild(createDivider({}).el);

    // blockquote。
    {
      const item = createMenuItem({
        children: [svgIcon(PATH.formatQuote, 18), labelText(t("blockquote"))],
        selected: isActive("blockquote"),
        style: { ...MENU_ITEM_STYLE, gap: "8px" },
        onClick: () => {
          if (!editor) return;
          editor.chain().focus().setTextSelection(target.pos).toggleBlockquote().run();
          close("heading");
        },
      });
      cleanup.push(item);
      container.appendChild(item.el);
    }

    handles.heading = createPopover({
      anchor: target.anchorEl,
      onClose: () => close("heading"),
      paperRole: "menu",
      ariaLabel: t("headingMenu"),
      children: container,
    });
  }

  function closeAll(): void {
    close("help");
    close("openFile");
    close("saveFile");
    close("diagram");
    close("sample");
    close("template");
    close("heading");
  }

  let destroyed = false;
  return {
    openHelp,
    openFileMenu,
    openSaveMenu,
    openDiagram,
    openSample,
    openTemplate,
    openHeading,
    closeAll,
    update(next: Partial<CreateEditorMenuPopoversOptions>) {
      if (next.editor !== undefined) editor = next.editor;
      if (next.locale !== undefined) locale = next.locale;
      if (next.onInsertTemplate !== undefined) onInsertTemplate = next.onInsertTemplate;
      if (next.sourceMode !== undefined) sourceMode = next.sourceMode;
      if (next.onSourceInsertMermaid !== undefined) onSourceInsertMermaid = next.onSourceInsertMermaid;
      if (next.onSourceInsertPlantUml !== undefined) onSourceInsertPlantUml = next.onSourceInsertPlantUml;
      if (next.hideVersionInfo !== undefined) hideVersionInfo = next.hideVersionInfo;
      if (next.onToggleOutline !== undefined) onToggleOutline = next.onToggleOutline;
      if (next.onToggleComments !== undefined) onToggleComments = next.onToggleComments;
      if (next.onOpenSettings !== undefined) onOpenSettings = next.onOpenSettings;
      if (next.onOpenVersionDialog !== undefined) onOpenVersionDialog = next.onOpenVersionDialog;
      if (next.outlineOpen !== undefined) outlineOpen = next.outlineOpen;
      if (next.commentOpen !== undefined) commentOpen = next.commentOpen;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      closeAll();
      editor = null;
    },
  };
}

/** リスト / blockquote 行のテキスト span（MenuItem の flex 行で gap を効かせるため span 化）。 */
function labelText(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}
