/**
 * 脱React の vanilla markdown editor オーケストレーター（G3-1 draft・追加のみ・本番未配線）。
 *
 * React の `MarkdownEditorPage.tsx`（756 行・15 hooks + useEditor + EditorContent + React chrome
 * sections）に対応する **vanilla 版の骨格**。`createVanillaEditorHost` で editor を mount し、
 * `installChrome` 内で `components-vanilla/*` のファクトリを合成して素 DOM で chrome を構築する。
 *
 * 本ファイルは G3 計画（plan/20260610-g3-app-root-flip-spec.ja.md）の段階的 seam 戦略に基づく
 * **draft**であり、consumer（web-app / vscode webview）にはまだ配線しない。core chrome
 * （BubbleMenu / StatusBar / SlashCommand）を実配線し、重量系（Toolbar の file/mode 配線・
 * SettingsPanel + settings store・Dialogs・Outline/Comment/Merge・DialogHost 3）は **TODO seam**
 * として明示する。React 完全除去の成立（本番組み替え）は G3-2 以降でユーザーの手動疎通を伴う。
 *
 * 依存方向: host → ui-vanilla / components-vanilla / markdown-core。React / markdown-react を
 * 一切 import しない（型含め core を使う）。
 */

import type { Editor } from "@anytime-markdown/markdown-core";

import { buildEditorExtensions } from "../buildEditorExtensions";
import type { SlashCommandState } from "../extensions/slashCommandExtension";
import { getMarkdownFromEditor, type TranslationFn } from "../types";
import { createVanillaEditorHost } from "./vanillaEditorHost";
import { createEditorBubbleMenu } from "../components-vanilla/EditorBubbleMenu";
import { createStatusBar } from "../components-vanilla/StatusBar";
import {
  createSlashCommandMenu,
  type VanillaSlashCommandItem,
} from "../components-vanilla/SlashCommandMenu";

/** {@link mountVanillaMarkdownEditor} のオプション（MarkdownEditorPage props の vanilla サブセット）。 */
export interface MountVanillaMarkdownEditorOptions {
  /** i18n 翻訳関数。 */
  t: TranslationFn;
  /** 現在ロケール（SettingsPanel 等の TODO seam で使用）。 */
  locale?: string;
  /** 初期 markdown。 */
  initialContent?: string;
  /** 読み取り専用。 */
  readOnly?: boolean;
  /** プレースホルダ（未指定時は t("placeholder")）。 */
  placeholder?: string;
  /** 内容変更通知（editor.on("update") 由来）。 */
  onContentChange?: (markdown: string) => void;
  /** SlashCommand 項目（未指定時は空＝メニューは出るが項目なし。items 供給は TODO seam）。 */
  slashItems?: readonly VanillaSlashCommandItem[];
  /** リンク挿入 intent（BubbleMenu の link ボタン。ダイアログ配線は TODO seam）。 */
  onLink?: () => void;
  /** grid 拡張（table 既定行列）。 */
  gridRows?: number;
  gridCols?: number;
}

/** {@link mountVanillaMarkdownEditor} の戻り値。 */
export interface VanillaMarkdownEditorHandle {
  /** mount 済み core Editor。 */
  readonly editor: Editor;
  /** ルート要素（container に append 済み）。 */
  readonly root: HTMLElement;
  /** editor + 全 chrome を破棄する。 */
  destroy(): void;
}

/** root レイアウト（toolbar / content / statusbar の縦積み）を組む。 */
function buildLayout(): {
  root: HTMLElement;
  toolbarSlot: HTMLElement;
  contentEl: HTMLElement;
  statusBarSlot: HTMLElement;
} {
  const root = document.createElement("div");
  root.setAttribute("data-am-editor-root", "");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;";

  const toolbarSlot = document.createElement("div");
  toolbarSlot.setAttribute("data-am-toolbar-slot", "");
  toolbarSlot.style.flexShrink = "0";

  const contentEl = document.createElement("div");
  contentEl.setAttribute("data-am-content", "");
  contentEl.style.cssText = "flex:1 1 auto;min-height:0;overflow:auto;";

  const statusBarSlot = document.createElement("div");
  statusBarSlot.setAttribute("data-am-statusbar-slot", "");
  statusBarSlot.style.flexShrink = "0";

  root.append(toolbarSlot, contentEl, statusBarSlot);
  return { root, toolbarSlot, contentEl, statusBarSlot };
}

/**
 * vanilla で markdown editor + chrome を mount する。
 *
 * @param container エディタを描画する DOM 要素（呼び元が用意）。
 * @param options 初期内容・i18n・コールバック等。
 * @returns `editor` / `root` / `destroy`。consumer は `destroy()` を unmount 時に呼ぶ。
 */
export function mountVanillaMarkdownEditor(
  container: HTMLElement,
  options: MountVanillaMarkdownEditorOptions,
): VanillaMarkdownEditorHandle {
  const { t, readOnly = false } = options;
  const { root, toolbarSlot, contentEl, statusBarSlot } = buildLayout();
  container.appendChild(root);

  // SlashCommand: editor 拡張の onSlashStateChange → SlashCommandMenu の setCallback で受けた cb へ橋渡し。
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

      // --- core chrome（最小依存で実配線） ----------------------------------

      // BubbleMenu（tiptap core BubbleMenuPlugin を registerPlugin。destroy で unregister）。
      const bubble = createEditorBubbleMenu(editor, {
        t,
        onLink: options.onLink ?? (() => {}),
        readonlyMode: readOnly,
      });
      disposers.push(() => bubble.destroy());

      // StatusBar（行列/文字数/行末/エンコード）。statusBarSlot へ配置。
      const statusBar = createStatusBar({ editor, t });
      statusBarSlot.appendChild(statusBar.el);
      disposers.push(() => statusBar.destroy());

      // SlashCommand（suggestion 駆動）。setCallback で受け取った cb を slashCb に保持。
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

      // 内容変更通知（editor.on("update")）。
      if (options.onContentChange) {
        const onUpdate = (): void => options.onContentChange?.(getMarkdownFromEditor(editor));
        editor.on("update", onUpdate);
        disposers.push(() => editor.off("update", onUpdate));
      }

      // --- TODO seam（G3-2 以降でユーザー疎通を伴い配線） --------------------
      // 以下は file ops / mode state / settings store / ダイアログ群に依存するため、
      // React hooks（useEditorFileOps / useEditorMenuState / useEditorSettings 等）の責務を
      // plain 関数・closure store へ移したうえで配線する（plan §5 マッピング参照）。
      //
      //   - EditorToolbar: createEditorToolbar({ editor, fileHandlers, modeState, modeHandlers, t, ... })
      //       → toolbarSlot へ。file ops（open/save/import/download）と mode 切替の配線が前提。
      //   - EditorSettingsPanel: settings store（plain object + subscribe）と onUpdate→editor 反映。
      //   - EditorDialogs / GifDialogHost / ImageDialogHost / TableDialogHost: intent → open*。
      //   - OutlinePanel / CommentPanel / MergeEditorPanel: editor 購読 + パネル配置（レイアウト拡張）。
      //   - editorProps（paste/import/drop の DOM handlers・createEditorDOMHandlers 相当）。
      //   - useEditorShortcuts / useEditorSideEffects: editor.view.dom への listener（disposer 返却）。

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
