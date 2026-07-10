/**
 * 脱React の vanilla DOM メインツールバー「EditorToolbar」（framework-decoupling Phase 3）。
 *
 * React 原版 `components/EditorToolbar.tsx`（MUI Paper / IconButton / Divider / Tooltip /
 * ToggleButton(Group) 消費）の素 DOM 版。WAI-ARIA Toolbar パターン（roving tabindex の矢印キー
 * ナビゲーション）・ファイル操作・Undo/Redo・ビュー切替（outline / comments / explorer）・
 * モード切替（readonly / review / wysiwyg / source）・compare 切替・more メニューを素 DOM で構成する。
 *
 * 変換規約:
 * - React props → opts（editor / t / コールバック / flag）。戻り値は { el, update, destroy }。
 * - useIsDark は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従するため isDark 分岐は削除）。
 *   背景色は React 原版が isDark で固定色（DEFAULT_DARK_BG / DEFAULT_LIGHT_BG）を当てていたが、
 *   vanilla 版は `--am-color-bg-paper` / `--am-color-text-primary`（Paper の既定）に委ねる。
 * - useEditorState → `editor.on("transaction")` 購読で canUndo / canRedo を再評価し button を更新。
 * - 状態は closure 変数、cleanup（transaction listener / tooltip / toggle group）は destroy() で解放。
 *
 * 本 PoC は **追加のみ・本番未配線**（React 原版 components/EditorToolbar.tsx は変更しない）。
 * モバイル more メニュー（ToolbarMobileMenu）の Menu 部分は host 側 React に隔離する想定のため
 * 本 vanilla 版では more ボタン（intent 発火）までを担い、メニュー本体は移植しない（partial）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { modKey } from "../constants/shortcuts";
import { Z_TOOLBAR } from "../constants/zIndex";
import { SIDE_TOOLBAR_WIDTH } from "../constants/dimensions";
import type { TranslationFn } from "../types";
import type {
  ToolbarFileCapabilities,
  ToolbarFileHandlers,
  ToolbarModeHandlers,
  ToolbarModeState,
  ToolbarVisibility,
} from "../types/toolbar";
import {
  createIconButton,
  createPaper,
  createToggleButton,
  createToggleButtonGroup,
  createTooltip,
  ensureStyle,
  svgIcon,
} from "@anytime-markdown/ui-core";
import {
  ICON,
  mkDivider,
  mkSpacer,
} from "../chrome/vanillaToolbar";

// --- Material SVG path（ui/icons.tsx と同一）。vanillaToolbar.ICON に無いものを補う ---
const PATH = {
  undo: "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8",
  redo: "M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7z",
  github:
    "M12 1.27a11 11 0 00-3.48 21.46c.55.09.73-.28.73-.55v-1.84c-3.03.64-3.67-1.46-3.67-1.46-.55-1.29-1.28-1.65-1.28-1.65-.92-.65.1-.65.1-.65 1.1 0 1.73 1.1 1.73 1.1.92 1.65 2.57 1.2 3.21.92a2 2 0 01.64-1.47c-2.47-.27-5.04-1.19-5.04-5.5 0-1.1.46-2.1 1.2-2.84a3.76 3.76 0 010-2.93s.91-.28 3.11 1.1c1.8-.49 3.7-.49 5.5 0 2.1-1.38 3.02-1.1 3.02-1.1a3.76 3.76 0 010 2.93c.83.74 1.2 1.74 1.2 2.94 0 4.21-2.57 5.13-5.04 5.4.45.37.82.92.82 2.02v3.03c0 .27.1.64.73.55A11 11 0 0012 1.27",
  listAlt:
    "M19 5v14H5V5zm1.1-2H3.9c-.5 0-.9.4-.9.9v16.2c0 .4.4.9.9.9h16.2c.4 0 .9-.5.9-.9V3.9c0-.5-.5-.9-.9-.9M11 7h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6zM7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7z",
  chatBubble:
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H6l-2 2V4h16z",
  lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2M9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9zm9 14H6V10h12zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2",
  visibility:
    "M12 6c3.79 0 7.17 2.13 8.82 5.5C19.17 14.87 15.79 17 12 17s-7.17-2.13-8.82-5.5C4.83 8.13 8.21 6 12 6m0-2C7 4 2.73 7.11 1 11.5 2.73 15.89 7 19 12 19s9.27-3.11 11-7.5C21.27 7.11 17 4 12 4m0 5c1.38 0 2.5 1.12 2.5 2.5S13.38 14 12 14s-2.5-1.12-2.5-2.5S10.62 9 12 9m0-2c-2.48 0-4.5 2.02-4.5 4.5S9.52 16 12 16s4.5-2.02 4.5-4.5S14.48 7 12 7",
  editOutlined:
    "m14.06 9.02.92.92L5.92 19H5v-.92zM17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29m-3.6 3.19L3 17.25V21h3.75L17.81 9.94z",
  codeOutlined: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z",
  editNote:
    "M3 10h11v2H3zm0-2h11V6H3zm0 8h7v-2H3zm15.01-3.13.71-.71c.39-.39 1.02-.39 1.41 0l.71.71c.39.39.39 1.02 0 1.41l-.71.71zm-.71.71-5.3 5.3V21h2.12l5.3-5.3z",
  viewStream:
    "M3 17v-2c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v2c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2M3 7v2c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2",
  menu: "M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z",
  folderOpen:
    "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V8h16z",
  noteAdd:
    "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm2 14h-3v3h-2v-3H8v-2h3v-3h2v3h3zm-3-7V3.5L18.5 9z",
  save: "M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m3-10H5V5h10z",
  saveAs:
    "M21 12.4V7l-4-4H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h7.4zM15 15c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3M6 6h9v4H6zm13.99 10.25 1.77 1.77L16.77 23H15v-1.77zm3.26.26-.85.85-1.77-1.77.85-.85c.2-.2.51-.2.71 0l1.06 1.06c.2.2.2.52 0 .71",
  web:
    "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m-5 14H4v-4h11zm0-5H4V9h11zm5 5h-4V9h4z",
  pictureAsPdf:
    "M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5zm4-3H19v1h1.5V11H19v2h-1.5V7h3zM9 9.5h1v-1H9zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4zm10 5.5h1v-3h-1z",
} as const;

/** WAI-ARIA Toolbar パターン: 矢印キーでフォーカス移動するフォーカス可能要素のセレクタ。 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [role="button"]:not([disabled]), input:not([disabled])';

/** Key→action map for roving tabindex keyboard navigation（React 原版 KEY_ACTIONS と同一）。 */
const KEY_ACTIONS: Record<string, (items: HTMLElement[], current: number) => number> = {
  ArrowRight: (items, c) => (c < items.length - 1 ? c + 1 : 0),
  ArrowLeft: (items, c) => (c > 0 ? c - 1 : items.length - 1),
  Home: () => 0,
  End: (items) => items.length - 1,
};

/** ツールチップキー → ショートカットキー表示マッピング（React 原版 TOOLTIP_SHORTCUTS と同一）。 */
const TOOLTIP_SHORTCUTS: Record<string, string> = {
  undo: `${modKey}+Z`,
  redo: `${modKey}+Shift+Z`,
  createNew: `${modKey}+Alt+N`,
  copy: `${modKey}+Shift+C`,
  openFile: `${modKey}+O`,
  saveFile: `${modKey}+S`,
  saveAsFile: `${modKey}+Shift+S`,
  upload: `${modKey}+Alt+U`,
  download: `${modKey}+Alt+E`,
  templates: `${modKey}+Alt+P`,
  sourceMode: `${modKey}+Alt+S`,
  normalMode: `${modKey}+Alt+M`,
  compareMode: `${modKey}+Alt+M`,
  outline: `${modKey}+Alt+O`,
};

/** ツールチップにショートカットキーを付加（React 原版 tip() と同一）。 */
function tip(t: TranslationFn, key: string): string {
  const shortcut = TOOLTIP_SHORTCUTS[key];
  return shortcut ? `${t(key)}  (${shortcut})` : t(key);
}

/** merge ビューの undo/redo ハンドル（React 原版 InlineMergeView.MergeUndoRedo と同形）。 */
export interface MergeUndoRedo {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** {@link createEditorToolbar} のオプション（React `EditorToolbarProps` の vanilla 再現）。 */
export interface CreateEditorToolbarOptions {
  /** editor（null 可）。undo/redo 可否は editor.can() を transaction ごとに再評価する。 */
  editor: Editor | null;
  fileHandlers: ToolbarFileHandlers;
  fileCapabilities?: ToolbarFileCapabilities;
  /**
   * 未保存変更の有無。save ボタンは「保存が必要なとき（dirty=true）のみ」有効化する。
   * 既定 false（編集前は disabled）。dirty 変化のたびに {@link EditorToolbarHandle.update} で更新する。
   */
  isDirty?: boolean;
  modeState: ToolbarModeState;
  modeHandlers: ToolbarModeHandlers;
  mergeUndoRedo?: MergeUndoRedo | null;
  hide?: ToolbarVisibility;
  /**
   * 右端サイドツールバー（EditorSideToolbar）併用時 true。md+（min-width:900px）では
   * outline/comments/explorer トグルを CSS で隠す（旧 React Page の
   * hide.outline = sideToolbarVisibleEditable 相当・aria-label 重複の防止）。
   */
  sideToolbar?: boolean;
  /** more メニュー（ヘルプ / ハンバーガー）クリックの intent。anchor 要素を渡す。 */
  onSetHelpAnchor?: (el: HTMLElement) => void;
  /**
   * 「開く」ボタンのメニュー表示要求。`fileHandlers.onOpenFromDrive` が注入されている
   * ときのみ発火し、ボタン要素と選択肢のハンドラを渡す。
   */
  onSetOpenFileAnchor?: (
    el: HTMLElement,
    handlers: { onOpenLocal: () => void | Promise<void>; onOpenFromDrive: () => void | Promise<void> },
  ) => void;
  /**
   * 「保存」ボタンのメニュー表示要求。`fileHandlers.onSaveFile` と `onSaveAsFile` が
   * 揃っているときのみ発火する。`overwriteDisabled` は「上書き保存」項目の可否。
   */
  onSetSaveAnchor?: (
    el: HTMLElement,
    handlers: {
      onSaveFile: () => void | Promise<void>;
      onSaveAsFile: () => void | Promise<void>;
      onSaveToDrive?: () => void | Promise<void>;
      overwriteDisabled: boolean;
    },
  ) => void;
  /** モバイル more メニュー（ハンバーガー）クリックの intent（host 側 React Menu へ委譲）。 */
  onOpenMobileMenu?: (el: HTMLElement) => void;
  onHomeClick?: () => void;
  /** i18n。 */
  t: TranslationFn;
}

/** {@link createEditorToolbar} の戻り値。 */
interface EditorToolbarHandle {
  /** root の Paper 要素（role="toolbar"）。 */
  el: HTMLElement;
  /** 状態（modeState / mergeUndoRedo / editor 派生 state）を反映して再描画する。 */
  update: (next: Partial<CreateEditorToolbarOptions>) => void;
  /** transaction listener / tooltip / toggle group を解放する。 */
  destroy: () => void;
}

interface ToolbarEditorState {
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * editor から undo/redo 可否を計算する。transaction（=キーストロック）ごとに呼ばれるため、
 * 実際に消費する canUndo / canRedo のみを評価する（React 原版が持っていた diagram 派生は
 * 本 vanilla 版では未消費のため計算しない）。
 */
function selectToolbarEditorState(editor: Editor | null): ToolbarEditorState {
  return {
    canUndo: editor?.can().undo() ?? false,
    canRedo: editor?.can().redo() ?? false,
  };
}

/** アイコン span（inline-flex）に SVG を包む。Tooltip の reference として button へ入れる。 */
function iconSpan(path: string | readonly string[]): HTMLSpanElement {
  const span = document.createElement("span");
  span.style.cssText = "display:inline-flex;";
  span.appendChild(svgIcon(path, 20));
  return span;
}

/**
 * vanilla メインツールバーを生成する。
 *
 * 構成（左→右）: Home ロゴ / ファイル操作（ToolbarFileActions 相当） / Undo・Redo /
 * ビュー切替（explorer・outline・comments） / spacer / モード切替 / compare 切替 / more メニュー。
 *
 * 各 ToggleButton クリックは React 原版と同一の editor.chain() ロジック・コールバックを実行する。
 * undo/redo の可否は `editor.on("transaction")` 購読で再評価する（useEditorState 相当）。
 */
export function createEditorToolbar(
  opts: CreateEditorToolbarOptions,
): EditorToolbarHandle {
  let editor = opts.editor;
  const t = opts.t;
  let modeState = opts.modeState;
  const modeHandlers = opts.modeHandlers;
  let mergeUndoRedo = opts.mergeUndoRedo ?? null;
  let fileCapabilities = opts.fileCapabilities;
  // 未保存変更の有無（save ボタンの dirty ゲート）。update({ isDirty }) で追従する。
  let isDirty = opts.isDirty ?? false;
  // save ボタンの toggle ハンドル（dirty / fileCapabilities 変化で disabled を再評価するため保持）。
  let saveBtn: ReturnType<typeof createToggleButton> | null = null;
  /** 保存ボタンがメニュー化されているか（true なら disabled は readonly のみで再評価する）。 */
  let saveBtnIsMenu = false;
  const hide = opts.hide ?? {};
  // 旧 EditorToolbar.module.css parity: ビュー群/compare/More(desktop) は md 未満で非表示、
  // More(mobile) は md 以上で非表示。display は本スタイルが所有する（inline に置かない）。
  ensureStyle(
    "am-toolbar-responsive-style",
    "#md-editor-toolbar [data-desktop-contents] { display: none; }\n" +
      "#md-editor-toolbar [data-compare-toggle] { display: none; }\n" +
      "#md-editor-toolbar [data-more-desktop] { display: none; }\n" +
      "#md-editor-toolbar [data-more-mobile] { display: inline-flex; }\n" +
      // 狭幅（ハンバーガー表示時）はモード切替をアイコンのみにする（ラベル非表示）。
      "#md-editor-toolbar [data-mode-label] { display: none; }\n" +
      "@media (min-width: 900px) {\n" +
      "  #md-editor-toolbar [data-desktop-contents] { display: contents; }\n" +
      "  #md-editor-toolbar [data-compare-toggle] { display: inline-flex; }\n" +
      "  #md-editor-toolbar [data-more-desktop] { display: flex; justify-content: center; align-items: center; }\n" +
      "  #md-editor-toolbar [data-more-mobile] { display: none; }\n" +
      "  #md-editor-toolbar [data-mode-label] { display: inline; }\n" +
      "}",
  );
  // sideToolbar 併用時は md+ で outline/comments/explorer を CSS で隠す（旧 Page parity）。
  const sideCoupled = opts.sideToolbar ?? false;
  if (sideCoupled) {
    ensureStyle(
      "am-toolbar-side-coupled-style",
      "@media (min-width: 900px) { [data-am-side-coupled] { display: none !important; } }",
    );
  }
  const markSideCoupled = (el: HTMLElement): void => {
    if (sideCoupled) el.setAttribute("data-am-side-coupled", "");
  };
  const fileHandlers = opts.fileHandlers;

  let editorState = selectToolbarEditorState(editor);

  // cleanup 用の収集。
  const tooltips: Array<{ destroy: () => void }> = [];
  const toggleGroups: Array<{ destroy: () => void }> = [];
  let rovingIndex = 0;

  // --- root Paper（role="toolbar"） ---
  const { el: root } = createPaper({
    variant: "outlined",
    role: "toolbar",
    ariaLabel: t("editorToolbar"),
  });
  root.id = "md-editor-toolbar";
  // EditorToolbar.module.css .toolbar 相当のレイアウト。背景は Paper（--am-color-bg-paper）に委ねる。
  root.style.cssText +=
    "display:flex;align-items:center;flex-wrap:wrap;gap:4px;" +
    "padding:4px 0 4px 2px;min-height:44px;max-height:44px;" +
    "border-bottom-left-radius:0;border-bottom-right-radius:0;position:sticky;top:0;" +
    `z-index:${Z_TOOLBAR};`;
  if (!modeState.inlineMergeOpen) root.style.borderBottom = "none";

  // ツールチップ付き ToggleButton を生成する小 helper（reference に tooltip を装着して収集）。
  const withTooltip = (reference: HTMLElement, title: string): void => {
    tooltips.push(createTooltip({ reference, title }));
  };

  // --- Home ロゴ ---
  if (opts.onHomeClick) {
    const img = document.createElement("img");
    img.src = "/icons/icon-192x192.png";
    img.alt = "Anytime Markdown";
    img.width = 36;
    img.height = 36;
    img.style.display = "block";
    const homeBtn = createIconButton({
      size: "xs",
      ariaLabel: t("home"),
      children: img,
      onClick: () => opts.onHomeClick?.(),
    });
    withTooltip(homeBtn.el, t("home"));
    root.appendChild(homeBtn.el);
    const div = mkDivider();
    div.style.margin = "0 2px";
    root.appendChild(div);
  }

  // --- ファイル操作（ToolbarFileActions 相当） ---
  if (!hide.fileOps) {
    root.appendChild(buildFileActions());
  }

  // save ボタンの disabled 判定。readonly / ファイルハンドル無し / 未編集（dirty=false）のいずれかで無効。
  // 「保存が必要なときのみ有効」を満たすため dirty ゲートを最後に AND する。
  function saveDisabled(): boolean {
    return Boolean(modeState.readonlyMode) || !fileCapabilities?.hasFileHandle || !isDirty;
  }

  function buildFileActions(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:inline-flex;align-items:center;";
    const { supportsDirectAccess, externalSaveOnly } = fileCapabilities ?? {};
    const readonlyMode = modeState.readonlyMode;

    const group = createToggleButtonGroup({ size: "small", ariaLabel: t("fileActions") });
    group.el.style.height = "30px";
    toggleGroups.push(group);

    const addBtn = (
      opt: {
        value: string;
        ariaLabel: string;
        icon: string;
        tipTitle: string;
        disabled?: boolean;
        onClick: () => void;
      },
    ): ReturnType<typeof createToggleButton> => {
      const span = iconSpan(opt.icon);
      const btn = createToggleButton({
        value: opt.value,
        ariaLabel: opt.ariaLabel,
        disabled: opt.disabled,
        label: span,
        onClick: opt.onClick,
        className: "toggleBtn",
      });
      btn.el.style.padding = "2px 6px";
      withTooltip(span, opt.tipTitle);
      group.register(btn);
      return btn;
    };

    /**
     * 「開く」ボタンを追加する。`onOpenFromDrive` が注入されている場合のみメニュー化し、
     * ボタン自身を anchor として上位（EditorMenuPopovers）へ渡す。未注入のホスト
     * （VS Code 拡張など）では `onOpenLocal` を直接呼ぶ従来の挙動を保つ。
     *
     * メニュー化時のボタンはメニューを開くだけなのでツールチップにショートカットを出さない
     * （ショートカットは実際に動作するメニュー項目側に表示する）。
     */
    const addOpenBtn = (
      onOpenLocal: () => void | Promise<void>,
      tipTitle: string,
    ): ReturnType<typeof createToggleButton> => {
      const onOpenFromDrive = fileHandlers.onOpenFromDrive;
      const asMenu = Boolean(onOpenFromDrive && opts.onSetOpenFileAnchor);
      let btn: ReturnType<typeof createToggleButton>;
      btn = addBtn({
        value: "open",
        ariaLabel: t("openFile"),
        icon: PATH.folderOpen,
        tipTitle: asMenu ? t("openFile") : tipTitle,
        onClick: () => {
          if (asMenu && onOpenFromDrive) {
            opts.onSetOpenFileAnchor?.(btn.el, { onOpenLocal, onOpenFromDrive });
            return;
          }
          void onOpenLocal();
        },
      });
      if (asMenu) btn.el.setAttribute("aria-haspopup", "menu");
      return btn;
    };

    /**
     * 「新規作成」ボタンを追加する。open ボタンを出す分岐でのみ呼ぶ（open の直前に置く）。
     */
    const addNewFileBtn = (): void => {
      addBtn({
        value: "createNew",
        ariaLabel: t("createNew"),
        icon: PATH.noteAdd,
        tipTitle: tip(t, "createNew"),
        disabled: readonlyMode,
        onClick: () => void fileHandlers.onNewFile?.(),
      });
    };

    /**
     * 「保存」ボタンを追加する。`onSaveAsFile` があり `onSetSaveAnchor` が渡されている場合のみ
     * メニュー化する。メニュー化時はボタン自体を readonly でのみ無効化し、「上書き保存」の可否は
     * `overwriteDisabled` として項目側へ渡す（無効なボタンはメニューを開けないため）。
     *
     * メニュー化時のボタンは総称の「保存」を名乗り、ツールチップにショートカットを出さない
     * （ショートカットは実際に動作するメニュー項目側に表示する）。
     */
    const addSaveBtn = (tipTitle: string): ReturnType<typeof createToggleButton> => {
      const { onSaveFile, onSaveAsFile, onSaveToDrive } = fileHandlers;
      const asMenu = Boolean(onSaveFile && onSaveAsFile && opts.onSetSaveAnchor);
      let btn: ReturnType<typeof createToggleButton>;
      btn = addBtn({
        value: "save",
        ariaLabel: asMenu ? t("save") : t("saveFile"),
        icon: PATH.save,
        tipTitle: asMenu ? t("save") : tipTitle,
        disabled: asMenu ? readonlyMode : saveDisabled(),
        onClick: () => {
          if (asMenu && onSaveFile && onSaveAsFile) {
            opts.onSetSaveAnchor?.(btn.el, {
              onSaveFile,
              onSaveAsFile,
              onSaveToDrive,
              overwriteDisabled: saveDisabled(),
            });
            return;
          }
          void onSaveFile?.();
        },
      });
      saveBtnIsMenu = asMenu;
      if (asMenu) btn.el.setAttribute("aria-haspopup", "menu");
      return btn;
    };

    if (externalSaveOnly) {
      saveBtn = addBtn({
        value: "save",
        ariaLabel: t("saveFile"),
        icon: PATH.save,
        tipTitle: fileCapabilities?.hasFileHandle ? tip(t, "saveFile") : t("saveFileNoHandle"),
        disabled: saveDisabled(),
        onClick: () => fileHandlers.onSaveFile?.(),
      });
    } else if (supportsDirectAccess) {
      addNewFileBtn();
      addOpenBtn(() => fileHandlers.onOpenFile?.(), tip(t, "openFile"));
      const saveTip = fileCapabilities?.hasFileHandle ? tip(t, "saveFile") : t("saveFileNoHandle");
      saveBtn = addSaveBtn(saveTip);
      // saveAs はメニュー化時に「名前を付けて保存」項目へ統合されるため単独ボタンを出さない。
      if (!(fileHandlers.onSaveFile && fileHandlers.onSaveAsFile && opts.onSetSaveAnchor)) {
        addBtn({
          value: "saveAs",
          ariaLabel: t("saveAsFile"),
          icon: PATH.saveAs,
          tipTitle: tip(t, "saveAsFile"),
          disabled: readonlyMode,
          onClick: () => fileHandlers.onSaveAsFile?.(),
        });
      }
    } else {
      addNewFileBtn();
      addOpenBtn(() => fileHandlers.onImport(), t("openFile"));
      addBtn({
        value: "saveAs",
        ariaLabel: t("saveAsFile"),
        icon: PATH.saveAs,
        tipTitle: t("saveAsFile"),
        disabled: readonlyMode,
        onClick: () => fileHandlers.onDownload(),
      });
    }

    if (fileHandlers.onExportPdf) {
      addBtn({
        value: "exportPdf",
        ariaLabel: t("exportPdf"),
        icon: PATH.pictureAsPdf,
        tipTitle: t("exportPdf"),
        disabled: modeState.sourceMode || modeState.inlineMergeOpen,
        onClick: () => fileHandlers.onExportPdf?.(),
      });
    }
    if (fileHandlers.onWebImport) {
      addBtn({
        value: "webImport",
        ariaLabel: t("slashWebImport"),
        icon: PATH.web,
        tipTitle: t("slashWebImport"),
        disabled: readonlyMode,
        onClick: () => fileHandlers.onWebImport?.(),
      });
    }
    wrap.appendChild(group.el);

    // merge 比較中: 右ファイル読込ボタン。
    if (modeState.inlineMergeOpen && fileHandlers.onLoadRightFile) {
      const div = mkDivider();
      div.style.margin = "0 4px";
      wrap.appendChild(div);
      const rightGroup = createToggleButtonGroup({ size: "small", ariaLabel: t("mergeRight") });
      rightGroup.el.style.height = "30px";
      toggleGroups.push(rightGroup);
      const span = iconSpan(PATH.folderOpen);
      const btn = createToggleButton({
        value: "open",
        ariaLabel: t("loadCompareFile"),
        label: span,
        onClick: () => fileHandlers.onLoadRightFile?.(),
      });
      btn.el.style.padding = "2px 6px";
      withTooltip(span, t("mergeLoadFileRight"));
      rightGroup.register(btn);
      wrap.appendChild(rightGroup.el);
    }
    return wrap;
  }

  // --- Undo / Redo ---
  let undoBtn: ReturnType<typeof createToggleButton> | null = null;
  let redoBtn: ReturnType<typeof createToggleButton> | null = null;
  if (!hide.undoRedo) {
    const group = createToggleButtonGroup({
      size: "small",
      ariaLabel: `${t("undo")} / ${t("redo")}`,
    });
    group.el.style.height = "30px";
    toggleGroups.push(group);

    const undoSpan = iconSpan(PATH.undo);
    undoBtn = createToggleButton({
      value: "undo",
      ariaLabel: t("undo"),
      label: undoSpan,
      disabled: undoDisabled(),
      onClick: () =>
        mergeUndoRedo ? mergeUndoRedo.undo() : editor?.chain().focus().undo().run(),
    });
    undoBtn.el.style.padding = "2px 6px";
    withTooltip(undoSpan, tip(t, "undo"));
    group.register(undoBtn);

    const redoSpan = iconSpan(PATH.redo);
    redoBtn = createToggleButton({
      value: "redo",
      ariaLabel: t("redo"),
      label: redoSpan,
      disabled: redoDisabled(),
      onClick: () =>
        mergeUndoRedo ? mergeUndoRedo.redo() : editor?.chain().focus().redo().run(),
    });
    redoBtn.el.style.padding = "2px 6px";
    withTooltip(redoSpan, tip(t, "redo"));
    group.register(redoBtn);

    root.appendChild(group.el);
  }

  function undoDisabled(): boolean {
    return (
      !!modeState.readonlyMode ||
      !!modeState.reviewMode ||
      (mergeUndoRedo ? !mergeUndoRedo.canUndo : !editorState.canUndo)
    );
  }
  function redoDisabled(): boolean {
    return (
      !!modeState.readonlyMode ||
      !!modeState.reviewMode ||
      (mergeUndoRedo ? !mergeUndoRedo.canRedo : !editorState.canRedo)
    );
  }

  // --- ビュー切替（explorer / outline / comments） — md 以上で表示 ---
  const desktopViews = document.createElement("div");
  desktopViews.setAttribute("data-desktop-contents", "");
  {
    const group = createToggleButtonGroup({ size: "small", ariaLabel: t("view") });
    group.el.style.height = "30px";
    toggleGroups.push(group);

    if (!hide.explorer && modeHandlers.onToggleExplorer) {
      const span = iconSpan(PATH.github);
      const btn = createToggleButton({
        value: "explorer",
        selected: !!modeState.explorerOpen,
        ariaLabel: t("explorer"),
        label: span,
        onClick: () => modeHandlers.onToggleExplorer?.(),
      });
      btn.el.style.padding = "2px 6px";
      markSideCoupled(btn.el);
      withTooltip(span, t("explorer"));
      group.register(btn);
    }
    if (!hide.outline) {
      const span = iconSpan(PATH.listAlt);
      const btn = createToggleButton({
        value: "outline",
        selected: modeState.outlineOpen,
        disabled: modeState.sourceMode,
        ariaLabel: t("outline"),
        label: span,
        onClick: () => modeHandlers.onToggleOutline(),
      });
      btn.el.style.padding = "2px 6px";
      markSideCoupled(btn.el);
      withTooltip(span, tip(t, "outline"));
      group.register(btn);
    }
    if (!hide.comments && modeHandlers.onToggleComments) {
      const label = t("commentPanel") || "Comments";
      const span = iconSpan(PATH.chatBubble);
      const btn = createToggleButton({
        value: "comments",
        selected: !!modeState.commentOpen,
        disabled: modeState.sourceMode,
        ariaLabel: label,
        label: span,
        onClick: () => modeHandlers.onToggleComments?.(),
      });
      btn.el.style.padding = "2px 6px";
      markSideCoupled(btn.el);
      withTooltip(span, label);
      group.register(btn);
    }
    desktopViews.appendChild(group.el);
  }
  root.appendChild(desktopViews);

  // --- spacer（右寄せ） ---
  root.appendChild(mkSpacer());

  // --- モード切替（readonly / review / wysiwyg / source） ---
  let modeGroup: ReturnType<typeof createToggleButtonGroup> | null = null;
  if (!hide.modeToggle) {
    modeGroup = createToggleButtonGroup({
      variant: "pill",
      size: "small",
      value: currentMode(),
      ariaLabel: t("editMode"),
    });
    toggleGroups.push(modeGroup);

    const addModeBtn = (
      value: string,
      ariaLabel: string,
      icon: string,
      onClick: () => void,
    ): void => {
      const labelSpan = document.createElement("span");
      labelSpan.textContent = ariaLabel;
      // 旧 .modeLabel parity: 狭幅（<900px・ハンバーガー表示時）はアイコンのみにするため、
      // ラベルの表示制御を responsive スタイルシートに委ねる（インライン display は置かない）。
      labelSpan.setAttribute("data-mode-label", "");
      const iconEl = svgIcon(icon, 16);
      const btn = createToggleButton({
        value,
        ariaLabel,
        label: [iconEl, labelSpan],
        onClick,
      });
      modeGroup?.register(btn);
    };

    if (!hide.readonlyToggle && modeHandlers.onSwitchToReadonly) {
      addModeBtn("readonly", t("readonly"), PATH.lock, () =>
        modeHandlers.onSwitchToReadonly?.(),
      );
    }
    addModeBtn("review", t("review"), PATH.visibility, () =>
      modeHandlers.onSwitchToReview?.(),
    );
    addModeBtn("wysiwyg", t("wysiwyg"), PATH.editOutlined, () =>
      modeHandlers.onSwitchToWysiwyg(),
    );
    addModeBtn("source", t("source"), PATH.codeOutlined, () =>
      modeHandlers.onSwitchToSource(),
    );
    root.appendChild(modeGroup.el);
  }

  function currentMode(): string {
    if (modeState.readonlyMode) return "readonly";
    if (modeState.reviewMode) return "review";
    if (modeState.sourceMode) return "source";
    return "wysiwyg";
  }

  // --- compare 切替（md 以上） ---
  let compareGroup: ReturnType<typeof createToggleButtonGroup> | null = null;
  if (!hide.modeToggle && !hide.compareToggle) {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-compare-toggle", "");
    compareGroup = createToggleButtonGroup({
      variant: "pill",
      size: "small",
      value: modeState.inlineMergeOpen ? "compare" : "edit",
      ariaLabel: t("compareMode"),
    });
    toggleGroups.push(compareGroup);

    const editLabel = document.createElement("span");
    editLabel.textContent = t("normalMode");
    const editBtn = createToggleButton({
      value: "edit",
      ariaLabel: t("normalMode"),
      disabled: modeState.readonlyMode,
      label: [svgIcon(PATH.editNote, 16), editLabel],
      onClick: () => {
        if (modeState.inlineMergeOpen) modeHandlers.onMerge();
      },
    });
    compareGroup.register(editBtn);

    const compareLabel = document.createElement("span");
    compareLabel.textContent = t("compare");
    const compareIcon = svgIcon(PATH.viewStream, 16);
    compareIcon.style.transform = "rotate(90deg)";
    const compareBtn = createToggleButton({
      value: "compare",
      ariaLabel: t("compare"),
      disabled: modeState.readonlyMode,
      label: [compareIcon, compareLabel],
      onClick: () => {
        if (!modeState.inlineMergeOpen) modeHandlers.onMerge();
      },
    });
    compareGroup.register(compareBtn);

    wrapper.appendChild(compareGroup.el);
    root.appendChild(wrapper);
  }

  // --- more メニュー（desktop ヘルプ / mobile ハンバーガー） ---
  if (!hide.moreMenu) {
    // desktop: ヘルプアンカー。
    const desktopWrap = document.createElement("div");
    desktopWrap.setAttribute("data-more-desktop", "");
    desktopWrap.style.cssText =
      `width:${SIDE_TOOLBAR_WIDTH}px;flex-shrink:0;margin-left:auto;` +
      "border-left:1px solid var(--am-color-divider);";
    const helpBtn = createIconButton({
      size: "small",
      ariaLabel: t("more"),
      children: svgIcon(PATH.menu, 20),
      onClick: (e) => opts.onSetHelpAnchor?.(e.currentTarget as HTMLElement),
    });
    helpBtn.el.style.padding = "0";
    withTooltip(helpBtn.el, t("more"));
    desktopWrap.appendChild(helpBtn.el);
    // サイドツールバー併用時（≥900px）はサイドバーが outline/comment/settings/version を
    // 担い、desktop more（help popover）は全項目が重複するため隠す（mobile more は維持）。
    markSideCoupled(desktopWrap);
    root.appendChild(desktopWrap);

    // mobile: ハンバーガー（host 側 React Menu へ intent）。
    const mobileWrap = document.createElement("div");
    mobileWrap.setAttribute("data-more-mobile", "");
    const mobileBtn = createIconButton({
      size: "small",
      ariaLabel: t("more"),
      children: svgIcon(PATH.menu, 20),
      onClick: (e) => opts.onOpenMobileMenu?.(e.currentTarget as HTMLElement),
    });
    mobileBtn.el.style.padding = "0";
    mobileWrap.appendChild(mobileBtn.el);
    root.appendChild(mobileWrap);
  }

  // --- roving tabindex（WAI-ARIA Toolbar） ---
  const applyRovingTabindex = (activeIdx: number): void => {
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    items.forEach((item, i) => {
      item.setAttribute("tabindex", i === activeIdx ? "0" : "-1");
    });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (currentIndex === -1) return;
    const action = KEY_ACTIONS[e.key];
    if (!action) return;
    const nextIndex = action(items, currentIndex);
    e.preventDefault();
    items.forEach((item, i) => {
      item.setAttribute("tabindex", i === nextIndex ? "0" : "-1");
    });
    rovingIndex = nextIndex;
    items[nextIndex]?.focus();
  };
  root.addEventListener("keydown", onKeyDown);
  applyRovingTabindex(rovingIndex);

  // --- editor 派生 state の購読（useEditorState 相当） ---
  const refreshEditorState = (): void => {
    editorState = selectToolbarEditorState(editor);
    undoBtn?.update({ disabled: undoDisabled() });
    redoBtn?.update({ disabled: redoDisabled() });
  };
  const onTransaction = (): void => refreshEditorState();
  editor?.on("transaction", onTransaction);

  return {
    el: root,
    update(next: Partial<CreateEditorToolbarOptions>) {
      if (next.editor !== undefined && next.editor !== editor) {
        editor?.off("transaction", onTransaction);
        editor = next.editor;
        editor?.on("transaction", onTransaction);
      }
      if (next.modeState !== undefined) modeState = next.modeState;
      if (next.mergeUndoRedo !== undefined) mergeUndoRedo = next.mergeUndoRedo ?? null;
      if (next.isDirty !== undefined) isDirty = next.isDirty;
      // fileCapabilities の構造（externalSaveOnly / supportsDirectAccess）は構築時固定だが、
      // hasFileHandle はファイルを開く/保存で変化するため最新値を保持し disabled 再評価に使う。
      if (next.fileCapabilities !== undefined) fileCapabilities = next.fileCapabilities;
      // save ボタンの dirty / handle / readonly ゲートを再評価（編集→保存要、保存後→不要）。
      // メニュー化時はボタンを無効化するとメニュー自体を開けなくなるため readonly のみで判定する
      // （「上書き保存」項目の可否は onSetSaveAnchor の overwriteDisabled で都度渡す）。
      saveBtn?.update({ disabled: saveBtnIsMenu ? Boolean(modeState.readonlyMode) : saveDisabled() });

      // モード／compare の選択値を group へ反映。
      modeGroup?.setValue(currentMode());
      compareGroup?.setValue(modeState.inlineMergeOpen ? "compare" : "edit");
      // undo/redo 可否再評価（merge 切替・mode 切替で変わる）。
      refreshEditorState();
      // inline merge の有無で border 調整（React 原版と同条件）。
      root.style.borderBottom = modeState.inlineMergeOpen ? "" : "none";
    },
    destroy() {
      editor?.off("transaction", onTransaction);
      root.removeEventListener("keydown", onKeyDown);
      for (const tt of tooltips) tt.destroy();
      tooltips.length = 0;
      for (const g of toggleGroups) g.destroy();
      toggleGroups.length = 0;
    },
  };
}

// re-export（host から TOOLTIP_SHORTCUTS を参照したい場合のため）。
export { TOOLTIP_SHORTCUTS };
