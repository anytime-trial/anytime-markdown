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
 * graph-viewer は host が `--am-color-*` を注入しないため、これらのトークンは
 * `document.documentElement` へ直接適用して自己完結させる（{@link applyGraphUiThemeVars}）。
 * Menu / Dialog / Tooltip は `document.body` へポータルされるため documentElement に置く必要がある。
 * プレフィックスが `--gv-*` なので他 viewer の `--sv-*` / `--dbv-*` / `--am-*` とは衝突しない。
 */

import { getCanvasColors } from '@anytime-markdown/graph-core';

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
 * テーマトークンを `document.documentElement` に適用する。
 *
 * Menu / Dialog / Tooltip は `document.body` へポータルされるため、ポータル先まで確実に変数を
 * 行き渡らせるために documentElement へ設定する。SSR / 非 DOM 環境では何もしない。
 */
export function applyGraphUiThemeVars(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const vars = themeCssVars(isDark);
  for (const key of Object.keys(vars)) {
    root.style.setProperty(key, vars[key]);
  }
}

/** 境界線色を返す。 */
export function getDivider(isDark: boolean): string {
  return getPalette(isDark).divider;
}
