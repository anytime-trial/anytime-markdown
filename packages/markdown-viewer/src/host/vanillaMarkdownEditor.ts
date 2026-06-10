/**
 * 脱React の vanilla markdown editor オーケストレーター（G3-1 / 追加のみ・本番未配線）。
 *
 * React の `MarkdownEditorPage.tsx`（756 行・15 hooks + useEditor + EditorContent + React chrome
 * sections）に対応する **vanilla 版**。`createVanillaEditorHost` で editor を mount し、
 * `installChrome` 内で `components-vanilla/*` のファクトリを合成して素 DOM で chrome を構築する。
 *
 * G3 計画（plan/20260610-g3-app-root-flip-spec.ja.md）の段階的 seam 戦略に基づく。consumer
 * （web-app / vscode webview）にはまだ配線しない。React フックの責務は **plain 関数 + closure 状態**
 * へ移している。
 *
 * 配線済み: editor mount / BubbleMenu / StatusBar / SlashCommand / **EditorToolbar（mode 状態 +
 * file ops + dialog/settings intent）/ EditorDialogs（comment/link/image insert）/ settings store +
 * EditorSettingsPanel**。
 * 未配線（TODO seam・次増分）: OutlinePanel / CommentPanel / MergeEditorPanel（データパネル・
 * レイアウト拡張）/ DialogHost 3（gif/image/table の overlay）/ editorProps（paste/drop）/
 * shortcuts。
 *
 * 依存方向: host → ui-vanilla / components-vanilla / markdown-core。React / markdown-react を
 * 一切 import しない（型含め core を使う・DEFAULT_SETTINGS は React 結合の useEditorSettings から
 * 引かず inline）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { buildEditorExtensions } from "../buildEditorExtensions";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import { getMarkdownFromEditor, type TranslationFn } from "../types";
import type { EditorSettings } from "../useEditorSettings";
import type { ThemePresetName } from "../constants/themePresets";
import type {
  ToolbarFileCapabilities,
  ToolbarFileHandlers,
  ToolbarModeHandlers,
  ToolbarModeState,
  ToolbarVisibility,
} from "../types/toolbar";
import { createVanillaEditorHost } from "./vanillaEditorHost";
import { createEditorBubbleMenu } from "../components-vanilla/EditorBubbleMenu";
import { createStatusBar } from "../components-vanilla/StatusBar";
import {
  createSlashCommandMenu,
  type VanillaSlashCommandItem,
} from "../components-vanilla/SlashCommandMenu";
import {
  createEditorToolbar,
  type CreateEditorToolbarOptions,
} from "../components-vanilla/EditorToolbar";
import { createEditorDialogs } from "../components-vanilla/EditorDialogs";
import { createEditorSettingsPanel } from "../components-vanilla/EditorSettingsPanel";
import { createOutlinePanel } from "../components-vanilla/OutlinePanel";
import { createCommentPanel } from "../components-vanilla/CommentPanel";

/** React 結合の useEditorSettings を import せず inline する既定設定（DEFAULT_SETTINGS と同値）。 */
const DEFAULT_SETTINGS: EditorSettings = {
  lineHeight: 1.6,
  fontSize: 16,
  tableWidth: "auto",
  editorBg: "white",
  lightBgColor: "",
  lightTextColor: "",
  darkBgColor: "",
  darkTextColor: "",
  spellCheck: false,
  paperSize: "off",
  paperMargin: 20,
  blockAlign: "left",
  wordBreak: "keep-all",
};

/** {@link mountVanillaMarkdownEditor} のオプション（MarkdownEditorPage props の vanilla サブセット）。 */
export interface MountVanillaMarkdownEditorOptions {
  t: TranslationFn;
  locale?: string;
  initialContent?: string;
  readOnly?: boolean;
  placeholder?: string;
  onContentChange?: (markdown: string) => void;
  slashItems?: readonly VanillaSlashCommandItem[];
  gridRows?: number;
  gridCols?: number;
  /** 初期設定（未指定時は DEFAULT_SETTINGS）。 */
  settings?: EditorSettings;
  /** 設定変更通知。 */
  onSettingsChange?: (settings: EditorSettings) => void;
  /** 設定リセット要求（未指定時は DEFAULT_SETTINGS に戻す）。 */
  onSettingsReset?: () => void;
  /** リセット確認（SettingsPanel）。未指定時は確認なし。 */
  confirm?: (message: string) => Promise<boolean>;
  /** ファイル操作（部分指定。未指定分は editor/blob ベースの既定実装）。 */
  fileHandlers?: Partial<ToolbarFileHandlers>;
  fileCapabilities?: ToolbarFileCapabilities;
  /** ツールバーの表示制御。 */
  hide?: ToolbarVisibility;
  /** テーマ（SettingsPanel のダークモード/プリセット/言語）。 */
  themeMode?: "light" | "dark";
  onThemeModeChange?: (mode: "light" | "dark") => void;
  presetName?: ThemePresetName;
  onPresetChange?: (name: ThemePresetName) => void;
  onLocaleChange?: (locale: string) => void;
  /** mode（source/readonly/review/outline/comment）変更通知。 */
  onModeChange?: (state: ToolbarModeState) => void;
}

/** {@link mountVanillaMarkdownEditor} の戻り値。 */
export interface VanillaMarkdownEditorHandle {
  readonly editor: Editor;
  readonly root: HTMLElement;
  destroy(): void;
}

function buildLayout(): {
  root: HTMLElement;
  toolbarSlot: HTMLElement;
  contentEl: HTMLElement;
  sidebarSlot: HTMLElement;
  statusBarSlot: HTMLElement;
} {
  const root = document.createElement("div");
  root.setAttribute("data-am-editor-root", "");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;";

  const toolbarSlot = document.createElement("div");
  toolbarSlot.setAttribute("data-am-toolbar-slot", "");
  toolbarSlot.style.flexShrink = "0";

  // content + sidebar を横並びにする行。
  const mainRow = document.createElement("div");
  mainRow.setAttribute("data-am-main-row", "");
  mainRow.style.cssText = "display:flex;flex:1 1 auto;min-height:0;";

  const contentEl = document.createElement("div");
  contentEl.setAttribute("data-am-content", "");
  contentEl.style.cssText = "flex:1 1 auto;min-height:0;overflow:auto;";

  // Outline / Comment パネルのマウント先（toggle で表示）。
  const sidebarSlot = document.createElement("div");
  sidebarSlot.setAttribute("data-am-sidebar-slot", "");
  sidebarSlot.style.cssText = "flex-shrink:0;display:flex;min-height:0;";

  mainRow.append(contentEl, sidebarSlot);

  const statusBarSlot = document.createElement("div");
  statusBarSlot.setAttribute("data-am-statusbar-slot", "");
  statusBarSlot.style.flexShrink = "0";

  root.append(toolbarSlot, mainRow, statusBarSlot);
  return { root, toolbarSlot, contentEl, sidebarSlot, statusBarSlot };
}

/**
 * settings を editor / root へ適用する（React useEditorSettingsSync 相当の素 DOM 版）。
 * 明確に正しい部分（spellcheck / editable / font-size CSS 変数）を反映する。paperSize/margin/
 * blockAlign/tableWidth の精密な反映は CSS 変数名の確定が要るため次増分で拡張する。
 */
function applyEditorSettings(
  editor: Editor,
  root: HTMLElement,
  settings: EditorSettings,
  readonlyMode: boolean,
): void {
  editor.view.dom.setAttribute("spellcheck", String(settings.spellCheck));
  editor.setEditable(!readonlyMode);
  // editor DOM が参照する CSS 変数 / data 属性へ反映（exact なセレクタ連携は本番 CSS と合わせる）。
  root.style.setProperty("--am-editor-font-size", `${settings.fontSize}px`);
  root.style.setProperty("--am-editor-line-height", String(settings.lineHeight));
  root.style.setProperty("--am-editor-word-break", settings.wordBreak);
  root.style.setProperty("--am-editor-table-width", settings.tableWidth);
  root.dataset.blockAlign = settings.blockAlign;
  root.dataset.paperSize = settings.paperSize;
  root.style.setProperty("--am-paper-margin", `${settings.paperMargin}mm`);
}

/**
 * vanilla で markdown editor + chrome を mount する。
 *
 * @param container エディタを描画する DOM 要素（呼び元が用意）。
 * @returns `editor` / `root` / `destroy`。consumer は unmount 時に `destroy()` を呼ぶ。
 */
export function mountVanillaMarkdownEditor(
  container: HTMLElement,
  options: MountVanillaMarkdownEditorOptions,
): VanillaMarkdownEditorHandle {
  const { t, readOnly = false } = options;
  const { root, toolbarSlot, contentEl, sidebarSlot, statusBarSlot } = buildLayout();
  container.appendChild(root);

  // SlashCommand: editor 拡張の onSlashStateChange → SlashCommandMenu の setCallback で受けた cb へ。
  let slashCb: ((state: SlashCommandState) => void) | null = null;

  const extensions = buildEditorExtensions({
    mode: "main",
    placeholder: options.placeholder ?? t("placeholder"),
    gridRows: options.gridRows,
    gridCols: options.gridCols,
    onSlashStateChange: (state: SlashCommandState) => slashCb?.(state),
  });

  const host = createVanillaEditorHost({
    element: contentEl,
    extensions,
    content: options.initialContent ?? "",
    autofocus: "start",
    editable: !readOnly,
    installChrome: (editor) => {
      const disposers: Array<() => void> = [];

      // === 状態（closure・React hooks の置換） =================================
      let settings: EditorSettings = options.settings ?? DEFAULT_SETTINGS;
      const modeState: ToolbarModeState = {
        sourceMode: false,
        readonlyMode: readOnly,
        reviewMode: false,
        outlineOpen: false,
        inlineMergeOpen: false,
        commentOpen: false,
        explorerOpen: false,
      };
      const readonlyNow = (): boolean => modeState.readonlyMode ?? readOnly;
      const notifyMode = (): void => options.onModeChange?.({ ...modeState });
      applyEditorSettings(editor, root, settings, readonlyNow());

      // === EditorDialogs（comment/link/image insert → editor コマンド） =========
      const dialogs = createEditorDialogs({
        t,
        onCommentInsert: (text) => editor.chain().focus().addComment(text.trim()).run(),
        onLinkInsert: (url) =>
          editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run(),
        onImageInsert: (src, alt) => editor.chain().focus().setImage({ src: src.trim(), alt }).run(),
      });
      disposers.push(() => dialogs.destroy());

      // === settings panel（intent で開閉。onUpdate→store+apply+notify） =========
      let settingsPanel: { destroy: () => void } | null = null;
      const closeSettings = (): void => {
        settingsPanel?.destroy();
        settingsPanel = null;
      };
      const openSettings = (): void => {
        closeSettings();
        settingsPanel = createEditorSettingsPanel({
          t,
          settings,
          locale: options.locale ?? "ja",
          confirm: options.confirm,
          themeMode: options.themeMode,
          onThemeModeChange: options.onThemeModeChange,
          presetName: options.presetName,
          onPresetChange: options.onPresetChange,
          onLocaleChange: options.onLocaleChange,
          onClose: closeSettings,
          onUpdate: (patch) => {
            settings = { ...settings, ...patch };
            applyEditorSettings(editor, root, settings, readonlyNow());
            options.onSettingsChange?.(settings);
          },
          onReset: () => {
            settings = { ...DEFAULT_SETTINGS };
            applyEditorSettings(editor, root, settings, readonlyNow());
            options.onSettingsReset?.();
            options.onSettingsChange?.(settings);
            closeSettings();
          },
        });
      };
      disposers.push(closeSettings);

      // === file handlers（opts 優先・未指定は editor/blob ベースの既定） =========
      const defaultDownload = (): void => {
        const md = getMarkdownFromEditor(editor);
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "untitled.md";
        a.click();
        URL.revokeObjectURL(url);
      };
      const defaultClear = (): void => {
        editor.chain().focus().clearContent(true).run();
      };
      const fileHandlers: ToolbarFileHandlers = {
        onDownload: options.fileHandlers?.onDownload ?? defaultDownload,
        onImport: options.fileHandlers?.onImport ?? (() => {}),
        onClear: options.fileHandlers?.onClear ?? defaultClear,
        onOpenFile: options.fileHandlers?.onOpenFile,
        onSaveFile: options.fileHandlers?.onSaveFile,
        onSaveAsFile: options.fileHandlers?.onSaveAsFile,
        onExportPdf: options.fileHandlers?.onExportPdf,
        onLoadRightFile: options.fileHandlers?.onLoadRightFile,
        onExportRightFile: options.fileHandlers?.onExportRightFile,
      };

      // === sidebar パネル（Outline / Comment）の toggle マウント ===============
      const OUTLINE_WIDTH = 240;
      let outlinePanel: { el: HTMLElement; destroy: () => void } | null = null;
      let commentPanel: { el: HTMLElement; destroy: () => void } | null = null;
      const syncOutlinePanel = (): void => {
        if (modeState.outlineOpen && !outlinePanel) {
          outlinePanel = createOutlinePanel({
            editor,
            t,
            outlineWidth: OUTLINE_WIDTH,
            editorHeight: contentEl.clientHeight || 600,
            onOutlineClick: (pos) => editor.chain().focus().setTextSelection(pos).run(),
            hideResize: true,
          });
          sidebarSlot.appendChild(outlinePanel.el);
        } else if (!modeState.outlineOpen && outlinePanel) {
          outlinePanel.destroy();
          outlinePanel.el.remove();
          outlinePanel = null;
        }
      };
      const syncCommentPanel = (): void => {
        if (modeState.commentOpen && !commentPanel) {
          commentPanel = createCommentPanel({ editor, t });
          sidebarSlot.appendChild(commentPanel.el);
        } else if (!modeState.commentOpen && commentPanel) {
          commentPanel.destroy();
          commentPanel.el.remove();
          commentPanel = null;
        }
      };
      disposers.push(() => {
        outlinePanel?.destroy();
        commentPanel?.destroy();
      });

      // === mode handlers（closure 状態を更新し toolbar を再描画） ===============
      let toolbar: ReturnType<typeof createEditorToolbar> | null = null;
      const refreshToolbarMode = (): void => {
        toolbar?.update({ modeState: { ...modeState } });
        syncOutlinePanel();
        syncCommentPanel();
        notifyMode();
      };
      const modeHandlers: ToolbarModeHandlers = {
        onSwitchToSource: () => {
          modeState.sourceMode = true;
          refreshToolbarMode();
        },
        onSwitchToWysiwyg: () => {
          modeState.sourceMode = false;
          refreshToolbarMode();
        },
        onSwitchToReview: () => {
          modeState.reviewMode = !modeState.reviewMode;
          refreshToolbarMode();
        },
        onSwitchToReadonly: () => {
          modeState.readonlyMode = !readonlyNow();
          editor.setEditable(!modeState.readonlyMode);
          refreshToolbarMode();
        },
        onToggleOutline: () => {
          modeState.outlineOpen = !modeState.outlineOpen;
          refreshToolbarMode();
        },
        onToggleComments: () => {
          modeState.commentOpen = !modeState.commentOpen;
          refreshToolbarMode();
        },
        onToggleExplorer: () => {
          modeState.explorerOpen = !modeState.explorerOpen;
          refreshToolbarMode();
        },
        // merge トグルは MergeEditorPanel 配線（次増分）まで no-op。
        onMerge: () => {},
      };

      // === EditorToolbar（toolbarSlot へ） =====================================
      const toolbarOptions: CreateEditorToolbarOptions = {
        editor,
        t,
        modeState,
        modeHandlers,
        fileHandlers,
        fileCapabilities: options.fileCapabilities,
        hide: options.hide,
        // help（version/shortcut/settings）は settings パネルを開く intent に暫定接続。
        onSetHelpAnchor: () => openSettings(),
      };
      toolbar = createEditorToolbar(toolbarOptions);
      toolbarSlot.appendChild(toolbar.el);
      disposers.push(() => toolbar?.destroy());

      // === BubbleMenu（onLink → dialog） =======================================
      const bubble = createEditorBubbleMenu(editor, {
        t,
        onLink: () => dialogs.openLink(),
        readonlyMode: readonlyNow(),
      });
      disposers.push(() => bubble.destroy());

      // === StatusBar ===========================================================
      const statusBar = createStatusBar({ editor, t });
      statusBarSlot.appendChild(statusBar.el);
      disposers.push(() => statusBar.destroy());

      // === SlashCommand ========================================================
      const slash = createSlashCommandMenu({
        editor,
        t,
        items: options.slashItems ?? [],
        setCallback: (cb: (state: SlashCommandState) => void) => {
          slashCb = cb;
        },
      });
      disposers.push(() => {
        slashCb = null;
        slash.destroy();
      });

      // === 内容変更通知 =========================================================
      if (options.onContentChange) {
        const onUpdate = (): void => options.onContentChange?.(getMarkdownFromEditor(editor));
        editor.on("update", onUpdate);
        disposers.push(() => editor.off("update", onUpdate));
      }

      // === shortcuts（editor.view.dom への keydown → intent） ===================
      // React useEditorShortcuts のコア部分。mod+S=保存 / mod+K=リンク / mod+Alt+O=outline。
      const onShortcutKeyDown = (e: KeyboardEvent): void => {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          (fileHandlers.onSaveFile ?? fileHandlers.onDownload)();
        } else if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          dialogs.openLink();
        } else if (e.altKey && (e.key === "o" || e.key === "O")) {
          e.preventDefault();
          modeHandlers.onToggleOutline();
        }
      };
      editor.view.dom.addEventListener("keydown", onShortcutKeyDown);
      disposers.push(() => editor.view.dom.removeEventListener("keydown", onShortcutKeyDown));

      // === 残 TODO seam（consumer データ依存 / 別大型 seam） =====================
      // - MergeEditorPanel（inlineMergeOpen + onMerge）: 比較対象コンテンツ（externalCompareContent）
      //   と merge state（useMergeMode 相当）を要するため consumer 統合時に配線する。
      // - DialogHost 3（gif/image/table overlay）: block 選択 → overlay/ダイアログの橋渡し。
      //   block chrome（chrome/gifBlockChrome 等）の installer を別途用意して合成する。
      // - editorProps（paste/import/drop の DOM handlers・createEditorDOMHandlers 相当）: editor 生成時
      //   オプションのため、editorRef/setHeadingMenu の closure ref パターンで別途配線する。

      return disposers;
    },
  });

  return {
    editor: host.editor,
    root,
    destroy() {
      host.destroy();
      root.remove();
    },
  };
}
