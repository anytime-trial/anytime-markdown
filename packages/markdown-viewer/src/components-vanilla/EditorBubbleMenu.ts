/**
 * 脱React の vanilla DOM「EditorBubbleMenu」ファクトリ
 * （framework-decoupling Phase 3 / 脱React chrome seam）。
 *
 * React 原版 `components/EditorBubbleMenu.tsx` を素 DOM へ移植したもの。テキスト選択時に
 * フローティングツールバー（太字 / 斜体 / 下線 / 取消線 / ハイライト / コード / リンク /
 * コメント）を表示する。
 *
 * **重要**: React の `markdown-react/menus` の `BubbleMenu` は使わず、tiptap CORE の
 * `BubbleMenuPlugin`（`@anytime-markdown/markdown-extension-bubble-menu`）を `editor.registerPlugin`
 * で直接装着する。フローティング要素（Paper + IconButton + Tooltip + Divider 相当）は素 DOM で
 * 構成し、`destroy()` で `editor.unregisterPlugin` してプラグインと listener を解放する。
 *
 * 変換規約:
 * - React props → ファクトリ options（`editor` を第 1 引数、`t` / `onLink` / `readonlyMode` /
 *   `reviewMode` / `executeInReviewMode` を opts で受ける）。戻り値は `{ el, destroy }`。
 * - `useIsDark` は不要（ui-vanilla は `--am-color-*` CSS 変数でテーマ追従する）。`useMarkdownT`
 *   → `t` を opts で受ける。`useRef`（z-index 前面化）→ closure 内で生成直後に設定。
 * - 状態は closure 変数。active 状態（太字 ON 等）の色は editor の transaction 購読で更新し、
 *   listener / editor plugin の cleanup は `destroy()` で必ず解放する。
 * - editor 操作（chain / commands）は React 版と同一ロジックを移植する。
 *
 * 本番未配線（追加のみ）。host が editor を渡して生成する想定。
 */

import type { Editor } from "@anytime-markdown/markdown-core";
import { BubbleMenuPlugin } from "@anytime-markdown/markdown-extension-bubble-menu";

import { svgIcon } from "../ui-vanilla/dom";
import { createIconButton } from "../ui-vanilla";
import { createPaper } from "../ui-vanilla/Paper";
import { createTooltip } from "../ui-vanilla/Tooltip";
import { modKey } from "../constants/shortcuts";
import { Z_BUBBLE_MENU } from "../constants/zIndex";
import { getEditorStorage, type TranslationFn } from "../types";

/** ui/icons.tsx と同一の Material SVG path（24x24）。 */
const ICON_BOLD =
  "M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42M10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5";
const ICON_ITALIC = "M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z";
const ICON_UNDERLINE =
  "M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6m-7 2v2h14v-2z";
const ICON_STRIKETHROUGH =
  "M6.85 7.08C6.85 4.37 9.45 3 12.24 3c1.64 0 3 .49 3.9 1.28.77.65 1.46 1.73 1.46 3.24h-3.01c0-.31-.05-.59-.15-.85-.29-.86-1.2-1.28-2.25-1.28-1.86 0-2.34 1.02-2.34 1.7 0 .48.25.88.74 1.21.38.25.77.48 1.41.7H7.39c-.21-.34-.54-.89-.54-1.92M21 12v-2H3v2h9.62c1.15.45 1.96.75 1.96 1.97 0 1-.81 1.67-2.28 1.67-1.54 0-2.93-.54-2.93-2.51H6.4c0 .55.08 1.13.24 1.58.81 2.29 3.29 3.3 5.67 3.3 2.27 0 5.3-.89 5.3-4.05 0-.3-.01-1.16-.48-1.94H21z";
const ICON_HIGHLIGHT =
  "M22 24H2v-4h20zM13.06 5.19l3.75 3.75L7.75 18H4v-3.75zm4.82 2.68-3.75-3.75 1.83-1.83c.39-.39 1.02-.39 1.41 0l2.34 2.34c.39.39.39 1.02 0 1.41z";
const ICON_CODE = "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z";
const ICON_LINK =
  "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1M8 13h8v-2H8zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5";
const ICON_COMMENT =
  "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H6l-2 2V4h16z";

/** ツールチップキー → ショートカットキー表示マッピング（React 版と同一）。 */
const TOOLTIP_SHORTCUTS: Record<string, string> = {
  bold: `${modKey}+B`,
  italic: `${modKey}+I`,
  underline: `${modKey}+U`,
  strikethrough: `${modKey}+Shift+X`,
  highlight: `${modKey}+Shift+H`,
  link: `${modKey}+K`,
  comment: `${modKey}+Shift+M`,
  code: `${modKey}+E`,
};

/** ツールチップにショートカットキーを付加（React 版 tip() と同一）。 */
function tip(t: TranslationFn, key: string): string {
  const shortcut = TOOLTIP_SHORTCUTS[key];
  return shortcut ? `${t(key)}  (${shortcut})` : t(key);
}

/** {@link createEditorBubbleMenu} のオプション（React `EditorBubbleMenuProps` の vanilla 置換）。 */
export interface CreateEditorBubbleMenuOptions {
  /** i18n 翻訳関数。 */
  t: TranslationFn;
  /** リンク挿入 intent（ダイアログは host 側）。 */
  onLink: () => void;
  /** 読み取り専用モード。true の間はバブルメニューを表示しない。 */
  readonlyMode?: boolean;
  /** レビューモード。書式系ボタンを隠し、コメントは executeInReviewMode 経由で実行する。 */
  reviewMode?: boolean;
  /** レビューモードでの実行ラッパ（編集の許可確認等を host 側で挟む）。 */
  executeInReviewMode?: (fn: () => void) => void;
  /** バブルメニューの pluginKey（既定 "bubbleMenu"）。 */
  pluginKey?: string;
}

/** {@link createEditorBubbleMenu} の戻り値。 */
export interface EditorBubbleMenuHandle {
  /** フローティングツールバーのルート要素（BubbleMenuPlugin が表示制御する）。 */
  el: HTMLDivElement;
  /** editor plugin 登録解除・tooltip / transaction listener 解放・el 取り外し。 */
  destroy: () => void;
}

/** 個々のフォーマットボタンの内部記述。 */
interface ButtonSpec {
  /** ツールチップ / aria-label に使う i18n キー。 */
  key: string;
  /** SVG path。 */
  icon: string;
  /** クリック時の操作。 */
  onClick: () => void;
  /**
   * active（ハイライト）判定。true の間は primary 色になる。コメントは
   * commentHighlight、リンクは link を見る。指定なしのボタンは常に非 active。
   */
  isActive?: () => boolean;
  /** aria-pressed を出すか（トグル系のみ）。 */
  pressed?: boolean;
}

/**
 * vanilla EditorBubbleMenu を生成する。tiptap CORE の `BubbleMenuPlugin` を editor へ装着し、
 * 選択時に素 DOM ツールバーを表示する。
 *
 * - `shouldShow` は React 版と同一（readonly / 空選択 / codeBlock / footnoteRef を除外）。
 * - active 状態の色は editor の `transaction` 購読で更新する（React の再レンダー相当）。
 * - 左右矢印キーでボタン間フォーカス移動（React 版 handleKeyDown と同一）。
 *
 * @param editor BubbleMenuPlugin を装着する editor インスタンス。
 * @param opts 翻訳・intent・モードフラグ。
 * @returns `el`（ツールバールート）と `destroy`。
 */
export function createEditorBubbleMenu(
  editor: Editor,
  opts: CreateEditorBubbleMenuOptions,
): EditorBubbleMenuHandle {
  const { t, onLink, readonlyMode, reviewMode, executeInReviewMode } = opts;
  const pluginKey = opts.pluginKey ?? "bubbleMenu";

  // --- ルート要素（BubbleMenuPlugin の element）。z-index は sticky ツールバーより前面化。 ---
  const root = document.createElement("div");
  root.style.visibility = "hidden";
  root.style.position = "absolute";
  // フローティング要素は z-index 未設定で生成されるため、sticky エディタツールバー
  // （Z_TOOLBAR）に覆われてクリックが奪われる。明示的に前面化する（React 版 useEffect 相当）。
  root.style.zIndex = String(Z_BUBBLE_MENU);

  // --- Paper（role=toolbar）。 ---
  const paper = createPaper({
    role: "toolbar",
    ariaLabel: t("textFormatMenu"),
    style: {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      paddingLeft: "4px",
      paddingRight: "4px",
      paddingTop: "2px",
      paddingBottom: "2px",
      borderRadius: "4px",
      boxShadow: "var(--am-elevation-3)",
    },
  });
  const toolbar = paper.el;
  root.appendChild(toolbar);

  // --- キーボードナビ（左右矢印でボタン間移動・React 版 handleKeyDown と同一）。 ---
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const buttons = Array.from(
      toolbar.querySelectorAll("button:not([disabled])"),
    ) as HTMLElement[];
    const current = buttons.indexOf(document.activeElement as HTMLElement);
    const len = buttons.length;
    if (len === 0) return;
    const next =
      e.key === "ArrowRight"
        ? (current + 1) % len
        : (current - 1 + len) % len;
    buttons[next]?.focus();
  };
  toolbar.addEventListener("keydown", handleKeyDown);

  // --- ボタン spec（React 版の各 Tooltip>IconButton と同一ロジック）。 ---
  const openComment = (): void => {
    const storage = getEditorStorage(editor);
    const commentDialog = storage.commentDialog as
      | { open?: () => void }
      | undefined;
    const openDialog = commentDialog?.open;
    if (openDialog) openDialog();
  };

  const formatSpecs: ButtonSpec[] = [
    {
      key: "bold",
      icon: ICON_BOLD,
      pressed: true,
      isActive: () => editor.isActive("bold"),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      icon: ICON_ITALIC,
      pressed: true,
      isActive: () => editor.isActive("italic"),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: "underline",
      icon: ICON_UNDERLINE,
      pressed: true,
      isActive: () => editor.isActive("underline"),
      onClick: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      key: "strikethrough",
      icon: ICON_STRIKETHROUGH,
      pressed: true,
      isActive: () => editor.isActive("strike"),
      onClick: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      key: "highlight",
      icon: ICON_HIGHLIGHT,
      pressed: true,
      isActive: () => editor.isActive("highlight"),
      onClick: () => editor.chain().focus().toggleHighlight().run(),
    },
    {
      key: "code",
      icon: ICON_CODE,
      pressed: true,
      isActive: () => editor.isActive("code"),
      onClick: () => editor.chain().focus().toggleCode().run(),
    },
    {
      key: "link",
      icon: ICON_LINK,
      isActive: () => editor.isActive("link"),
      onClick: onLink,
    },
  ];

  const commentSpec: ButtonSpec = {
    key: "comment",
    icon: ICON_COMMENT,
    isActive: () => editor.isActive("commentHighlight"),
    onClick: () => {
      if (reviewMode && executeInReviewMode) {
        executeInReviewMode(openComment);
      } else {
        openComment();
      }
    },
  };

  // モード別の表示ボタン集合（React 版の条件レンダーと同一）。
  // - readonly: 何も出さない（コメントすら出さない）。
  // - review: 書式系を隠し、コメントのみ。
  // - 通常: 書式系 + コメント。
  let specs: ButtonSpec[];
  if (readonlyMode) {
    specs = [];
  } else if (reviewMode) {
    specs = [commentSpec];
  } else {
    specs = [...formatSpecs, commentSpec];
  }

  // --- 各ボタンを生成し、active 更新のための closure を集める。 ---
  const tooltips: Array<{ destroy: () => void }> = [];
  const iconButtons: Array<{ el: HTMLButtonElement; destroy: () => void }> = [];
  const activeUpdaters: Array<() => void> = [];

  for (const spec of specs) {
    const btn = createIconButton({
      size: "compact",
      ariaLabel: t(spec.key),
      onClick: () => spec.onClick(),
    });
    btn.el.appendChild(svgIcon(spec.icon, 18));
    if (spec.pressed) {
      btn.el.setAttribute("aria-pressed", String(spec.isActive?.() ?? false));
    }
    // active 色更新（React 版の style={{ color: isActive ? primary : undefined }} 相当）。
    const updateActive = (): void => {
      const active = spec.isActive?.() ?? false;
      btn.el.style.color = active ? "var(--am-color-primary-main)" : "";
      if (spec.pressed) {
        btn.el.setAttribute("aria-pressed", String(active));
      }
    };
    updateActive();
    activeUpdaters.push(updateActive);

    const tooltip = createTooltip({
      reference: btn.el,
      title: tip(t, spec.key),
    });

    toolbar.appendChild(btn.el);
    iconButtons.push(btn);
    tooltips.push(tooltip);
  }

  // --- editor transaction 購読で active 状態を再描画（React の再レンダー相当）。 ---
  const onTransaction = (): void => {
    for (const update of activeUpdaters) update();
  };
  editor.on("transaction", onTransaction);

  // --- BubbleMenuPlugin を editor へ装着（React menus の BubbleMenu は使わない）。 ---
  const plugin = BubbleMenuPlugin({
    pluginKey,
    editor,
    element: root,
    shouldShow: ({ editor: e, state }) => {
      if (readonlyMode) return false;
      const { selection } = state;
      if (selection.empty) return false;
      if (e.isActive("codeBlock")) return false;
      // 脚注参照（atom ノード）選択時はバブルメニューを表示しない。
      if (e.isActive("footnoteRef")) return false;
      return true;
    },
  });
  editor.registerPlugin(plugin);

  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    editor.off("transaction", onTransaction);
    if (!editor.isDestroyed) {
      editor.unregisterPlugin(pluginKey);
    }
    toolbar.removeEventListener("keydown", handleKeyDown);
    for (const tooltip of tooltips) tooltip.destroy();
    for (const btn of iconButtons) btn.destroy();
    // BubbleMenuPlugin が parent へ append している場合があるため取り外す。
    root.remove();
  }

  return { el: root, destroy };
}
