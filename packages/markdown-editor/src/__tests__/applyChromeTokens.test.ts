/**
 * applyChromeTokens の特性化テスト。
 *
 * トークンの実体を ui-core の chromeTokens へ移設した際、書き出される 42 個の値が
 * 1 つも変わっていないことを固定する。ここが変わると chrome 全体の見た目が動く。
 * 期待値は移設前の実装の出力をそのまま採取したもの。
 */

import { applyChromeTokens } from "../utils/applyEditorThemeCssVars";

const EXPECTED_DARK: Record<string, string> = {
  "--am-color-divider": "rgba(255,255,255,0.12)",
  "--am-color-text-primary": "#ffffffde",
  "--am-color-text-secondary": "#ffffff99",
  "--am-color-bg-paper": "#121212",
  "--am-overlay-elevation-16": "linear-gradient(rgba(255,255,255,0.145), rgba(255,255,255,0.145))",
  "--am-color-action-hover": "rgba(255,255,255,0.08)",
  "--am-color-action-selected": "rgba(255,255,255,0.16)",
  "--am-color-action-active": "#fff",
  "--am-color-input-border": "rgba(255,255,255,0.23)",
  "--am-color-switch-thumb-off": "#e0e0e0",
  "--am-color-switch-track-off": "#fff",
  "--am-switch-track-opacity-off": "0.3",
  "--am-color-skeleton-bg": "rgba(255, 255, 255, 0.113)",
  "--am-color-primary-main": "#90caf9",
  "--am-color-primary-contrast": "rgba(0,0,0,0.87)",
  "--am-color-error-main": "#f44336",
  "--am-color-success-main": "#66bb6a",
  "--am-color-warning-main": "#9B7BD8",
  "--am-color-slider-rail": "rgba(144, 202, 249, 0.38)",
  "--am-color-tooltip-bg": "rgba(50,50,50,0.95)",
  "--am-color-tooltip-text": "rgba(255,255,255,0.95)",
  "--am-color-bg-default": "#0D1117",
  "--am-color-code-bg": "#161B22",
  "--am-color-diff-removed-bg": "rgba(244, 67, 54, 0.35)",
  "--am-color-diff-added-bg": "rgba(102, 187, 106, 0.35)",
  "--am-color-diff-removed-block-bg": "rgba(244, 67, 54, 0.1)",
  "--am-color-diff-added-block-bg": "rgba(102, 187, 106, 0.1)",
  "--am-color-diff-removed-cell-bg": "rgba(244, 67, 54, 0.18)",
  "--am-color-diff-added-cell-bg": "rgba(102, 187, 106, 0.18)",
  "--am-color-diff-collapse-fg": "rgba(176,176,176,0.9)",
  "--am-color-diff-collapse-bg": "rgba(255,255,255,0.06)",
  "--am-color-diff-collapse-border": "rgba(255,255,255,0.25)",
  "--am-space-1": "4px",
  "--am-space-2": "8px",
  "--am-space-3": "12px",
  "--am-space-4": "16px",
  "--am-radius-sm": "12px",
  "--am-radius-md": "8px",
  "--am-elevation-3": "0 8px 10px -5px rgba(0,0,0,0.2), 0 16px 24px 2px rgba(0,0,0,0.14), 0 6px 30px 5px rgba(0,0,0,0.12)",
  "--am-duration-fast": "150ms",
  "--am-ease-standard": "cubic-bezier(0.4, 0, 0.2, 1)",
  "--am-font-size-dialog-header": "0.875rem",
};

const EXPECTED_LIGHT: Record<string, string> = {
  "--am-color-divider": "rgba(31,30,28,0.12)",
  "--am-color-text-primary": "#1F1E1C",
  "--am-color-text-secondary": "#5C5A55",
  "--am-color-bg-paper": "#FBF9F3",
  "--am-overlay-elevation-16": "none",
  "--am-color-action-hover": "rgba(31,30,28,0.04)",
  "--am-color-action-selected": "rgba(31,30,28,0.08)",
  "--am-color-action-active": "rgba(0,0,0,0.54)",
  "--am-color-input-border": "rgba(0,0,0,0.23)",
  "--am-color-switch-thumb-off": "#fff",
  "--am-color-switch-track-off": "#000",
  "--am-switch-track-opacity-off": "0.38",
  "--am-color-skeleton-bg": "rgba(31, 30, 28, 0.11)",
  "--am-color-primary-main": "#3D4A52",
  "--am-color-primary-contrast": "#FBF9F3",
  "--am-color-error-main": "#6B2A20",
  "--am-color-success-main": "#4B5A3E",
  "--am-color-warning-main": "#4A5A6B",
  "--am-color-slider-rail": "rgba(61, 74, 82, 0.38)",
  "--am-color-tooltip-bg": "rgba(40,40,40,0.92)",
  "--am-color-tooltip-text": "rgba(255,255,255,0.95)",
  "--am-color-bg-default": "#F2EFE8",
  "--am-color-code-bg": "#EBE8DF",
  "--am-color-diff-removed-bg": "rgba(107, 42, 32, 0.35)",
  "--am-color-diff-added-bg": "rgba(75, 90, 62, 0.35)",
  "--am-color-diff-removed-block-bg": "rgba(107, 42, 32, 0.1)",
  "--am-color-diff-added-block-bg": "rgba(75, 90, 62, 0.1)",
  "--am-color-diff-removed-cell-bg": "rgba(107, 42, 32, 0.18)",
  "--am-color-diff-added-cell-bg": "rgba(75, 90, 62, 0.18)",
  "--am-color-diff-collapse-fg": "rgba(90,90,90,0.9)",
  "--am-color-diff-collapse-bg": "rgba(0,0,0,0.05)",
  "--am-color-diff-collapse-border": "rgba(0,0,0,0.25)",
  "--am-space-1": "4px",
  "--am-space-2": "8px",
  "--am-space-3": "12px",
  "--am-space-4": "16px",
  "--am-radius-sm": "12px",
  "--am-radius-md": "8px",
  "--am-elevation-3": "0 8px 10px -5px rgba(0,0,0,0.2), 0 16px 24px 2px rgba(0,0,0,0.14), 0 6px 30px 5px rgba(0,0,0,0.12)",
  "--am-duration-fast": "150ms",
  "--am-ease-standard": "cubic-bezier(0.4, 0, 0.2, 1)",
  "--am-font-size-dialog-header": "0.875rem",
};

function dump(isDark: boolean): Record<string, string> {
  const el = document.createElement("div");
  applyChromeTokens(el, isDark);
  const map: Record<string, string> = {};
  for (let i = 0; i < el.style.length; i++) {
    const name = el.style.item(i);
    map[name] = el.style.getPropertyValue(name);
  }
  return map;
}

describe("applyChromeTokens", () => {
  it("dark で書き出すトークンが移設前と一致する", () => {
    expect(dump(true)).toEqual(EXPECTED_DARK);
  });

  it("light で書き出すトークンが移設前と一致する", () => {
    expect(dump(false)).toEqual(EXPECTED_LIGHT);
  });

  it("dark と light で同じトークン集合を書く（片方だけ欠けない）", () => {
    expect(Object.keys(dump(true)).sort()).toEqual(Object.keys(dump(false)).sort());
  });
});
