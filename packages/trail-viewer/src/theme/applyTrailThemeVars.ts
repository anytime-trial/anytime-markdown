/**
 * trail-viewer の vanilla UI（@anytime-markdown/ui-core ベース）が参照する
 * `--am-color-*` CSS カスタムプロパティを `document.documentElement` へ注入する。
 *
 * vanilla 化以前のホストは `--trv-color-*`（旧自前 UI キット）のみ注入していたが、
 * 素 DOM 化したコンポーネントは ui-core 同様 `--am-color-*` を参照する。両ホスト
 * （拡張 webview / web-app）はこの関数を isDark 変化時に呼ぶ必要がある。
 *
 * Menu / Tooltip / Dialog は `document.body` へポータルされるため、変数は
 * documentElement に置く（ポータル先まで継承される）。後方互換のため `--trv-color-*`
 * も併せて設定する（残存する React island 等が参照する可能性に備える）。
 *
 * 値は trail-viewer のブランドパレット（{@link getTokens} = `theme/designTokens`）に準拠。
 * 構造トークン（tooltip / slider / switch / skeleton / input）は markdown-viewer の
 * `applyEditorThemeCssVars` と同値にして ui-core プリミティブの見た目を揃える。
 */
import { getTokens } from './designTokens';

/** `--am-color-*` + `--trv-color-*` の完全セットを isDark から導出する。 */
export function trailThemeCssVars(isDark: boolean): Record<string, string> {
  const { colors } = getTokens(isDark);
  const primaryContrast = isDark ? 'rgba(0,0,0,0.87)' : '#FFFFFF';
  const am: Record<string, string> = {
    // 背景 / テキスト / 区切り
    '--am-color-bg-default': colors.midnightNavy,
    '--am-color-bg-paper': colors.charcoal,
    '--am-color-text-primary': colors.textPrimary,
    '--am-color-text-secondary': colors.textSecondary,
    '--am-color-text-disabled': colors.textDisabled,
    '--am-color-divider': colors.border,
    '--am-color-border': colors.border,
    // action 状態
    '--am-color-action-hover': colors.hoverBg,
    '--am-color-action-selected': colors.activeBg,
    '--am-color-action-active': isDark ? 'rgba(255,255,255,0.56)' : 'rgba(0,0,0,0.54)',
    '--am-color-action-disabled': colors.textDisabled,
    // primary / accent
    '--am-color-primary-main': colors.iceBlue,
    '--am-color-primary': colors.iceBlue,
    '--am-color-accent': colors.iceBlue,
    '--am-color-primary-contrast': primaryContrast,
    '--am-color-primary-bg': colors.iceBlueBg,
    // semantic
    '--am-color-error-main': colors.error,
    '--am-color-warning-main': colors.warning,
    '--am-color-warning': colors.warning,
    '--am-color-info-main': colors.info,
    '--am-color-info-bg': colors.infoBg,
    '--am-color-success-main': colors.success,
    // 構造トークン（markdown-viewer applyEditorThemeCssVars と同値）
    '--am-color-input-border': isDark ? 'rgba(255,255,255,0.23)' : 'rgba(0,0,0,0.23)',
    '--am-color-skeleton-bg': isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.11)',
    '--am-color-slider-rail': isDark ? 'rgba(144,202,249,0.38)' : 'rgba(25,118,210,0.38)',
    '--am-color-switch-thumb-off': isDark ? '#e0e0e0' : '#fff',
    '--am-color-switch-track-off': isDark ? '#fff' : '#000',
    '--am-color-tooltip-bg': isDark ? 'rgba(50,50,50,0.95)' : 'rgba(40,40,40,0.92)',
    '--am-color-tooltip-text': 'rgba(255,255,255,0.95)',
  };
  // 後方互換: 旧 `--trv-color-*`（同値）も設定する。
  const trv: Record<string, string> = {
    '--trv-color-bg-paper': colors.charcoal,
    '--trv-color-bg-default': colors.midnightNavy,
    '--trv-color-text-primary': colors.textPrimary,
    '--trv-color-text-secondary': colors.textSecondary,
    '--trv-color-text-disabled': colors.textDisabled,
    '--trv-color-divider': colors.border,
    '--trv-color-action-hover': colors.hoverBg,
    '--trv-color-action-selected': colors.activeBg,
    '--trv-color-section-bg': colors.sectionBg,
    '--trv-color-primary-main': colors.iceBlue,
    '--trv-color-primary-contrast': primaryContrast,
    '--trv-color-primary-bg': colors.iceBlueBg,
    '--trv-color-primary-border': colors.iceBlueBorder,
    '--trv-color-error-main': colors.error,
    '--trv-color-warning-main': colors.warning,
    '--trv-color-info-main': colors.info,
    '--trv-color-success-main': colors.success,
  };
  return { ...am, ...trv };
}

/**
 * テーマ変数を `document.documentElement` へ適用する。SSR / 非 DOM 環境では no-op。
 * ホスト（拡張 webview / web-app）の isDark 変化時に呼ぶ。
 */
export function applyTrailThemeVars(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const vars = trailThemeCssVars(isDark);
  for (const key of Object.keys(vars)) {
    root.style.setProperty(key, vars[key]);
  }
}
