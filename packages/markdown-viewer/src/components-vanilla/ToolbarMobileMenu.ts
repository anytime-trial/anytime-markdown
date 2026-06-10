/**
 * 脱React の vanilla DOM モバイル more メニュー「ToolbarMobileMenu」（framework-decoupling Phase 3）。
 *
 * React 原版 `components/ToolbarMobileMenu.tsx`（MUI Menu / MenuItem / ListItemIcon / ListItemText /
 * Divider 消費）の素 DOM 版。モバイル幅でハンバーガーから開く more メニュー（ファイル操作 + outline /
 * comments + settings + versionInfo）を素 DOM で構成する。
 *
 * 変換規約:
 * - React props → opts（anchorEl / t / コールバック / flag）。戻り値は { el, destroy }。
 *   `el` は createMenu のルート（backdrop + ul を内包する wrapper・自前マウント済み）。
 * - React `<Menu open anchorEl>` → 生成時に createMenu({ anchorEl, onClose, children:[...] }) で
 *   ul(role=menu) を組み立て、`document.body` へ自前マウント（createMenu の self-append）。閉じるのは
 *   `destroy()`（呼び元が onClose を受けて destroy する。Menu 自身も backdrop click / ESC / Tab で
 *   onClose を発火する）。
 * - MenuItem / ListItemIcon / ListItemText / Divider → ui-vanilla の create* / mkDivider で構成。
 * - useIsDark は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従するため isDark 分岐は削除）。
 *   useMarkdownT / useMarkdownLocale → t を opts で受領（locale は本コンポーネントでは未使用）。
 * - アイコンの `color={open ? "primary" : "inherit"}`（outline / comments のアクティブ色）→ svgIcon の
 *   fill 色を CSS 変数（--am-color-primary-main / --am-color-action-active）で出し分ける。
 *
 * 本 PoC は **追加のみ・本番未配線**（React 原版 components/ToolbarMobileMenu.tsx は変更しない）。
 */

import type { TranslationFn } from "../types";
import type { ToolbarFileCapabilities, ToolbarFileHandlers } from "../types/toolbar";
import {
  createListItemIcon,
  createListItemText,
  createMenu,
  createMenuItem,
  createDivider,
  svgIcon,
} from "../ui-vanilla";

/**
 * Material SVG path（ui/icons.tsx と同一）。EditorToolbar.ts の PATH と重複するが、本ファイルで
 * 使うものだけを保持する（chrome 同士の依存を増やさず自己完結させる）。
 */
const PATH = {
  folderOpen:
    "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V8h16z",
  save: "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m3-10H5V5h10z",
  saveAs:
    "M21 12.4V7l-4-4H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h7.4zM15 15c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3M6 6h9v4H6zm13.99 10.25 1.77 1.77L16.77 23H15v-1.77zm3.26.26-.85.85-1.77-1.77.85-.85c.2-.2.51-.2.71 0l1.06 1.06c.2.2.2.52 0 .71",
  pictureAsPdf:
    "M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5zm4-3H19v1h1.5V11H19v2h-1.5V7h3zM9 9.5h1v-1H9zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4zm10 5.5h1v-3h-1z",
  listAlt:
    "M19 5v14H5V5zm1.1-2H3.9c-.5 0-.9.4-.9.9v16.2c0 .4.4.9.9.9h16.2c.4 0 .9-.5.9-.9V3.9c0-.5-.5-.9-.9-.9M11 7h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6zM7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7z",
  chatBubble:
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H6l-2 2V4h16z",
  settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6",
  infoOutlined:
    "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8",
} as const;

/** {@link createToolbarMobileMenu} のオプション（React `ToolbarMobileMenuProps` の vanilla 再現）。 */
export interface CreateToolbarMobileMenuOptions {
  /**
   * アンカー要素（ハンバーガー more ボタン）。React `anchorEl` 相当。createMenu の reference に渡す。
   * null の場合は anchorPosition 未指定の virtual rect (0,0) にフォールバックする（createMenu 仕様）。
   */
  anchorEl: HTMLElement | null;
  /** 閉じる要求（背景クリック / ESC / Tab / 項目クリック後）時のコールバック。React `onClose` 相当。 */
  onClose: () => void;

  outlineOpen: boolean;
  commentOpen?: boolean;
  inlineMergeOpen: boolean;
  sourceMode: boolean;
  readonlyMode?: boolean;

  hideOutline?: boolean;
  hideComments?: boolean;
  hideSettings?: boolean;
  hideVersionInfo?: boolean;
  hideFileOps?: boolean;

  fileHandlers?: ToolbarFileHandlers;
  fileCapabilities?: ToolbarFileCapabilities;

  onToggleOutline: () => void;
  onToggleComments?: () => void;
  onOpenSettings?: () => void;
  onOpenVersionDialog?: () => void;
  /** i18n。 */
  t: TranslationFn;
}

/** {@link createToolbarMobileMenu} の戻り値。 */
export interface ToolbarMobileMenuHandle {
  /** createMenu のルート（backdrop + ul wrapper・document.body へ自前マウント済み）。 */
  el: HTMLElement;
  /** menu の ul（role=menu）。 */
  menu: HTMLUListElement;
  /** menu / listener / focusTrap を解放し menu を閉じる（el を取り外す）。冪等。 */
  destroy: () => void;
}

/** outline / comments のアクティブ色（React 原版 color={open ? "primary" : "inherit"} 相当）。 */
function activeIconColor(active: boolean | undefined): string {
  return active ? "var(--am-color-primary-main)" : "var(--am-color-action-active)";
}

/**
 * vanilla モバイル more メニューを生成する。
 *
 * 生成時に createMenu を組み立てて `document.body` へ自前マウントする（= 開く）。React 原版が
 * `open={!!anchorEl}` で開閉していたのに対し、vanilla 版は「生成 = 開く / destroy = 閉じる」で表現する。
 * 各 MenuItem クリックは React 原版と同一のコールバック（必要なら onClose）を実行する。
 *
 * 構成（上→下）: ファイル操作（externalSaveOnly / supportsDirectAccess / その他で分岐）→ divider →
 * outline → comments → divider → settings → divider → versionInfo。
 */
export function createToolbarMobileMenu(
  opts: CreateToolbarMobileMenuOptions,
): ToolbarMobileMenuHandle {
  const { t, onClose } = opts;
  const { hasFileHandle, supportsDirectAccess, externalSaveOnly } =
    opts.fileCapabilities ?? {};
  const readOnly = opts.readonlyMode;

  // 生成した MenuItem ハンドルを destroy で解放するため収集する。
  const itemHandles: Array<{ destroy: () => void }> = [];

  /** ListItemIcon(svg) + ListItemText(label) を持つ MenuItem を組み立てて収集する。 */
  function buildItem(arg: {
    iconPath: string;
    iconColor?: string;
    label: string;
    disabled?: boolean;
    onClick: () => void;
  }): HTMLLIElement {
    const icon = svgIcon(arg.iconPath, 20);
    if (arg.iconColor) icon.style.color = arg.iconColor;
    const { el: iconEl } = createListItemIcon({ children: icon });
    const { el: textEl } = createListItemText({ children: arg.label });
    const handle = createMenuItem({
      disabled: arg.disabled,
      children: [iconEl, textEl],
      onClick: () => {
        arg.onClick();
        onClose();
      },
    });
    itemHandles.push(handle);
    return handle.el;
  }

  /** ファイル操作項目を組み立てる（React 原版 buildFileItems と同一分岐）。 */
  function buildFileItems(): HTMLElement[] {
    const fileHandlers = opts.fileHandlers;
    if (opts.hideFileOps || !fileHandlers) return [];
    const items: HTMLElement[] = [];

    if (externalSaveOnly) {
      items.push(
        buildItem({
          iconPath: PATH.save,
          label: t("saveFile"),
          disabled: readOnly || !hasFileHandle,
          onClick: () => fileHandlers.onSaveFile?.(),
        }),
      );
    } else if (supportsDirectAccess) {
      items.push(
        buildItem({
          iconPath: PATH.folderOpen,
          label: t("openFile"),
          onClick: () => fileHandlers.onOpenFile?.(),
        }),
        buildItem({
          iconPath: PATH.save,
          label: t("saveFile"),
          disabled: readOnly || !hasFileHandle,
          onClick: () => fileHandlers.onSaveFile?.(),
        }),
        buildItem({
          iconPath: PATH.saveAs,
          label: t("saveAsFile"),
          disabled: readOnly,
          onClick: () => fileHandlers.onSaveAsFile?.(),
        }),
      );
    } else {
      items.push(
        buildItem({
          iconPath: PATH.folderOpen,
          label: t("openFile"),
          onClick: () => fileHandlers.onImport(),
        }),
        buildItem({
          iconPath: PATH.saveAs,
          label: t("saveAsFile"),
          disabled: readOnly,
          onClick: () => fileHandlers.onDownload(),
        }),
      );
    }

    if (fileHandlers.onExportPdf) {
      items.push(
        buildItem({
          iconPath: PATH.pictureAsPdf,
          label: t("exportPdf"),
          disabled: opts.sourceMode || opts.inlineMergeOpen,
          onClick: () => fileHandlers.onExportPdf?.(),
        }),
      );
    }
    return items;
  }

  // --- children を React 原版と同順で組み立てる ---
  const children: HTMLElement[] = [];

  const fileItems = buildFileItems();
  children.push(...fileItems);
  if (fileItems.length > 0) children.push(createDivider().el);

  // outline。
  if (!opts.hideOutline) {
    children.push(
      buildItem({
        iconPath: PATH.listAlt,
        iconColor: activeIconColor(opts.outlineOpen),
        label: t("outline"),
        disabled: opts.inlineMergeOpen || opts.sourceMode,
        onClick: () => opts.onToggleOutline(),
      }),
    );
  }

  // comments。
  if (!opts.hideComments && opts.onToggleComments) {
    const onToggleComments = opts.onToggleComments;
    children.push(
      buildItem({
        iconPath: PATH.chatBubble,
        iconColor: activeIconColor(opts.commentOpen),
        label: t("commentPanel") || "Comments",
        disabled: opts.inlineMergeOpen || opts.sourceMode,
        onClick: () => onToggleComments(),
      }),
    );
  }

  // panel divider（React 原版は常時挿入）。
  children.push(createDivider().el);

  // settings。
  if (!opts.hideSettings && opts.onOpenSettings) {
    const onOpenSettings = opts.onOpenSettings;
    children.push(
      buildItem({
        iconPath: PATH.settings,
        label: t("editorSettings"),
        onClick: () => onOpenSettings(),
      }),
    );
  }

  // divider（React 原版は常時挿入）。
  children.push(createDivider().el);

  // versionInfo。
  if (!opts.hideVersionInfo) {
    children.push(
      buildItem({
        iconPath: PATH.infoOutlined,
        label: t("versionInfo"),
        onClick: () => opts.onOpenVersionDialog?.(),
      }),
    );
  }

  // createMenu を組み立てて自前マウント（= 開く）。anchorEl が null でも createMenu が virtual rect
  // (0,0) へフォールバックするためクラッシュしない。背景クリック / ESC / Tab で onClose が呼ばれる。
  const menuHandle = createMenu({
    anchorEl: opts.anchorEl,
    onClose,
    ariaLabel: t("more"),
    children,
  });

  let destroyed = false;
  return {
    el: menuHandle.el,
    menu: menuHandle.menu,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // MenuItem の listener を解除してから menu（backdrop / floating / focusTrap）を破棄する。
      for (const h of itemHandles) h.destroy();
      itemHandles.length = 0;
      menuHandle.destroy();
    },
  };
}
