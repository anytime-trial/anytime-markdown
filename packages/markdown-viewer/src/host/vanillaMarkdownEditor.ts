/**
 * 脱React の vanilla markdown editor オーケストレーター（G3）。
 *
 * React の `MarkdownEditorPage.tsx`（756 行・15 hooks + useEditor + EditorContent + React chrome
 * sections）に対応する **vanilla 版**。`createVanillaEditorHost` で editor を mount し、
 * `installChrome` 内で `components-vanilla/*` のファクトリを合成して素 DOM で chrome を構築する。
 *
 * G3 計画（plan/20260610-g3-app-root-flip-spec.ja.md / 20260610-vanilla-final-seams.ja.md）の
 * 段階的 seam 戦略に基づく。React フックの責務は **plain 関数 + closure 状態**へ移している。
 *
 * 配線済み: editor mount / BubbleMenu / StatusBar（onStatusChange / hidden）/ SlashCommand /
 * EditorToolbar / EditorDialogs / settings store + SettingsPanel / Outline・Comment sidebar /
 * SideToolbar / shortcuts / block overlay（gif/image/table）/ editorProps（paste/drop/click +
 * heading menu）/ ContextMenu / source・review・readonly mode / frontmatter（表示 + storage）/
 * 通知系（headings/comments/status/mode/compare）/ autoReload / VS Code カスタムイベント連携 /
 * live update（`handle.update`）。
 *
 * 依存方向: host → ui-vanilla / components-vanilla / markdown-core。React / markdown-react を
 * 一切 import しない（型含め core を使う・EditorSettings / DEFAULT_SETTINGS は React 非依存の
 * ../editorSettings から引く）。
 */

import type { AnyExtension, Editor } from "@anytime-markdown/markdown-core";

import { buildEditorExtensions } from "../buildEditorExtensions";
import { STORAGE_KEY_CONTENT } from "../constants/storageKeys";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import { createEditorDOMHandlers } from "../hooks/useEditorDOMEvents";
import { getEditorStorage, getMarkdownFromEditor, type HeadingItem, type TranslationFn } from "../types";
import { DEFAULT_SETTINGS, type EditorSettings } from "../editorSettings";
import type { ThemePresetName } from "../constants/themePresets";
import type {
  ToolbarFileCapabilities,
  ToolbarFileHandlers,
  ToolbarModeHandlers,
  ToolbarModeState,
  ToolbarVisibility,
} from "../types/toolbar";
import type { CommentInfo } from "../utils/commentNotifications";
import { installCommentNotifications } from "../utils/commentNotifications";
import { getMarkdownFromEditorSafe } from "../utils/markdownSerializer";
import type { FileSystemProvider } from "../types/fileSystem";
import { createFileOpsController } from "./fileOpsController";
import { prependFrontmatter, preprocessMarkdown } from "../utils/frontmatterHelpers";
import { setTrailingNewline } from "../utils/editorContentLoader";
import { EDITOR_CODE_VARS_CHANGED_EVENT } from "../utils/editorCodeCssVars";
import { createVanillaEditorHost } from "./vanillaEditorHost";
import {
  createAutoReloadController,
  installFrontmatterStorage,
  installHeadingsNotifier,
  installVSCodeContentSync,
  installVSCodeEditorEvents,
  installVSCodeModeEvents,
} from "./vanillaPageSeams";
import {
  createSourceModeController,
  type SourceModeController,
  type VanillaEditorMode,
} from "./sourceModeController";
import { installBlockOverlays } from "../chrome/installBlockOverlays";
import { injectEditorContentCss } from "../styles/editorContentCss";
import { getEditDialogBg, getEditorBg, getEditorText } from "../constants/colors";
import { calcPaperContentWidth } from "../constants/dimensions";
import {
  openTableEditDialog,
  type TableEditDialogHandle,
} from "../components-vanilla/TableEditDialog";
import { createEditorBubbleMenu } from "../components-vanilla/EditorBubbleMenu";
import { createStatusBar, type StatusInfo } from "../components-vanilla/StatusBar";
import {
  createFrontmatterBlock,
  type FrontmatterBlockHandle,
} from "../components-vanilla/FrontmatterBlock";
import {
  createSlashCommandMenu,
  type VanillaSlashCommandItem,
} from "../components-vanilla/SlashCommandMenu";
import { DEFAULT_SLASH_ITEMS } from "../components-vanilla/slashCommandItems";
import {
  createEditorToolbar,
  type CreateEditorToolbarOptions,
} from "../components-vanilla/EditorToolbar";
import {
  createViewerToolbar,
  type ViewerToolbarHandle,
} from "../components-vanilla/ViewerToolbar";
import { createEditorContextMenu } from "../components-vanilla/EditorContextMenu";
import {
  createInlineMergeView,
  type InlineMergeViewHandle,
} from "../components-vanilla/InlineMergeView";
import { createEditorDialogs } from "../components-vanilla/EditorDialogs";
import { createEditorMenuPopovers } from "../components-vanilla/EditorMenuPopovers";
import { createEditorSettingsPanel } from "../components-vanilla/EditorSettingsPanel";
import { createEditorSideToolbar } from "../components-vanilla/EditorSideToolbar";
import { createSearchReplaceBar } from "../components-vanilla/SearchReplaceBar";
import { createOutlinePanel } from "../components-vanilla/OutlinePanel";
import { createCommentPanel } from "../components-vanilla/CommentPanel";

/** 保存（onContentChange / localStorage）デバウンス（React useMarkdownEditor と同値）。 */
const SAVE_DEBOUNCE_MS = 500;

/**
 * ノート網パネルのスロット。ホストが所有する DOM 要素を右サイドバーに
 * 出し入れするだけのインターフェース。markdown-viewer は中身に関知しない。
 */
export interface NoteGraphSlot {
  /** サイドバーに差し込む、ホスト所有のパネル要素。 */
  element: HTMLElement;
  /** パネルが開いたとき（初回スキャン要求等に使う）。 */
  onOpen?: () => void;
  /** パネルが閉じたとき。 */
  onClose?: () => void;
  /**
   * ピン留め中か。true の間は他パネル（Outline/comment/explorer）を開いても
   * ノート網を自動で閉じず、共存表示する。
   */
  isPinned?: () => boolean;
}

/** {@link mountVanillaMarkdownEditor} のオプション（MarkdownEditorPage props の vanilla 対応）。 */
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
  /** rich codeblock 等の描画拡張（RichMarkdownEditorPage 相当の parity 用）。 */
  codeBlockExtension?: AnyExtension;
  /**
   * rich の codeblock chrome オーバーレイ installer（React 版 codeBlockOverlay の vanilla 対応）。
   * installChrome 中に呼ばれ、戻り値の dispose は destroy 時に呼ばれる。
   */
  codeBlockOverlayInstaller?: (editor: Editor) => () => void;
  /** 初期設定（未指定時は DEFAULT_SETTINGS）。 */
  settings?: EditorSettings;
  /** 設定変更通知。 */
  onSettingsChange?: (settings: EditorSettings) => void;
  /** 設定リセット要求（未指定時は DEFAULT_SETTINGS に戻す）。 */
  onSettingsReset?: () => void;
  /** リセット確認（SettingsPanel）。未指定時は確認なし。 */
  confirm?: (message: string) => Promise<boolean>;
  /** ファイル操作（部分指定。未指定分は fileSystemProvider / editor / blob ベースの既定実装）。 */
  fileHandlers?: Partial<ToolbarFileHandlers>;
  fileCapabilities?: ToolbarFileCapabilities;
  /** ローカル FS provider（React 経路の fileSystemProvider 相当・open/save/saveAs を既定配線）。 */
  fileSystemProvider?: FileSystemProvider | null;
  /** 外部保存（GitHub SSO 等）。指定時は保存がこちらを優先する。 */
  onExternalSave?: (content: string) => void;
  /** ツールバーの表示制御。 */
  hide?: ToolbarVisibility;
  /** ツールバー全体を描画しない（VS Code の hideToolbar 相当）。 */
  hideToolbar?: boolean;
  /**
   * 編集ツールバーの代わりに read-only ビュー用の最小ツールバー
   * （フォントサイズ −/＋ + dark/light 切替のみ）を描画する。`hideToolbar` より優先。
   * report 等の閲覧専用ビュー（anytime-markdown-view）向け。
   */
  viewerToolbar?: boolean;
  /** ステータスバーを描画しない（onStatusChange 通知は継続する）。 */
  hideStatusBar?: boolean;
  /** 右端の縦サイドツールバー（outline/comment/settings トグル）。 */
  sideToolbar?: boolean;
  /**
   * ノート網パネル（ホスト所有の右パネル）。指定時のみサイドツールバーに
   * ノート網アイコンが出る。markdown-viewer は描画内容を関知せず、`element`
   * をサイドバーにスロット表示し、開閉で `onOpen` / `onClose` を呼ぶだけ。
   * graph 描画・データ供給はホスト（VS Code 拡張 webview 等）が担う。
   */
  noteGraph?: NoteGraphSlot;
  /** readonly トグルをツールバーに表示する（React showReadonlyMode 相当・既定 false）。 */
  showReadonlyMode?: boolean;
  /** フロントマターブロックをエディタ上部に表示する。 */
  showFrontmatter?: boolean;
  /** スクロールなしで全体表示（MarkdownViewer 相当）。 */
  noScroll?: boolean;
  /** エディタ領域の高さを固定（px）。 */
  fixedEditorHeight?: number;
  /** ブロック配置の強制上書き。 */
  defaultBlockAlign?: "left" | "center" | "right";
  /** フォントサイズの強制上書き（px）。 */
  defaultFontSize?: number;
  /** フォントサイズの初期値（px）。初回のみ適用。 */
  initialFontSize?: number;
  /** 初期表示をソースモードにする。 */
  defaultSourceMode?: boolean;
  /** アウトラインパネルの初期表示。 */
  defaultOutlineOpen?: boolean;
  /** ノート網パネルの初期表示（ピン留め時に別ファイルでも開いた状態にする等）。 */
  defaultNoteGraphOpen?: boolean;
  /**
   * 下書きの localStorage 永続化（React useMarkdownEditor 相当・web-app 単独エディタ用）。
   * true 時は mount 時に保存済み下書きを initialContent より優先して読み込む。
   */
  persistDraft?: boolean;
  /** editor mode（source/review/readonly）の localStorage 永続化（既定 true）。 */
  persistModeState?: boolean;
  /** StatusBar に表示するファイル名。 */
  fileName?: string | null;
  /** テーマ（SettingsPanel のダークモード/プリセット/言語）。 */
  themeMode?: "light" | "dark";
  onThemeModeChange?: (mode: "light" | "dark") => void;
  presetName?: ThemePresetName;
  onPresetChange?: (name: ThemePresetName) => void;
  onLocaleChange?: (locale: string) => void;
  /** mode（source/readonly/review/outline/comment）変更通知。 */
  onModeChange?: (state: ToolbarModeState) => void;
  /** 見出し一覧の変更通知（VS Code アウトライン連携）。 */
  onHeadingsChange?: (headings: HeadingItem[]) => void;
  /** コメントの変更通知（VS Code コメントパネル連携）。 */
  onCommentsChange?: (comments: CommentInfo[]) => void;
  /** カーソル位置/文字数等の通知（hideStatusBar でも通知される）。 */
  onStatusChange?: (status: StatusInfo) => void;
  /** 比較（merge）モード開閉の通知。 */
  onCompareModeChange?: (active: boolean) => void;
  /** 外部から比較モードの右パネルにロードするコンテンツ（update で live 反映）。 */
  externalCompareContent?: string | null;
  /** 自動再読み込み（変更 gutter baseline + Alt+F5 ナビ・VS Code 用）。 */
  autoReload?: boolean;
  /**
   * VS Code postMessage ブリッジ（block overlay の保存フロー）。未指定時は `window.__vscode`、
   * `null` 明示で web 経路。
   */
  vscodeApi?: VsCodeApi | null;
  /**
   * table のグリッド編集 intent（vanilla スプレッドシート未提供のため React consumer が
   * SpreadsheetGrid を開く）。未指定時は inline ops のみ（列/行/整列/移動）でグリッド編集 no-op。
   */
  onTableEdit?: (args: { pos: number; setEditing: (editing: boolean) => void }) => void;
}

/** {@link VanillaMarkdownEditorHandle.update} が受け付ける live patch。 */
export type VanillaMarkdownEditorUpdatePatch = Partial<
  Pick<
    MountVanillaMarkdownEditorOptions,
    | "readOnly"
    | "autoReload"
    | "settings"
    | "fileName"
    | "externalCompareContent"
    | "themeMode"
    | "presetName"
  >
>;

/** {@link mountVanillaMarkdownEditor} の戻り値。 */
export interface VanillaMarkdownEditorHandle {
  readonly editor: Editor;
  readonly root: HTMLElement;
  /**
   * live props の反映（React の再 render 相当）。`initialContent` / `codeBlockExtension` /
   * `gridRows` / `gridCols` / `locale` / `defaultSourceMode` 等の生成時オプションは対象外で、
   * 変更時は consumer が destroy → 再 mount（React の key remount 相当）する。
   */
  update(patch: VanillaMarkdownEditorUpdatePatch): void;
  destroy(): void;
}

interface VanillaLayout {
  root: HTMLElement;
  toolbarSlot: HTMLElement;
  frontmatterEl: HTMLElement;
  contentEl: HTMLElement;
  editorMountEl: HTMLElement;
  mainRow: HTMLElement;
  sidebarSlot: HTMLElement;
  sideToolbarSlot: HTMLElement;
  statusBarSlot: HTMLElement;
  liveRegion: HTMLElement;
}

function buildLayout(): VanillaLayout {
  const root = document.createElement("div");
  root.setAttribute("data-am-editor-root", "");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;";

  const toolbarSlot = document.createElement("div");
  toolbarSlot.setAttribute("data-am-toolbar-slot", "");
  toolbarSlot.style.flexShrink = "0";

  // フロントマターブロックのマウントスロット（showFrontmatter 時のみ表示）。
  // 折りたたみ/編集/削除可能な FrontmatterBlock を後段でこの中へ append する。
  const frontmatterEl = document.createElement("div");
  frontmatterEl.setAttribute("data-am-frontmatter-slot", "");
  frontmatterEl.style.cssText = "display:none;flex-shrink:0;padding:8px 16px 0;";

  // content + sidebar を横並びにする行。
  const mainRow = document.createElement("div");
  mainRow.setAttribute("data-am-main-row", "");
  mainRow.style.cssText = "display:flex;flex:1 1 auto;min-height:0;";

  const contentEl = document.createElement("div");
  contentEl.setAttribute("data-am-content", "");
  // position:relative は SearchReplaceBar（absolute・右上）配置の基準。
  // min-width:0 は flex item の自動最小サイズ（min-width:auto）を無効化し、狭幅でも flex
  // コンテナ幅まで縮小可能にする。これがないと noScroll（overflow:visible）時に本文が
  // 折り返されず横にはみ出す（scroll モードは overflow:auto で自動最小サイズが 0 のため不要）。
  contentEl.style.cssText = "flex:1 1 auto;min-width:0;min-height:0;overflow:auto;position:relative;";

  // editor の実マウント先（React buildEditorPortalTarget 相当・display:contents）。
  // merge ビューの右パネルが editor.options.element ごと移設できるよう contentEl と分離する。
  const editorMountEl = document.createElement("div");
  editorMountEl.setAttribute("data-am-editor-mount", "");
  editorMountEl.style.display = "contents";
  contentEl.appendChild(editorMountEl);

  // Outline / Comment パネルのマウント先（toggle で表示）。
  const sidebarSlot = document.createElement("div");
  sidebarSlot.setAttribute("data-am-sidebar-slot", "");
  sidebarSlot.style.cssText = "flex-shrink:0;display:flex;min-height:0;";

  // 右端の縦サイドツールバー（sideToolbar オプション時）。
  const sideToolbarSlot = document.createElement("div");
  sideToolbarSlot.setAttribute("data-am-side-toolbar-slot", "");
  sideToolbarSlot.style.cssText = "flex-shrink:0;display:flex;min-height:0;";

  mainRow.append(contentEl, sidebarSlot, sideToolbarSlot);

  const statusBarSlot = document.createElement("div");
  statusBarSlot.setAttribute("data-am-statusbar-slot", "");
  statusBarSlot.style.flexShrink = "0";

  // aria-live（モード切替等のアナウンス・視覚非表示）。
  const liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;";

  root.append(toolbarSlot, frontmatterEl, mainRow, statusBarSlot, liveRegion);
  return {
    root,
    toolbarSlot,
    frontmatterEl,
    contentEl,
    editorMountEl,
    mainRow,
    sidebarSlot,
    sideToolbarSlot,
    statusBarSlot,
    liveRegion,
  };
}

/**
 * settings を editor / root へ適用する（React useEditorSettingsSync 相当の素 DOM 版）。
 */
function applyEditorSettings(
  editor: Editor,
  root: HTMLElement,
  settings: EditorSettings,
  readonlyMode: boolean,
): void {
  editor.view.dom.setAttribute("spellcheck", String(settings.spellCheck));
  editor.setEditable(!readonlyMode);
  root.style.setProperty("--am-editor-font-size", `${settings.fontSize}px`);
  root.style.setProperty("--am-editor-line-height", String(settings.lineHeight));
  root.style.setProperty("--am-editor-word-break", settings.wordBreak);
  root.style.setProperty("--am-editor-table-width", settings.tableWidth);
  root.dataset.blockAlign = settings.blockAlign;
  root.dataset.paperSize = settings.paperSize;
  root.dataset.tableWidth = settings.tableWidth;
  root.style.setProperty("--am-paper-margin", `${settings.paperMargin}mm`);
}

/** persistDraft 時の下書き読込（失敗時は initialContent へフォールバック）。 */
function loadDraft(initialContent: string): string {
  if (typeof localStorage === "undefined") return initialContent;
  try {
    return localStorage.getItem(STORAGE_KEY_CONTENT) ?? initialContent;
  } catch (error) {
    console.warn("[vanillaMarkdownEditor] localStorage read failed", error);
    return initialContent;
  }
}

/**
 * vanilla で markdown editor + chrome を mount する。
 *
 * @param container エディタを描画する DOM 要素（呼び元が用意）。
 * @returns `editor` / `root` / `update` / `destroy`。consumer は unmount 時に `destroy()` を呼ぶ。
 */
export function mountVanillaMarkdownEditor(
  container: HTMLElement,
  options: MountVanillaMarkdownEditorOptions,
): VanillaMarkdownEditorHandle {
  // live update 用の可変オプション（installChrome 内の closure は current を参照する）。
  const current: MountVanillaMarkdownEditorOptions = { ...options };
  const { t } = current;
  const layout = buildLayout();
  const {
    root,
    toolbarSlot,
    frontmatterEl,
    contentEl,
    editorMountEl,
    sidebarSlot,
    sideToolbarSlot,
    statusBarSlot,
  } = layout;
  if (current.noScroll) contentEl.style.overflow = "visible";
  if (current.fixedEditorHeight) {
    contentEl.style.flex = "0 0 auto";
    contentEl.style.height = `${current.fixedEditorHeight}px`;
  }
  container.appendChild(root);

  // === 初期コンテンツ前処理（React useMarkdownEditor + parseCommentData 相当） ==
  const raw = current.persistDraft
    ? loadDraft(current.initialContent ?? "")
    : (current.initialContent ?? "");
  const initialTrailingNewline = raw.endsWith("\n");
  const pre = preprocessMarkdown(raw);
  let frontmatter: string | null = pre.frontmatter;
  // FrontmatterBlock は editor 構築後に生成・マウントされる（onChange が保存を要するため）。
  let frontmatterBlock: FrontmatterBlockHandle | null = null;

  // スロット自体の表示は showFrontmatter で制御し、ブロックは frontmatter==null で自己非表示。
  const syncFrontmatterView = (): void => {
    frontmatterEl.style.display = current.showFrontmatter === true ? "" : "none";
  };
  const setFrontmatter = (value: string | null): void => {
    frontmatter = value;
    frontmatterBlock?.setValue(value);
  };
  syncFrontmatterView();

  // SlashCommand: editor 拡張の onSlashStateChange → SlashCommandMenu の setCallback で受けた cb へ。
  let slashCb: ((state: SlashCommandState) => void) | null = null;

  const extensions = buildEditorExtensions({
    mode: "main",
    placeholder: current.placeholder ?? t("placeholder"),
    gridRows: current.gridRows,
    gridCols: current.gridCols,
    codeBlockExtension: current.codeBlockExtension,
    onSlashStateChange: (state: SlashCommandState) => slashCb?.(state),
  });

  // installChrome 内で確定する live patch 適用関数（handle.update から呼ぶ）。
  let applyLivePatch: ((patch: VanillaMarkdownEditorUpdatePatch) => void) | null = null;

  const host = createVanillaEditorHost({
    element: editorMountEl,
    extensions,
    content: pre.body,
    autofocus: "start",
    editable: !(current.readOnly ?? false),
    installChrome: (editor) => {
      const disposers: Array<() => void> = [];

      // === 状態（closure・React hooks の置換） =================================
      let settings: EditorSettings = { ...(current.settings ?? DEFAULT_SETTINGS) };
      if (current.initialFontSize && settings.fontSize !== current.initialFontSize) {
        settings.fontSize = current.initialFontSize;
      }
      const effectiveSettings = (): EditorSettings => ({
        ...settings,
        ...(current.defaultFontSize ? { fontSize: current.defaultFontSize } : {}),
        ...(current.defaultBlockAlign ? { blockAlign: current.defaultBlockAlign } : {}),
      });
      const modeState: ToolbarModeState = {
        sourceMode: false,
        readonlyMode: current.readOnly ?? false,
        reviewMode: false,
        outlineOpen: current.defaultOutlineOpen ?? false,
        inlineMergeOpen: false,
        commentOpen: false,
        explorerOpen: false,
        noteGraphOpen: current.defaultNoteGraphOpen ?? false,
      };
      const readonlyNow = (): boolean => (current.readOnly ?? false) || modeState.readonlyMode === true;
      const notifyMode = (): void => current.onModeChange?.({ ...modeState });
      /**
       * rich codeblock（native content）が読む実行時 CSS 変数（CodeDialogHost 相当）。
       * documentElement でなく editor root へ書き、複数インスタンス間の後勝ち上書きを防ぐ
       * （カスタムプロパティは継承するため、NodeView は自身の要素の computed style から読める）。
       */
      const applyCodeCssVars = (): void => {
        root.style.setProperty("--am-editor-dark", current.themeMode === "dark" ? "1" : "0");
        root.style.setProperty("--am-code-font-size", `${effectiveSettings().fontSize}px`);
        root.style.setProperty("--am-code-line-height", `${effectiveSettings().lineHeight}`);
        // NodeView（rich codeblock）は構築時に変数を読めない（dom 未接続・本適用前）ため、
        // 適用完了を通知して isDark / fontSize 変化を再描画させる（mermaid ダーク色の回帰防止）。
        document.dispatchEvent(new CustomEvent(EDITOR_CODE_VARS_CHANGED_EVENT));
      };
      /**
       * コンテンツ装飾 CSS（styles/editorContentCss・旧 GlobalStyle 注入の置換）と、
       * その CSS が参照するテーマ × 設定依存の CSS 変数（背景・文字色・用紙幅）を適用する。
       */
      const applyContentCssVars = (): void => {
        const isDark = current.themeMode === "dark";
        const s = effectiveSettings();
        injectEditorContentCss(isDark);
        root.style.setProperty("--am-editor-text", getEditorText(isDark, s));
        const editorBg = getEditorBg(isDark, s);
        root.style.setProperty("--am-editor-bg", editorBg);
        // 用紙サイズ有効時は外側を少し暗く/明るくして用紙境界を示す（旧 getEditorPaperSx と同値）
        const paperBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
        root.style.setProperty("--am-editor-outer-bg", s.paperSize === "off" ? editorBg : paperBg);
        if (s.paperSize !== "off") {
          root.style.setProperty(
            "--am-paper-max-width",
            `${calcPaperContentWidth(s.paperSize, s.paperMargin)}px`,
          );
        }
      };
      const applyAllSettings = (): void => {
        applyEditorSettings(editor, root, effectiveSettings(), readonlyNow());
        applyCodeCssVars();
        applyContentCssVars();
      };
      applyAllSettings();
      setTrailingNewline(editor, initialTrailingNewline);
      if (pre.comments.size > 0) {
        editor.commands.initComments(pre.comments);
      }

      // === 保存（debounce + frontmatter prepend・React useMarkdownEditor 相当） ==
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const saveContent = (produce: () => string | null, withFrontmatter = true): void => {
        if (current.readOnly) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          // enqueue 後（debounce 中）に readOnly 化された保存は破棄する。
          if (current.readOnly) return;
          const resolved = produce();
          if (resolved == null) return;
          const toSave = withFrontmatter ? prependFrontmatter(resolved, frontmatter) : resolved;
          if (current.persistDraft && typeof localStorage !== "undefined") {
            try {
              localStorage.setItem(STORAGE_KEY_CONTENT, toSave);
            } catch (error) {
              console.warn("[vanillaMarkdownEditor] localStorage write failed", error);
            }
          }
          current.onContentChange?.(toSave);
        }, SAVE_DEBOUNCE_MS);
      };
      disposers.push(() => {
        if (saveTimer) clearTimeout(saveTimer);
      });
      const onEditorUpdate = (): void => saveContent(() => getMarkdownFromEditorSafe(editor));
      editor.on("update", onEditorUpdate);
      disposers.push(() => editor.off("update", onEditorUpdate));

      // === EditorDialogs（comment/link/image insert → editor コマンド） =========
      const dialogs = createEditorDialogs({
        t,
        onCommentInsert: (text) => editor.chain().focus().addComment(text.trim()).run(),
        onLinkInsert: (url) =>
          editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run(),
        onImageInsert: (src, alt) => editor.chain().focus().setImage({ src: src.trim(), alt }).run(),
      });
      disposers.push(() => dialogs.destroy());

      // BubbleMenu / SlashCommand が storage.commentDialog.open 経由でコメントダイアログを
      // 開く（React useEditorDialogs 相当の配線）。
      const editorStorage = getEditorStorage(editor);
      editorStorage.commentDialog ??= {};
      editorStorage.commentDialog.open = () => dialogs.openComment();
      disposers.push(() => {
        if (editorStorage.commentDialog) editorStorage.commentDialog.open = null;
      });

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
          settings: effectiveSettings(),
          locale: current.locale ?? "ja",
          confirm: current.confirm,
          themeMode: current.themeMode,
          onThemeModeChange: current.onThemeModeChange,
          presetName: current.presetName,
          onPresetChange: current.onPresetChange,
          onLocaleChange: current.onLocaleChange,
          onClose: closeSettings,
          onUpdate: (patch) => {
            settings = { ...settings, ...patch };
            applyAllSettings();
            current.onSettingsChange?.(settings);
          },
          onReset: () => {
            settings = { ...DEFAULT_SETTINGS };
            applyAllSettings();
            current.onSettingsReset?.();
            current.onSettingsChange?.(settings);
            closeSettings();
          },
        });
      };
      disposers.push(closeSettings);

      // === file ops（fileSystemProvider / onExternalSave / import / clear・React useFileSystem
      //     + useEditorFileOps の plain 版） ========================================
      const fileOps = createFileOpsController({
        editor,
        t,
        provider: current.fileSystemProvider,
        onExternalSave: current.onExternalSave
          ? (content) => current.onExternalSave?.(content)
          : undefined,
        confirm: current.confirm,
        getFrontmatter: () => frontmatter,
        setFrontmatter,
        getSourceMode: () => modeState.sourceMode === true,
        getSourceText: () => sourceController?.getSourceText() ?? "",
        setSourceText: (text) => sourceController?.setSourceText(text),
        onFileStateChange: ({ fileName, isDirty }) =>
          statusBar?.update({ fileName: fileName ?? current.fileName, isDirty }),
        notify: (key) => {
          layout.liveRegion.textContent = t(key);
        },
      });
      const onDirtyUpdate = (): void => fileOps.markDirty();
      editor.on("update", onDirtyUpdate);
      disposers.push(() => editor.off("update", onDirtyUpdate));

      // === FrontmatterBlock（折りたたみ/編集/削除可能・React FrontmatterBlock 相当） =====
      frontmatterBlock = createFrontmatterBlock({
        initial: frontmatter,
        readOnly: readonlyNow() || modeState.reviewMode === true,
        defaultCollapsed: true,
        t,
        confirm: current.confirm,
        onChange: (value) => {
          // ユーザー入力で textarea 側は既に更新済み。var を同期し本文と一緒に保存する
          // （prependFrontmatter は最新の frontmatter var を参照する）。block.setValue は
          // 呼ばない（入力ループ回避）。
          frontmatter = value;
          fileOps.markDirty();
          saveContent(() => getMarkdownFromEditorSafe(editor));
        },
      });
      layout.frontmatterEl.appendChild(frontmatterBlock.el);
      disposers.push(() => {
        frontmatterBlock?.destroy();
        frontmatterBlock = null;
      });

      // H-03: 未保存変更の beforeunload 警告（React useEditorSideEffects 相当）。
      const onBeforeUnload = (e: BeforeUnloadEvent): void => {
        if (fileOps.isDirty()) e.preventDefault();
      };
      globalThis.addEventListener("beforeunload", onBeforeUnload);
      disposers.push(() => globalThis.removeEventListener("beforeunload", onBeforeUnload));

      // === file handlers（opts 優先・未指定は fileOps / editor / blob ベースの既定） =
      const defaultDownload = (): void => {
        const md = fileOps.getFullMarkdown();
        const blob = new Blob([md], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileOps.getFileName() ?? "untitled.md";
        a.click();
        URL.revokeObjectURL(url);
      };
      // toolbar の import ボタン（引数なし）: ファイルピッカー → 確認付き取り込み。
      const defaultImportClick = (): void => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".md,.markdown,text/markdown,text/plain";
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (file) void fileOps.selectFile(file);
        });
        input.click();
      };
      const fileHandlers: ToolbarFileHandlers = {
        onDownload: current.fileHandlers?.onDownload ?? defaultDownload,
        onImport: current.fileHandlers?.onImport ?? defaultImportClick,
        onClear: current.fileHandlers?.onClear ?? (() => void fileOps.clearAll()),
        onOpenFile:
          current.fileHandlers?.onOpenFile ??
          (current.fileSystemProvider ? () => void fileOps.openFile() : undefined),
        onSaveFile:
          current.fileHandlers?.onSaveFile ??
          (current.fileSystemProvider || current.onExternalSave
            ? () => void fileOps.saveFile()
            : undefined),
        onSaveAsFile:
          current.fileHandlers?.onSaveAsFile ??
          (current.fileSystemProvider ? () => void fileOps.saveAsFile() : undefined),
        onExportPdf: current.fileHandlers?.onExportPdf,
        onLoadRightFile: current.fileHandlers?.onLoadRightFile,
        onExportRightFile: current.fileHandlers?.onExportRightFile,
      };
      const fileCapabilities: ToolbarFileCapabilities = current.fileCapabilities ?? {
        hasFileHandle: fileOps.hasFileHandle(),
        supportsDirectAccess: current.fileSystemProvider?.supportsDirectAccess ?? false,
        externalSaveOnly: !current.fileSystemProvider && !!current.onExternalSave,
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
      // ノート網パネル（ホスト所有 element のスロット表示。中身は関知しない）。
      let noteGraphMounted = false;
      const syncNoteGraphPanel = (): void => {
        const slot = current.noteGraph;
        if (!slot) return;
        if (modeState.noteGraphOpen && !noteGraphMounted) {
          sidebarSlot.appendChild(slot.element);
          noteGraphMounted = true;
          slot.onOpen?.();
        } else if (!modeState.noteGraphOpen && noteGraphMounted) {
          slot.element.remove();
          noteGraphMounted = false;
          slot.onClose?.();
        }
      };
      disposers.push(() => {
        outlinePanel?.destroy();
        commentPanel?.destroy();
        if (noteGraphMounted) {
          current.noteGraph?.element.remove();
          current.noteGraph?.onClose?.();
        }
      });

      // === merge（比較）モード state（useMergeMode 相当・パネルは syncMergeView） ==
      let compareFileContent: string | null = null;
      // update() 経由で最後に適用した externalCompareContent（遷移検知用。null=外部比較なし）。
      let lastExternalCompareContent: string | null = null;
      let editorMarkdown = "";
      let clearDiffTimer: ReturnType<typeof setTimeout> | null = null;
      const notifyCompareMode = (): void =>
        current.onCompareModeChange?.(modeState.inlineMergeOpen === true);
      // merge ビュー本体（InlineMergeView vanilla）の配線（実体は toolbar 構築後に代入）。
      let syncMergeView: () => void = () => {};
      let mergeView: InlineMergeViewHandle | null = null;
      const setInlineMergeOpen = (open: boolean): void => {
        if (modeState.inlineMergeOpen === open) return;
        modeState.inlineMergeOpen = open;
        if (!open) {
          if (clearDiffTimer) clearTimeout(clearDiffTimer);
          clearDiffTimer = setTimeout(() => {
            if (!editor.isDestroyed) editor.commands.clearDiffHighlight();
          }, 100);
        }
        syncMergeView();
        refreshToolbarMode();
        notifyCompareMode();
      };
      const applyExternalCompareContent = (content: string): void => {
        compareFileContent = content;
        if (!modeState.inlineMergeOpen) {
          if (!modeState.sourceMode) {
            editorMarkdown = getMarkdownFromEditorSafe(editor) ?? "";
          }
          setInlineMergeOpen(true);
        } else {
          syncMergeView();
        }
      };
      disposers.push(() => {
        if (clearDiffTimer) clearTimeout(clearDiffTimer);
      });
      // VS Code からの比較ロード/解除（useMergeMode のカスタムイベント相当）。
      const onLoadCompareFile = (e: Event): void => {
        const content = (e as CustomEvent<string>).detail;
        if (typeof content === "string") applyExternalCompareContent(content);
      };
      const onExitCompareMode = (): void => setInlineMergeOpen(false);
      globalThis.addEventListener("vscode-load-compare-file", onLoadCompareFile);
      globalThis.addEventListener("vscode-exit-compare-mode", onExitCompareMode);
      disposers.push(() => {
        globalThis.removeEventListener("vscode-load-compare-file", onLoadCompareFile);
        globalThis.removeEventListener("vscode-exit-compare-mode", onExitCompareMode);
      });

      // === mode handlers（sourceModeController + closure 状態 + toolbar 再描画） ==
      let toolbar: ReturnType<typeof createEditorToolbar> | null = null;
      let viewerToolbar: ViewerToolbarHandle | null = null;
      let sideToolbarHandle: ReturnType<typeof createEditorSideToolbar> | null = null;
      let contextMenu: ReturnType<typeof createEditorContextMenu> | null = null;
      let statusBar: ReturnType<typeof createStatusBar> | null = null;
      let sourceController: SourceModeController | null = null;
      const currentContextMode = (): "review" | "wysiwyg" | "source" => {
        if (modeState.reviewMode) return "review";
        if (modeState.sourceMode) return "source";
        return "wysiwyg";
      };
      const refreshToolbarMode = (): void => {
        toolbar?.update({ modeState: { ...modeState } });
        sideToolbarHandle?.update({
          sourceMode: modeState.sourceMode,
          outlineOpen: modeState.outlineOpen,
          commentOpen: modeState.commentOpen,
          explorerOpen: modeState.explorerOpen,
          noteGraphOpen: modeState.noteGraphOpen,
        });
        contextMenu?.update({
          readOnly: readonlyNow() || modeState.reviewMode === true,
          currentMode: currentContextMode(),
          sourceTextarea: sourceController?.getTextarea() ?? null,
        });
        statusBar?.update({
          sourceMode: modeState.sourceMode,
          sourceText: sourceController?.getSourceText(),
        });
        frontmatterBlock?.setReadOnly(readonlyNow() || modeState.reviewMode === true);
        syncOutlinePanel();
        syncCommentPanel();
        syncNoteGraphPanel();
        notifyMode();
      };

      sourceController = createSourceModeController({
        editor,
        contentEl,
        t,
        getFrontmatter: () => frontmatter,
        setFrontmatter,
        onSourceSave: (md) => saveContent(() => md, false),
        onModeApplied: (mode: VanillaEditorMode) => {
          modeState.sourceMode = mode === "source";
          modeState.reviewMode = mode === "review";
          modeState.readonlyMode = mode === "readonly" || (current.readOnly ?? false);
          editor.setEditable(!readonlyNow() && mode !== "review");
          refreshToolbarMode();
        },
        announce: (message) => {
          layout.liveRegion.textContent = message;
        },
        defaultSourceMode: current.defaultSourceMode,
        persistMode: current.persistModeState,
      });
      disposers.push(() => sourceController?.destroy());

      const noteGraphPinned = (): boolean => current.noteGraph?.isPinned?.() ?? false;

      const modeHandlers: ToolbarModeHandlers = {
        onSwitchToSource: () => sourceController?.switchTo("source"),
        onSwitchToWysiwyg: () => sourceController?.switchTo("wysiwyg"),
        onSwitchToReview: () =>
          sourceController?.switchTo(modeState.reviewMode ? "wysiwyg" : "review"),
        onSwitchToReadonly: () =>
          sourceController?.switchTo(modeState.readonlyMode ? "wysiwyg" : "readonly"),
        onToggleOutline: () => {
          // 排他: 開くときノート網パネルを閉じる（キーボード経路でも一貫）。
          // ただしピン留め中は閉じず共存させる。
          if (!modeState.outlineOpen && !noteGraphPinned()) modeState.noteGraphOpen = false;
          modeState.outlineOpen = !modeState.outlineOpen;
          refreshToolbarMode();
        },
        onToggleComments: () => {
          if (!modeState.commentOpen && !noteGraphPinned()) modeState.noteGraphOpen = false;
          modeState.commentOpen = !modeState.commentOpen;
          refreshToolbarMode();
        },
        onToggleExplorer: () => {
          if (!modeState.explorerOpen && !noteGraphPinned()) modeState.noteGraphOpen = false;
          modeState.explorerOpen = !modeState.explorerOpen;
          refreshToolbarMode();
        },
        onToggleNoteGraph: () => {
          const opening = !modeState.noteGraphOpen;
          modeState.noteGraphOpen = opening;
          // 排他: 開くとき他のサイドバーパネルを閉じる（ピン留め中は共存させる）
          if (opening && !noteGraphPinned()) {
            modeState.outlineOpen = false;
            modeState.commentOpen = false;
            modeState.explorerOpen = false;
          }
          refreshToolbarMode();
        },
        onMerge: () => {
          if (!modeState.inlineMergeOpen && !modeState.sourceMode) {
            editorMarkdown = getMarkdownFromEditorSafe(editor) ?? "";
          }
          setInlineMergeOpen(!modeState.inlineMergeOpen);
        },
      };

      // === ViewerToolbar（read-only ビュー用・編集ツールバーより優先） ==========
      if (current.viewerToolbar) {
        // フォントサイズは settings.fontSize（既存 settings 配線を再利用）。bounds は
        // SettingsPanel スライダーと同一（12〜24）。テーマは onThemeModeChange へ委譲。
        const FONT_MIN = 12;
        const FONT_MAX = 24;
        viewerToolbar = createViewerToolbar({
          t,
          themeMode: current.themeMode ?? "light",
          onFontDelta: (delta) => {
            const next = Math.min(FONT_MAX, Math.max(FONT_MIN, effectiveSettings().fontSize + delta));
            if (next === settings.fontSize) return;
            settings = { ...settings, fontSize: next };
            applyAllSettings();
            current.onSettingsChange?.(settings);
          },
          onToggleTheme: () =>
            current.onThemeModeChange?.(current.themeMode === "dark" ? "light" : "dark"),
        });
        toolbarSlot.appendChild(viewerToolbar.el);
        disposers.push(() => viewerToolbar?.destroy());
      }

      // === EditorToolbar（toolbarSlot へ・hideToolbar / viewerToolbar で抑止） ====
      else if (!current.hideToolbar) {
        const toolbarOptions: CreateEditorToolbarOptions = {
          editor,
          t,
          modeState,
          modeHandlers,
          fileHandlers,
          fileCapabilities,
          hide: {
            ...current.hide,
            readonlyToggle:
              current.hide?.readonlyToggle ?? !(current.showReadonlyMode ?? false),
          },
          // sideToolbar 併用時、md+ では toolbar 側の outline/comments/explorer を CSS で隠す
          // （旧 React Page parity・aria-label 重複の防止）。
          sideToolbar: current.sideToolbar ?? false,
          // help ボタンはヘルプポップオーバー（outline/comment/settings/version メニュー）を開く。
          // menuPopovers は後段で生成されるが、クリック時には初期化済み（TDZ は実行順で解消）。
          onSetHelpAnchor: (el) => menuPopovers.openHelp(el),
        };
        toolbar = createEditorToolbar(toolbarOptions);
        toolbarSlot.appendChild(toolbar.el);
        disposers.push(() => toolbar?.destroy());
      }

      // === SideToolbar（右端縦・outline/comment/settings） ======================
      if (current.sideToolbar) {
        sideToolbarHandle = createEditorSideToolbar({
          t,
          sourceMode: modeState.sourceMode,
          outlineOpen: modeState.outlineOpen,
          commentOpen: modeState.commentOpen,
          noteGraphOpen: modeState.noteGraphOpen,
          onToggleOutline: modeHandlers.onToggleOutline,
          onToggleComment: (open) => {
            modeState.commentOpen = open;
            refreshToolbarMode();
          },
          // ノート網パネルが提供されている場合のみアイコンを出す
          onToggleNoteGraph: current.noteGraph ? modeHandlers.onToggleNoteGraph : undefined,
          onOpenSettings: current.hide?.settings ? undefined : openSettings,
        });
        sideToolbarSlot.appendChild(sideToolbarHandle.el);
        disposers.push(() => sideToolbarHandle?.destroy());
      }

      // === BubbleMenu（onLink → dialog・readOnly 変更時は remake） ==============
      let bubble = createEditorBubbleMenu(editor, {
        t,
        onLink: () => dialogs.openLink(),
        readonlyMode: readonlyNow(),
      });
      const remakeBubble = (): void => {
        bubble.destroy();
        bubble = createEditorBubbleMenu(editor, {
          t,
          onLink: () => dialogs.openLink(),
          readonlyMode: readonlyNow(),
        });
      };
      disposers.push(() => bubble.destroy());

      // === StatusBar（hidden でも onStatusChange は通知される） =================
      statusBar = createStatusBar({
        editor,
        t,
        fileName: current.fileName ?? fileOps.getFileName(),
        onStatusChange: current.onStatusChange,
        hidden: current.hideStatusBar,
        getSourceTextarea: () => sourceController?.getTextarea() ?? null,
      });
      statusBarSlot.appendChild(statusBar.el);
      disposers.push(() => statusBar?.destroy());

      // === SearchReplaceBar（Mod-f / openSearch コマンドで表示） ================
      const searchBar = createSearchReplaceBar({ editor, t });
      contentEl.appendChild(searchBar.el);
      disposers.push(() => searchBar.destroy());

      // === SlashCommand ========================================================
      const slash = createSlashCommandMenu({
        editor,
        t,
        items: current.slashItems ?? DEFAULT_SLASH_ITEMS,
        setCallback: (cb: (state: SlashCommandState) => void) => {
          slashCb = cb;
        },
      });
      disposers.push(() => {
        slashCb = null;
        slash.destroy();
      });

      // === merge ビュー実体（InlineMergeView vanilla・syncMergeView へ代入） =====
      const mergeEditorContent = (): string =>
        modeState.sourceMode
          ? (sourceController?.getSourceText() ?? "")
          : editorMarkdown;
      syncMergeView = (): void => {
        if (modeState.inlineMergeOpen && !mergeView) {
          // WYSIWYG では右パネルが editorMountEl（editor.options.element）ごと自分の中へ移設する。
          // source モードは textarea diff のため textarea を隠すのみ。
          const sourceTa = sourceController?.getTextarea();
          if (sourceTa) sourceTa.style.display = "none";
          mergeView = createInlineMergeView({
            editor,
            t,
            settings: {
              fontSize: effectiveSettings().fontSize,
              lineHeight: effectiveSettings().lineHeight,
            },
            sourceMode: modeState.sourceMode === true,
            editorContent: mergeEditorContent(),
            codeBlockExtension: current.codeBlockExtension,
            compareContent: compareFileContent,
            onCompareContentConsumed: () => {
              compareFileContent = null;
            },
            onEditTextChange: (text) => {
              if (modeState.sourceMode) sourceController?.setSourceText(text);
              saveContent(() => text, false);
            },
            onUndoRedoChange: (handle) => toolbar?.update({ mergeUndoRedo: handle }),
          });
          contentEl.appendChild(mergeView.el);
        } else if (modeState.inlineMergeOpen && mergeView) {
          mergeView.update({
            sourceMode: modeState.sourceMode === true,
            editorContent: mergeEditorContent(),
            compareContent: compareFileContent,
          });
        } else if (!modeState.inlineMergeOpen && mergeView) {
          mergeView.destroy();
          mergeView.el.remove();
          mergeView = null;
          toolbar?.update({ mergeUndoRedo: null });
          // editorMountEl は merge 右パネル内に移設されている場合があるため contentEl へ戻す。
          if (editorMountEl.parentElement !== contentEl) {
            contentEl.appendChild(editorMountEl);
          }
          // source モードなら textarea を復帰する。
          const sourceTa = sourceController?.getTextarea();
          if (modeState.sourceMode && sourceTa) {
            sourceTa.style.display = "";
          }
        }
      };
      disposers.push(() => {
        mergeView?.destroy();
        mergeView?.el.remove();
        mergeView = null;
      });

      // === editorProps（paste/drop/click/clipboard + heading menu） =============
      // React の useRef を plain { current } で置換（構造的互換）。
      const menuPopovers = createEditorMenuPopovers({
        editor,
        t,
        locale: current.locale ?? "ja",
        onToggleOutline: modeHandlers.onToggleOutline,
        onToggleComments: modeHandlers.onToggleComments,
        onOpenSettings: current.hide?.settings ? undefined : openSettings,
        // バージョン情報メニュー項目 → バージョンダイアログ起動（vanilla 移植時の配線漏れ修正。
        // 未接続だと項目は出るがクリックしても onOpenVersionDialog が undefined で何も起きない）。
        onOpenVersionDialog: () => dialogs.openVersion(),
        outlineOpen: modeState.outlineOpen,
        commentOpen: modeState.commentOpen,
      });
      disposers.push(() => menuPopovers.destroy());
      const editorPlainRef = { current: editor as Editor | null };
      // .md ドロップ時の取り込み（React handleImportRef.current = handleFileSelected 相当）。
      const importPlainRef = {
        current: (file: File, nativeHandle?: FileSystemFileHandle) =>
          void fileOps.selectFile(file, nativeHandle),
      };
      const fileDragOverPlainRef = {
        current: (over: boolean): void => {
          if (over) {
            root.dataset.fileDragOver = "true";
          } else {
            delete root.dataset.fileDragOver;
          }
        },
      };
      const domHandlers = createEditorDOMHandlers({
        editorRef: editorPlainRef,
        handleImportRef: importPlainRef,
        onFileDragOverRef: fileDragOverPlainRef,
        saveContent: (md) => saveContent(() => md, false),
        setHeadingMenu: (menu) => menuPopovers.openHeading(menu),
      });
      editor.setOptions({ editorProps: domHandlers });
      disposers.push(() => {
        editorPlainRef.current = null;
      });

      // === ContextMenu（右クリック・mode 切替 / クリップボード） ================
      contextMenu = createEditorContextMenu({
        editor,
        readOnly: readonlyNow(),
        t,
        currentMode: currentContextMode(),
        onSwitchToReview: modeHandlers.onSwitchToReview,
        onSwitchToWysiwyg: modeHandlers.onSwitchToWysiwyg,
        onSwitchToSource: modeHandlers.onSwitchToSource,
        extraContainer: contentEl,
        sourceTextarea: sourceController.getTextarea(),
        vscodeApi: current.vscodeApi,
      });
      disposers.push(() => contextMenu?.destroy());

      // === 通知系 seam（headings / comments / frontmatter storage） =============
      if (current.onHeadingsChange) {
        disposers.push(
          installHeadingsNotifier(editor, (h) => current.onHeadingsChange?.(h)),
        );
      }
      if (current.onCommentsChange) {
        disposers.push(
          installCommentNotifications(editor, (c) => current.onCommentsChange?.(c)),
        );
      }
      disposers.push(installFrontmatterStorage(editor, () => frontmatter, setFrontmatter));
      // スラッシュコマンド（/frontmatter）が折りたたみ状態でも展開してフォーカスできるよう、
      // storage.frontmatter に focusEditor を生やす（installFrontmatterStorage の get/set に追加）。
      {
        const fmStorage = editorStorage.frontmatter as
          | { focusEditor?: () => void }
          | undefined;
        if (fmStorage) fmStorage.focusEditor = () => frontmatterBlock?.expandAndFocus();
      }

      // === autoReload（変更 gutter baseline + Alt+F5 ナビ） =====================
      const autoReloadController = createAutoReloadController(editor);
      // React は autoReload 未指定でも clear を実行するが、changeGutter コマンド未登録の
      // 拡張構成（テスト等）を考慮し、明示指定時のみ反映する。
      if (current.autoReload !== undefined) autoReloadController.set(current.autoReload);
      disposers.push(() => autoReloadController.dispose());

      // === VS Code カスタムイベント連携 =========================================
      disposers.push(installVSCodeEditorEvents(editor));
      disposers.push(
        installVSCodeModeEvents({
          review: () => sourceController?.switchTo("review"),
          source: () => sourceController?.switchTo("source"),
          wysiwyg: () => sourceController?.switchTo("wysiwyg"),
        }),
      );
      disposers.push(
        installVSCodeContentSync(editor, {
          getSourceMode: () => modeState.sourceMode === true,
          setSourceText: (body) => {
            sourceController?.setSourceText(body);
            statusBar?.update({ sourceText: body });
          },
          setFrontmatter,
          onEditorApplied: () => {
            if (!modeState.sourceMode) {
              editorMarkdown = getMarkdownFromEditorSafe(editor) ?? "";
            }
          },
        }),
      );

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

      // === shortcuts（document への keydown・旧 useEditorShortcuts のファイル/モード系） ===
      // source モード（editor.view.dom 非表示）でも効かせるため document へ装着する。
      // mod+Shift+S=名前を付けて保存 / mod+Shift+C=全文コピー / mod+O=開く /
      // mod+Alt+S=4モード循環 / mod+Alt+M=merge 切替 / mod+Alt+N=クリア。
      const copyAllMarkdown = (): void => {
        const md = fileOps.getFullMarkdown();
        void navigator.clipboard?.writeText(md).then(() => {
          layout.liveRegion.textContent = t("copiedToClipboard");
        });
      };
      const onGlobalShortcutKeyDown = (e: KeyboardEvent): void => {
        if (!(e.ctrlKey || e.metaKey)) return;
        const key = e.key.toLowerCase();
        // mod+Shift 系（Alt なし）。
        if (e.shiftKey && !e.altKey) {
          if (key === "s") {
            e.preventDefault();
            fileHandlers.onSaveAsFile?.();
          } else if (key === "c") {
            e.preventDefault();
            copyAllMarkdown();
          }
          return;
        }
        // mod+Alt 系（Shift なし）。
        if (e.altKey && !e.shiftKey) {
          if (key === "s") {
            // 4 モード循環: Readonly → Review → Edit → Source → Readonly
            // （旧実装と同一。Review/Readonly 切替が未配線なら Wysiwyg へフォールバック）。
            e.preventDefault();
            if (modeState.readonlyMode) {
              (modeHandlers.onSwitchToReview ?? modeHandlers.onSwitchToWysiwyg)();
            } else if (modeState.reviewMode) {
              modeHandlers.onSwitchToWysiwyg();
            } else if (modeState.sourceMode) {
              (modeHandlers.onSwitchToReadonly ?? modeHandlers.onSwitchToWysiwyg)();
            } else {
              modeHandlers.onSwitchToSource();
            }
          } else if (modeState.readonlyMode || modeState.reviewMode) {
            // readonly / review では編集系（merge / clear）を無効化（旧実装と同一）。
          } else if (key === "m") {
            e.preventDefault();
            modeHandlers.onMerge();
          } else if (key === "n") {
            e.preventDefault();
            fileHandlers.onClear();
          }
          return;
        }
        // mod 単独系（Alt / Shift なし）。mod+S / mod+K は editor.view.dom 側で処理する。
        if (!e.altKey && key === "o") {
          e.preventDefault();
          fileHandlers.onOpenFile?.();
        }
      };
      document.addEventListener("keydown", onGlobalShortcutKeyDown);
      disposers.push(() => document.removeEventListener("keydown", onGlobalShortcutKeyDown));

      // === block overlay（gif/image/table の DialogHost 3 を vanilla 配線） =====
      // 表の全画面編集は consumer 上書き（onTableEdit）が無ければ内蔵ダイアログ
      // （TableEditDialog = 旧 React TableDialogHost の vanilla 版）で自己完結する。
      let tableEditDialog: TableEditDialogHandle | null = null;
      const openBuiltinTableEdit: NonNullable<typeof current.onTableEdit> = ({ pos, setEditing }) => {
        const isDark = current.themeMode === "dark";
        tableEditDialog?.destroy();
        tableEditDialog = openTableEditDialog({
          editor,
          pos,
          isDark,
          t,
          locale: current.locale,
          paperBg: getEditDialogBg(isDark, effectiveSettings()),
          onClosed: () => {
            tableEditDialog = null;
            setEditing(false);
          },
        });
      };
      disposers.push(() => tableEditDialog?.destroy());
      const blockOverlays = installBlockOverlays(editor, {
        t,
        confirm: current.confirm,
        vscodeApi: current.vscodeApi,
        onTableEdit: current.onTableEdit ?? openBuiltinTableEdit,
      });
      disposers.push(() => blockOverlays.destroy());

      // === rich codeblock overlay（installer 注入・React codeBlockOverlay 相当） ==
      if (current.codeBlockOverlayInstaller) {
        disposers.push(current.codeBlockOverlayInstaller(editor));
      }

      // === live update（handle.update → ここで反映） ============================
      applyLivePatch = (patch) => {
        if (patch.readOnly !== undefined) {
          current.readOnly = patch.readOnly;
          modeState.readonlyMode = patch.readOnly || sourceController?.getMode() === "readonly";
          editor.setEditable(!readonlyNow() && sourceController?.getMode() !== "review");
          remakeBubble();
          refreshToolbarMode();
        }
        if (patch.autoReload !== undefined) {
          autoReloadController.set(patch.autoReload);
        }
        if (patch.settings) {
          settings = { ...settings, ...patch.settings };
        }
        // themeMode はコンテンツ CSS（ダーク/ライト埋め込み色）と背景・文字色変数に影響する。
        if (patch.settings || patch.themeMode !== undefined) {
          applyAllSettings();
        }
        if (patch.themeMode !== undefined) {
          viewerToolbar?.syncTheme(current.themeMode ?? "light");
        }
        if (patch.fileName !== undefined) {
          statusBar?.update({ fileName: patch.fileName });
        }
        // externalCompareContent は遷移（値の変化）でのみ反映する。Mount ラッパは live patch の
        // たびに現値（null 含む）を相乗りさせるため、無変化の null で閉じたり同値を再適用しない。
        // 非 null → null の遷移は「compare モードを閉じる」信号として扱う。
        if (
          patch.externalCompareContent !== undefined &&
          patch.externalCompareContent !== lastExternalCompareContent
        ) {
          lastExternalCompareContent = patch.externalCompareContent;
          if (patch.externalCompareContent === null) {
            setInlineMergeOpen(false);
          } else {
            applyExternalCompareContent(patch.externalCompareContent);
          }
        }
        // themeMode / presetName は SettingsPanel open 時に current から読むため保持のみ。
      };
      disposers.push(() => {
        applyLivePatch = null;
      });

      // 初期 externalCompareContent（mount 直後に比較モードを開く）。
      lastExternalCompareContent = current.externalCompareContent ?? null;
      if (current.externalCompareContent != null) {
        applyExternalCompareContent(current.externalCompareContent);
      }

      return disposers;
    },
  });

  return {
    editor: host.editor,
    root,
    update(patch: VanillaMarkdownEditorUpdatePatch): void {
      // current へ反映（SettingsPanel 等は open 時に current を読む）
      Object.assign(current, patch);
      applyLivePatch?.(patch);
    },
    destroy() {
      host.destroy();
      root.remove();
    },
  };
}
