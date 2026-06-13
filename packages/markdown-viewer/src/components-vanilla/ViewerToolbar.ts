/**
 * read-only ビュー用の最小ツールバー（`viewerToolbar` オプション時に toolbarSlot へ配置）。
 *
 * 編集系コントロールを一切持たず、閲覧者向けの「フォントサイズ −/＋」と
 * 「dark/light テーマ切替」アイコンだけを表示する（React 除去前の read-only 記事ビューで
 * 提供されていたフォント/テーマ操作の再現）。フォント変更・テーマ切替の実処理は host が
 * コールバックで受け、既存の settings / themeMode 配線を再利用する。
 */

import type { TranslationFn } from "../types";
import { svgIcon } from "../ui-vanilla/dom";
import { createIconButton } from "../ui-vanilla/IconButton";

/** dark モード時に表示する太陽アイコン（クリックで light へ）。MUI Brightness7 相当。 */
const SUN_PATH = [
  "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
];
/** light モード時に表示する月アイコン（クリックで dark へ）。MUI Brightness4/DarkMode 相当。 */
const MOON_PATH = [
  "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z",
];

export interface ViewerToolbarOptions {
  readonly t: TranslationFn;
  /** テーマ切替時の現在モード（アイコン表示の決定に使用）。 */
  readonly themeMode: "light" | "dark";
  /** フォントサイズ増減（host が clamp + settings 適用）。 */
  readonly onFontDelta: (delta: number) => void;
  /** テーマ切替要求（host が onThemeModeChange を呼ぶ）。 */
  readonly onToggleTheme: () => void;
}

export interface ViewerToolbarHandle {
  readonly el: HTMLElement;
  /** 外部からのテーマ変更をアイコンへ反映する。 */
  syncTheme(mode: "light" | "dark"): void;
  destroy(): void;
}

function themeIconFor(mode: "light" | "dark"): SVGSVGElement {
  // dark なら太陽（→light）、light なら月（→dark）を表示する。
  return svgIcon(mode === "dark" ? SUN_PATH : MOON_PATH, 20);
}

export function createViewerToolbar(opts: ViewerToolbarOptions): ViewerToolbarHandle {
  const root = document.createElement("div");
  root.setAttribute("data-am-viewer-toolbar", "");
  root.setAttribute("role", "toolbar");
  root.setAttribute("aria-label", opts.t("viewerToolbar"));
  root.style.cssText =
    "display:flex;align-items:center;justify-content:flex-end;gap:4px;" +
    "padding:4px 8px;flex-shrink:0;border-bottom:1px solid var(--am-color-divider);";

  const fontDown = createIconButton({
    size: "small",
    ariaLabel: opts.t("viewerFontDecrease"),
    children: "A−",
    onClick: () => opts.onFontDelta(-1),
  });
  const fontUp = createIconButton({
    size: "small",
    ariaLabel: opts.t("viewerFontIncrease"),
    children: "A+",
    onClick: () => opts.onFontDelta(1),
  });
  // フォントの大小を視覚化（A− は小さめ、A+ は大きめ）。
  fontDown.el.style.fontSize = "12px";
  fontUp.el.style.fontSize = "16px";

  const themeBtn = createIconButton({
    size: "small",
    ariaLabel: opts.t("settingDarkMode"),
    children: themeIconFor(opts.themeMode),
    onClick: () => opts.onToggleTheme(),
  });

  root.append(fontDown.el, fontUp.el, themeBtn.el);

  return {
    el: root,
    syncTheme(mode) {
      themeBtn.el.replaceChildren(themeIconFor(mode));
    },
    destroy() {
      root.remove();
    },
  };
}
