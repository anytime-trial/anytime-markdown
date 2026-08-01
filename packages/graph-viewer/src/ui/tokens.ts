/**
 * graph-viewer 自前 UI キットのテーマトークン。
 *
 * `@mui/material` のテーマ（`sx` の `"divider"` / `"primary.main"` 等）への依存を断つため、
 * `themeMode`（light/dark）から CSS カスタムプロパティ（`--gv-color-*`）を単一ソースで導出する。
 *
 * 色は graph-core の {@link getCanvasColors} を唯一の出典とする（design.md 準拠のキャンバス配色と
 * 完全一致させ、ドリフトを防ぐ）。各コンポーネントは個別色を `getCanvasColors(isDark)` から
 * 直接 `style` で渡すため、ここで導出する `--gv-*` 変数は UI キット内蔵 CSS の既定値として働く。
 *
 * `--gv-*` は `document.documentElement` へ適用する（Menu / Dialog / Tooltip が `document.body`
 * へポータルされるため）。プレフィックスが `--gv-*` なので他 viewer の `--sv-*` / `--dbv-*` /
 * `--am-*` とは衝突しない。
 *
 * ui-core コンポーネント用の `--am-color-*` は {@link chromeColorPalette} から供給するが、
 * web-app が documentElement に置く値と 4 種（text-primary / text-secondary / action-hover /
 * primary-contrast）で意図的に異なる（キャンバス配色と一致させるため）。documentElement に
 * 置くと web-app 全体の chrome 配色を奪うので、graph-viewer ルートへ**スコープして**適用する
 * （{@link applyGraphUiThemeVars} の `chromeRoot`）。ポータルされる ui-core 部品には
 * `portalTarget` で graph-viewer ルート配下を渡し、トークンの届く範囲に収める。
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';
import {
  applyChromeTokens,
  type ChromeColorPalette,
} from '@anytime-markdown/ui-core/chromeTokens';

export type GraphThemeMode = 'light' | 'dark';

export interface GraphPalette {
  /** パネル・ペーパー面の背景 */
  readonly bgPaper: string;
  /** モーダル・一段奥の背景 */
  readonly bgDefault: string;
  /** 本文テキスト */
  readonly textPrimary: string;
  /** 補足テキスト（ヘッダ等） */
  readonly textSecondary: string;
  /** 境界線 */
  readonly divider: string;
  /** ホバー背景 */
  readonly actionHover: string;
  /** 選択背景 */
  readonly actionSelected: string;
  /** インタラクティブ強調色（リンク・選択タブ・トグル） */
  readonly primaryMain: string;
  /** primaryMain 上に乗るテキスト色（contained ボタン等） */
  readonly primaryContrast: string;
  /** エラー色 */
  readonly errorMain: string;
}

export function getPalette(isDark: boolean): GraphPalette {
  const c = getCanvasColors(isDark);
  return {
    bgPaper: c.panelBg,
    bgDefault: c.modalBg,
    textPrimary: c.textPrimary,
    textSecondary: c.textSecondary,
    divider: c.panelBorder,
    actionHover: c.hoverBg,
    actionSelected: c.hoverBg,
    primaryMain: c.accentColor,
    // primaryMain（accentColor）上に乗るテキスト色。modalBg と同値のため単一ソース化。
    primaryContrast: c.modalBg,
    errorMain: isDark ? '#F44336' : '#6B2A20',
  };
}

/**
 * UI ルートへ適用する CSS カスタムプロパティ。
 * 自前 UI キットの各コンポーネント CSS（{@link injectGraphUiStyles}）はこれらの変数を参照する。
 */
export function themeCssVars(isDark: boolean): Record<string, string> {
  const p = getPalette(isDark);
  return {
    '--gv-color-bg-paper': p.bgPaper,
    '--gv-color-bg-default': p.bgDefault,
    '--gv-color-text-primary': p.textPrimary,
    '--gv-color-text-secondary': p.textSecondary,
    '--gv-color-divider': p.divider,
    '--gv-color-action-hover': p.actionHover,
    '--gv-color-action-selected': p.actionSelected,
    '--gv-color-primary-main': p.primaryMain,
    '--gv-color-primary-contrast': p.primaryContrast,
    '--gv-color-error-main': p.errorMain,
  };
}

/**
 * ui-core コンポーネントが読む `--am-color-*` トークンの元パレット。
 *
 * 出典は `--gv-*` と同じ {@link getPalette}（= getCanvasColors）で、キャンバス配色との一致を保つ。
 * GraphPalette に無い 3 スロットは次の根拠で埋める:
 * - `actionActive`: gv のメニューアイコン（`.gv-list-item-icon`）は text-secondary を使うため、
 *   ui-core 側で同スロットを担う action-active（ListItemIcon / Select 矢印）も同値にする
 *   （フェーズ3 移行時の視覚不変）
 * - `successMain` / `warningMain`: gv の UI キットに消費者が無い（Alert / Rating 未使用）。
 *   ui-core のスロットを埋めるための MUI 既定値
 */
export function chromeColorPalette(isDark: boolean): ChromeColorPalette {
  const p = getPalette(isDark);
  return {
    divider: p.divider,
    textPrimary: p.textPrimary,
    textSecondary: p.textSecondary,
    bgPaper: p.bgPaper,
    bgDefault: p.bgDefault,
    actionHover: p.actionHover,
    actionSelected: p.actionSelected,
    actionActive: p.textSecondary,
    primaryMain: p.primaryMain,
    primaryContrast: p.primaryContrast,
    errorMain: p.errorMain,
    successMain: isDark ? '#66BB6A' : '#2E7D32',
    warningMain: isDark ? '#FFA726' : '#ED6C02',
  };
}

/**
 * テーマトークンを適用する。SSR / 非 DOM 環境では何もしない。
 *
 * - `--gv-*`: `document.documentElement` へ（自前 UI キットのポータルが `document.body` 配下のため）
 * - `--am-*`（ui-core 用）: `chromeRoot` へスコープして適用する。documentElement に置くと
 *   web-app が供給する chrome 配色（値が 4 種異なる）を奪うため、graph-viewer ルートに閉じる
 */
export function applyGraphUiThemeVars(isDark: boolean, chromeRoot?: HTMLElement): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const vars = themeCssVars(isDark);
  for (const key of Object.keys(vars)) {
    root.style.setProperty(key, vars[key]);
  }
  if (chromeRoot) {
    applyChromeTokens(chromeRoot, chromeColorPalette(isDark), isDark);
    // gv メニュー意匠（旧 .gv-menu-item / .gv-list-item-icon）の寸法を ui-core の
    // メニュー系 CSS 変数で再現する（min-height なし・font 0.875rem・アイコン幅 28px）。
    // paper レベルの意匠差は ui/graphMenu.ts の paperStyle が担う。
    chromeRoot.style.setProperty('--am-menu-item-minh', '0px');
    chromeRoot.style.setProperty('--am-menu-item-font', '0.875rem');
    chromeRoot.style.setProperty('--am-menu-icon-minw', '28px');
  }
}

/** 境界線色を返す。 */
export function getDivider(isDark: boolean): string {
  return getPalette(isDark).divider;
}
