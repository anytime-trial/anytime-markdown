/**
 * 脱React の vanilla DOM サイドツールバー（framework-decoupling Phase 3 / ホスト隔離）。
 *
 * React 実装 `components/EditorSideToolbar.tsx`（縦並びの右端ツールバー）の素 DOM 版。
 * アウトライン / コメント / エクスプローラ / 設定の各トグルを ui-vanilla プリミティブ
 * （createIconButton + createTooltip）で構成し、トグル間の排他ロジック（片方を開くと
 * 他を閉じる）は React 版と同一に移植する。
 *
 * テーマ色は CSS 変数（`--am-color-*` / applyEditorThemeCssVars 注入）で追従するため
 * `useIsDark` 等の React テーマ API には依存しない（active 色は `--am-color-primary-main`）。
 * i18n は `t` を opts で受ける（useMarkdownT 相当）。React context は全て opts 引数化する。
 *
 * 開閉状態（sourceMode / outlineOpen / commentOpen / explorerOpen）は外部所有のため、
 * 親 host が `update()` で流し込む。本ファクトリは状態を保持せず描画のみ担う。
 */

import {
  SIDE_TOOLBAR_ICON_SIZE,
  SIDE_TOOLBAR_WIDTH,
} from "../constants/dimensions";
import { ensureStyle, svgIcon } from "../ui-vanilla/dom";
import { createIconButton, type IconButtonHandle } from "../ui-vanilla/IconButton";
import { createTooltip } from "../ui-vanilla/Tooltip";

/** Material アイコン SVG path（ui/icons と同一）。 */
const ICON = {
  // ListAltIcon（アウトライン）
  listAlt:
    "M19 5v14H5V5zm1.1-2H3.9c-.5 0-.9.4-.9.9v16.2c0 .4.4.9.9.9h16.2c.4 0 .9-.5.9-.9V3.9c0-.5-.5-.9-.9-.9M11 7h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6zM7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7z",
  // ChatBubbleOutlineIcon（コメント）
  chatBubble:
    "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H6l-2 2V4h16z",
  // GitHubIcon（エクスプローラ）
  gitHub:
    "M12 1.27a11 11 0 00-3.48 21.46c.55.09.73-.28.73-.55v-1.84c-3.03.64-3.67-1.46-3.67-1.46-.55-1.29-1.28-1.65-1.28-1.65-.92-.65.1-.65.1-.65 1.1 0 1.73 1.1 1.73 1.1.92 1.65 2.57 1.2 3.21.92a2 2 0 01.64-1.47c-2.47-.27-5.04-1.19-5.04-5.5 0-1.1.46-2.1 1.2-2.84a3.76 3.76 0 010-2.93s.91-.28 3.11 1.1c1.8-.49 3.7-.49 5.5 0 2.1-1.38 3.02-1.1 3.02-1.1a3.76 3.76 0 010 2.93c.83.74 1.2 1.74 1.2 2.94 0 4.21-2.57 5.13-5.04 5.4.45.37.82.92.82 2.02v3.03c0 .27.1.64.73.55A11 11 0 0012 1.27",
  // SettingsIcon（設定）
  settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6",
} as const;

/** サイドツールバー内アイコンの実寸（px）。SvgIcon fontSize="small"（20px）相当。 */
const ICON_PX = 20;

/** {@link createEditorSideToolbar} の生成オプション。 */
export interface CreateEditorSideToolbarOptions {
  /** i18n（aria-label / tooltip）。useMarkdownT 相当を opts で受ける。 */
  t: (key: string) => string;
  /** 初期: ソースモード（outline / comment ボタンを無効化）。 */
  sourceMode?: boolean;
  /** 初期: アウトラインパネル開状態。 */
  outlineOpen?: boolean;
  /** 初期: コメントパネル開状態。 */
  commentOpen?: boolean;
  /** 初期: エクスプローラパネル開状態。 */
  explorerOpen?: boolean;
  /** アウトライントグル。未指定でもボタンは描画する（React 版と同様 disabled は sourceMode 依存）。 */
  onToggleOutline?: () => void;
  /** コメントトグル（明示 open 値を渡す）。 */
  onToggleComment: (open: boolean) => void;
  /** エクスプローラトグル。未指定ならボタン自体を描画しない（React 版と同一）。 */
  onToggleExplorer?: () => void;
  /** 設定オープン。未指定ならボタン自体を描画しない（React 版と同一）。 */
  onOpenSettings?: () => void;
}

/** 外部から流し込む可変状態（開閉 / ソースモード）。 */
export interface EditorSideToolbarState {
  sourceMode?: boolean;
  outlineOpen?: boolean;
  commentOpen?: boolean;
  explorerOpen?: boolean;
}

/** {@link createEditorSideToolbar} の戻り値。 */
export interface EditorSideToolbarHandle {
  /** root の `<div>` 要素（縦並びコンテナ）。 */
  el: HTMLDivElement;
  /** 可変状態（開閉 / ソースモード）を流し込み active 色・disabled を再適用する。 */
  update: (state: EditorSideToolbarState) => void;
  /** tooltip / icon button の listener を解放する。 */
  destroy: () => void;
}

/** 内部: 1 アイコンボタン + tooltip + active 制御のまとまり。 */
interface ToolbarItem {
  button: IconButtonHandle;
  tooltip: { destroy: () => void };
  /** active 時に primary 色、非 active で既定色に戻す。 */
  setActive: (active: boolean) => void;
}

function makeIcon(path: string): SVGSVGElement {
  return svgIcon(path, ICON_PX);
}

/**
 * 縦並びのサイドツールバーを生成する（vanilla / React-free）。
 *
 * 各ボタンは ui-vanilla の `createIconButton`（hover / focus / disabled は共有 <style>）で
 * 生成し、左側に出る tooltip は `createTooltip`（placement="left"）で装着する。トグルの排他
 * ロジック（outline を開くと comment / explorer を閉じる 等）は React 版の onClick を移植する。
 * active 状態の色付けは外部状態に依存するため、`update()` で都度再適用する。
 */
export function createEditorSideToolbar(
  opts: CreateEditorSideToolbarOptions,
): EditorSideToolbarHandle {
  const { t } = opts;

  // 外部所有状態のローカル shadow（update で同期、onClick の排他判定に参照）。
  const state: Required<
    Pick<
      EditorSideToolbarState,
      "sourceMode" | "outlineOpen" | "commentOpen" | "explorerOpen"
    >
  > = {
    sourceMode: opts.sourceMode ?? false,
    outlineOpen: opts.outlineOpen ?? false,
    commentOpen: opts.commentOpen ?? false,
    explorerOpen: opts.explorerOpen ?? false,
  };

  const root = document.createElement("div");
  root.className = "am-side-toolbar";
  root.style.cssText =
    "display:flex;flex-direction:column;align-items:center;height:100%;" +
    "padding-top:8px;padding-bottom:8px;gap:4px;flex-shrink:0;" +
    `width:${SIDE_TOOLBAR_WIDTH}px;border:1px solid var(--am-color-divider);`;
  // 旧 EditorSideToolbar.module.css parity: md 未満では非表示（インライン display を打ち消すため !important）。
  ensureStyle(
    "am-side-toolbar-style",
    "@media (max-width: 900px) { .am-side-toolbar { display: none !important; } }",
  );

  const items: ToolbarItem[] = [];

  /** 共通: アイコンボタン + tooltip を生成し root へ append する。 */
  function addItem(config: {
    label: string;
    iconPath: string;
    onClick: () => void;
  }): ToolbarItem {
    const button = createIconButton({
      size: "compact",
      ariaLabel: config.label,
      children: makeIcon(config.iconPath),
      onClick: config.onClick,
    });
    // SIDE_TOOLBAR_ICON_SIZE の正方形寸法を強制（React 版の width/height 指定相当）。
    button.el.style.width = `${SIDE_TOOLBAR_ICON_SIZE}px`;
    button.el.style.height = `${SIDE_TOOLBAR_ICON_SIZE}px`;

    const tooltip = createTooltip({
      reference: button.el,
      title: config.label,
      placement: "left",
    });

    root.appendChild(button.el);

    const setActive = (active: boolean): void => {
      button.el.style.color = active ? "var(--am-color-primary-main)" : "";
    };

    const item: ToolbarItem = { button, tooltip, setActive };
    items.push(item);
    return item;
  }

  // --- アウトライン ---
  const outlineItem = addItem({
    label: t("outline"),
    iconPath: ICON.listAlt,
    onClick: () => {
      if (state.outlineOpen) {
        opts.onToggleOutline?.();
      } else {
        opts.onToggleComment(false);
        if (state.explorerOpen) opts.onToggleExplorer?.();
        opts.onToggleOutline?.();
      }
    },
  });

  // --- コメント ---
  const commentItem = addItem({
    label: t("commentPanel"),
    iconPath: ICON.chatBubble,
    onClick: () => {
      if (state.commentOpen) {
        opts.onToggleComment(false);
      } else {
        if (state.outlineOpen) opts.onToggleOutline?.();
        if (state.explorerOpen) opts.onToggleExplorer?.();
        opts.onToggleComment(true);
      }
    },
  });

  // --- エクスプローラ（callback 未指定なら描画しない＝React 版と同一） ---
  let explorerItem: ToolbarItem | undefined;
  if (opts.onToggleExplorer) {
    explorerItem = addItem({
      label: t("explorer"),
      iconPath: ICON.gitHub,
      onClick: () => {
        if (state.explorerOpen) {
          opts.onToggleExplorer?.();
        } else {
          if (state.outlineOpen) opts.onToggleOutline?.();
          opts.onToggleComment(false);
          opts.onToggleExplorer?.();
        }
      },
    });
  }

  // --- 設定（callback 未指定なら描画しない＝React 版と同一） ---
  if (opts.onOpenSettings) {
    addItem({
      label: t("editorSettings"),
      iconPath: ICON.settings,
      onClick: opts.onOpenSettings,
    });
  }

  /** state に応じて active 色・disabled（sourceMode）を再適用する。 */
  function applyState(): void {
    // outline / comment は sourceMode で無効化（React 版 disabled={sourceMode}）。
    outlineItem.button.update({ disabled: state.sourceMode });
    commentItem.button.update({ disabled: state.sourceMode });
    outlineItem.setActive(state.outlineOpen);
    commentItem.setActive(state.commentOpen);
    explorerItem?.setActive(state.explorerOpen);
    // 設定ボタンは active / disabled の概念なし（常時操作可）。
  }

  applyState();

  function update(next: EditorSideToolbarState): void {
    if (next.sourceMode !== undefined) state.sourceMode = next.sourceMode;
    if (next.outlineOpen !== undefined) state.outlineOpen = next.outlineOpen;
    if (next.commentOpen !== undefined) state.commentOpen = next.commentOpen;
    if (next.explorerOpen !== undefined) state.explorerOpen = next.explorerOpen;
    applyState();
  }

  function destroy(): void {
    for (const item of items) {
      item.tooltip.destroy();
      item.button.destroy();
    }
    items.length = 0;
  }

  return { el: root, update, destroy };
}
