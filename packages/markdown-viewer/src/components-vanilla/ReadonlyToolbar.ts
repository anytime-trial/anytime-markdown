/**
 * 脱React の vanilla DOM chrome — ReadonlyToolbar（framework-decoupling Phase 3 / ホスト隔離）。
 *
 * React 実装 `components/ReadonlyToolbar.tsx` の素 DOM 版。読み取り専用モードのツールバー
 * （アウトライン開閉トグル・フォントサイズ 3 段・テーマプリセット切替）を React / JSX /
 * markdown-react に依存せず構成する。
 *
 * 変換規約:
 * - React props → `opts`（t / 状態 flag / コールバックを引数で受ける）。戻り値は
 *   `{ el, update, destroy }`。
 * - `useIsDark` は不要（ui-vanilla プリミティブは `--am-color-*` CSS 変数でテーマ追従するため
 *   isDark 分岐を削除）。React 版の `getTextSecondary(isDark)` → `var(--am-color-text-secondary)`、
 *   `getActiveBgColor(isDark)`（action.hover 相当）→ `var(--am-color-action-hover)` に置換。
 * - `useMarkdownT` → `t` を opts で受ける。
 * - 状態（outlineOpen / fontSize / presetName）は closure 変数。`update()` で差し替えると
 *   active 表示（色・背景・プリセットアイコン）を再計算する（React の再レンダー相当）。
 * - listener（IconButton onClick）・Tooltip（reference listener / portal）は `destroy()` で
 *   すべて解放する。
 *
 * 依存方向は components-vanilla → ui-vanilla（+ ui/icons の SVG path を vanillaToolbar 経由で
 * 再利用）。React context・hook には一切依存しない。
 */

import type { TranslationFn } from "../types";
import type { ThemePresetName } from "../constants/themePresets";
import { svgIcon } from "../ui-vanilla/dom";
import { createDivider } from "../ui-vanilla/Divider";
import { createIconButton, type IconButtonHandle } from "../ui-vanilla/IconButton";
import { createText, type TextHandle } from "../ui-vanilla/Text";
import { createTooltip } from "../ui-vanilla/Tooltip";

/** アクティブ時のアクセント色（CSS 変数）。React 版の `var(--am-color-primary-main)` と同値。 */
const ACTIVE_COLOR = "var(--am-color-primary-main)";
/** 非アクティブ時の文字色。React 版の `getTextSecondary(isDark)` を CSS 変数化したもの。 */
const INACTIVE_COLOR = "var(--am-color-text-secondary)";
/** アクティブ時の背景。React 版の `getActiveBgColor(isDark)`（action.hover 相当）の CSS 変数版。 */
const ACTIVE_BG = "var(--am-color-action-hover)";

/** ListAlt（アウトライン）アイコンの Material SVG path（ui/icons.tsx と同一）。 */
const LIST_ALT_PATH =
  "M19 5v14H5V5zm1.1-2H3.9c-.5 0-.9.4-.9.9v16.2c0 .4.4.9.9.9h16.2c.4 0 .9-.5.9-.9V3.9c0-.5-.5-.9-.9-.9M11 7h6v2h-6zm0 4h6v2h-6zm0 4h6v2h-6zM7 7h2v2H7zm0 4h2v2H7zm0 4h2v2H7z";
/** Draw（手書きプリセット）アイコンの Material SVG path（ui/icons.tsx と同一）。 */
const DRAW_PATH =
  "m18.85 10.39 1.06-1.06c.78-.78.78-2.05 0-2.83L18.5 5.09c-.78-.78-2.05-.78-2.83 0l-1.06 1.06zm-5.66-2.83L4 16.76V21h4.24l9.19-9.19zM19 17.5c0 2.19-2.54 3.5-5 3.5-.55 0-1-.45-1-1s.45-1 1-1c1.54 0 3-.73 3-1.5 0-.47-.48-.87-1.23-1.2l1.48-1.48c1.07.63 1.75 1.47 1.75 2.68M4.58 13.35C3.61 12.79 3 12.06 3 11c0-1.8 1.89-2.63 3.56-3.36C7.59 7.18 9 6.56 9 6c0-.41-.78-1-2-1-1.26 0-1.8.61-1.83.64-.35.41-.98.46-1.4.12-.41-.34-.49-.95-.15-1.38C3.73 4.24 4.76 3 7 3s4 1.32 4 3c0 1.87-1.93 2.72-3.64 3.47C6.42 9.88 5 10.5 5 11c0 .31.43.6 1.07.86z";
/** WorkspacePremium（プロフェッショナルプリセット）アイコンの Material SVG path（ui/icons.tsx と同一）。 */
const WORKSPACE_PREMIUM_PATH =
  "M9.68 13.69 12 11.93l2.31 1.76-.88-2.85L15.75 9h-2.84L12 6.19 11.09 9H8.25l2.31 1.84zM20 10c0-4.42-3.58-8-8-8s-8 3.58-8 8c0 2.03.76 3.87 2 5.28V23l6-2 6 2v-7.72c1.24-1.41 2-3.25 2-5.28m-8-6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6";

/** フォントサイズ 3 段（React 版 FONT_SIZE_OPTIONS と同一）。 */
interface FontSizeOption {
  value: number;
  iconSize: number;
  label: string;
}
const FONT_SIZE_OPTIONS: readonly FontSizeOption[] = [
  { value: 14, iconSize: 12, label: "fontSmall" },
  { value: 16, iconSize: 15, label: "fontMedium" },
  { value: 18, iconSize: 18, label: "fontLarge" },
];

/** {@link createReadonlyToolbar} のオプション（React ReadonlyToolbarProps 置換）。 */
export interface CreateReadonlyToolbarOptions {
  /** アウトラインパネルの開閉状態。 */
  outlineOpen: boolean;
  /** アウトライン開閉トグルのクリックハンドラ。 */
  onToggleOutline: () => void;
  /** 現在のフォントサイズ（14 / 16 / 18）。 */
  fontSize: number;
  /** フォントサイズ選択時のハンドラ。 */
  onFontSizeChange: (size: number) => void;
  /** 現在のテーマプリセット名（presetChange 提供時のみ意味を持つ）。 */
  presetName?: ThemePresetName;
  /** テーマプリセット切替ハンドラ。未指定ならプリセットボタンを描画しない。 */
  onPresetChange?: (name: ThemePresetName) => void;
  /** i18n 翻訳関数（aria-label / tooltip 用）。 */
  t: TranslationFn;
}

/** {@link createReadonlyToolbar} の戻り値（vanilla chrome の共通契約）。 */
export interface ReadonlyToolbarHandle {
  /** root 要素（`<div>` / flex コンテナ）。 */
  el: HTMLDivElement;
  /** 可変状態（outlineOpen / fontSize / presetName）を差し替え active 表示を再計算する。 */
  update: (next: Partial<Pick<CreateReadonlyToolbarOptions, "outlineOpen" | "fontSize" | "presetName">>) => void;
  /** listener / Tooltip / IconButton / Text を解放する。 */
  destroy: () => void;
}

/** active 状態に応じて IconButton の color / background を切り替える（React の style 分岐相当）。 */
function applyActiveStyle(btn: HTMLButtonElement, active: boolean): void {
  btn.style.color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  btn.style.background = active ? ACTIVE_BG : "transparent";
}

/**
 * 読み取り専用ツールバーを vanilla DOM で生成する。
 *
 * - アウトライントグル（ListAlt）: `outlineOpen` で active 表示。
 * - フォントサイズ 3 段（"A" の文字サイズで段階表現）: `fontSize` 一致で active 表示。
 * - テーマプリセット切替（`onPresetChange` 提供時のみ）: handwritten ⇄ professional をトグルし、
 *   `presetName` に応じて Draw / WorkspacePremium アイコンを出し分ける。
 *
 * editor 操作は持たず（読み取り専用 chrome）、すべてコールバックを通じて host へ委譲する。
 */
export function createReadonlyToolbar(opts: CreateReadonlyToolbarOptions): ReadonlyToolbarHandle {
  const { t, onToggleOutline, onFontSizeChange, onPresetChange } = opts;

  // 可変状態（React の props → closure 変数）。
  let outlineOpen = opts.outlineOpen;
  let fontSize = opts.fontSize;
  let presetName = opts.presetName;

  // cleanup 対象を集約する（destroy で一括解放）。
  const iconButtons: IconButtonHandle[] = [];
  const texts: TextHandle[] = [];
  const tooltips: Array<{ destroy: () => void }> = [];

  // root: React 版の justify-between flex コンテナ（marginBottom 4）。
  const el = document.createElement("div");
  el.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;";

  /** Tooltip 付き IconButton を生成し cleanup 配列へ登録する共通ファクトリ。 */
  function makeButton(
    label: string,
    children: Node | string,
    onClick: () => void,
    extra?: { ariaPressed?: boolean },
  ): IconButtonHandle {
    const handle = createIconButton({
      size: "small",
      ariaLabel: label,
      children,
      onClick,
    });
    if (extra?.ariaPressed !== undefined) {
      handle.el.setAttribute("aria-pressed", String(extra.ariaPressed));
    }
    iconButtons.push(handle);
    tooltips.push(createTooltip({ reference: handle.el, title: label }));
    return handle;
  }

  // --- アウトライントグル（左側） ---
  const outlineBtn = makeButton(
    t("outline"),
    svgIcon(LIST_ALT_PATH, 16),
    onToggleOutline,
    { ariaPressed: outlineOpen },
  );
  applyActiveStyle(outlineBtn.el, outlineOpen);
  el.appendChild(outlineBtn.el);

  // --- 右側グループ（フォントサイズ + プリセット） ---
  const right = document.createElement("div");
  right.style.cssText = "display:flex;gap:4px;align-items:center;";

  // フォントサイズ 3 段。各ボタンを value で引けるよう保持する（update の active 再計算用）。
  const fontButtons: Array<{ value: number; btn: HTMLButtonElement }> = [];
  for (const { value, iconSize, label } of FONT_SIZE_OPTIONS) {
    const textHandle = createText({
      component: "span",
      text: "A",
      style: `font-size:${iconSize}px;font-weight:700;line-height:1;`,
    });
    texts.push(textHandle);
    const handle = makeButton(
      t(label),
      textHandle.el,
      () => onFontSizeChange(value),
      { ariaPressed: fontSize === value },
    );
    applyActiveStyle(handle.el, fontSize === value);
    fontButtons.push({ value, btn: handle.el });
    right.appendChild(handle.el);
  }

  // テーマプリセット切替（onPresetChange 提供時のみ）。
  let presetBtn: IconButtonHandle | null = null;
  if (onPresetChange) {
    const divider = createDivider({
      orientation: "vertical",
      flexItem: true,
    });
    divider.el.style.cssText += "margin-left:4px;margin-right:4px;";
    right.appendChild(divider.el);

    presetBtn = makeButton(
      t("settingThemePreset"),
      svgIcon(presetName === "handwritten" ? DRAW_PATH : WORKSPACE_PREMIUM_PATH, 16),
      () => onPresetChange(presetName === "handwritten" ? "professional" : "handwritten"),
      { ariaPressed: presetName === "handwritten" },
    );
    // プリセットボタンは active 背景を持たず常に secondary 色（React 版と同一）。
    presetBtn.el.style.color = INACTIVE_COLOR;
    right.appendChild(presetBtn.el);
  }

  el.appendChild(right);

  /** プリセットボタンのアイコン・aria を presetName に追従させる。 */
  function refreshPreset(): void {
    if (!presetBtn) return;
    const isHandwritten = presetName === "handwritten";
    presetBtn.el.replaceChildren(
      svgIcon(isHandwritten ? DRAW_PATH : WORKSPACE_PREMIUM_PATH, 16),
    );
    presetBtn.el.setAttribute("aria-pressed", String(isHandwritten));
    presetBtn.el.style.color = INACTIVE_COLOR;
  }

  return {
    el,
    update(next) {
      if (next.outlineOpen !== undefined && next.outlineOpen !== outlineOpen) {
        outlineOpen = next.outlineOpen;
        applyActiveStyle(outlineBtn.el, outlineOpen);
        outlineBtn.el.setAttribute("aria-pressed", String(outlineOpen));
      }
      if (next.fontSize !== undefined && next.fontSize !== fontSize) {
        fontSize = next.fontSize;
        for (const { value, btn } of fontButtons) {
          const active = fontSize === value;
          applyActiveStyle(btn, active);
          btn.setAttribute("aria-pressed", String(active));
        }
      }
      if (next.presetName !== undefined && next.presetName !== presetName) {
        presetName = next.presetName;
        refreshPreset();
      }
    },
    destroy() {
      for (const tip of tooltips) tip.destroy();
      for (const btn of iconButtons) btn.destroy();
      for (const txt of texts) txt.destroy();
      tooltips.length = 0;
      iconButtons.length = 0;
      texts.length = 0;
    },
  };
}
