/**
 * ui-core コンポーネントが読む `--am-color-*` / `--am-*` トークンの供給。
 *
 * ui-core の各ファクトリは `--am-color-*` を参照してテーマ追従するが、これまでその値を
 * 書き出せるのは markdown-editor の `applyChromeTokens` だけだった。共通層が供給手段を
 * 持たないため、graph-viewer / database-viewer / spreadsheet-viewer は ui-core を使えず
 * 各自の UI キット（`--gv-*` / `--dbv-*` / `--sv-*`）を持つ構造になっていた。
 *
 * 本モジュールは「パレットを受け取ってトークンを書き出す」責務だけを持つ。色の**値**は
 * 各パッケージが決める（graph-viewer はキャンバス配色 `getCanvasColors` と一致させる必要が
 * あるため、値の共通化はしない）。
 */

/** 色に不透明度を適用して `rgba()` を返す（MUI の `alpha` 代替・非 MUI）。 */
export function alpha(color: string, opacity: number): string {
  const o = Math.max(0, Math.min(1, opacity));
  const trimmed = color.trim();
  const round = (n: number): number => Math.round(n * 1000) / 1000;

  const hexMatch = /^#([0-9a-fA-F]{3,8})$/.exec(trimmed);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    const baseA = h.length >= 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1;
    return `rgba(${r}, ${g}, ${b}, ${round(baseA * o)})`;
  }

  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(trimmed);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((p) => p.trim());
    const baseA = parts.length >= 4 ? Number(parts[3]) : 1;
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${round(baseA * o)})`;
  }

  return color;
}

/**
 * chrome トークンの元になる色。各パッケージが自前のテーマから組んで渡す。
 *
 * ここに無い派生トークン（slider rail・skeleton 地色・switch の off 色等）は
 * 本モジュールが `isDark` とこのパレットから導出する。
 */
export interface ChromeColorPalette {
  readonly divider: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly bgPaper: string;
  readonly bgDefault: string;
  readonly actionHover: string;
  readonly actionSelected: string;
  readonly actionActive: string;
  readonly primaryMain: string;
  readonly primaryContrast: string;
  readonly errorMain: string;
  readonly successMain: string;
  readonly warningMain: string;
}

/**
 * 色トークン（`--am-color-*` とその派生）を root へ適用する。
 *
 * 派生値のマジックナンバーは MUI 実測由来で、markdown-editor から移設した際の値を保つ
 * （変えると既存 chrome の見た目が動く）。
 */
export function applyChromeColorTokens(
  root: HTMLElement,
  palette: ChromeColorPalette,
  isDark: boolean,
): void {
  const set = (name: string, value: string): void => root.style.setProperty(name, value);

  set("--am-color-divider", palette.divider);
  set("--am-color-text-primary", palette.textPrimary);
  set("--am-color-text-secondary", palette.textSecondary);
  set("--am-color-bg-paper", palette.bgPaper);
  set("--am-color-bg-default", palette.bgDefault);
  set("--am-color-action-hover", palette.actionHover);
  set("--am-color-action-selected", palette.actionSelected);
  set("--am-color-action-active", palette.actionActive);
  set("--am-color-primary-main", palette.primaryMain);
  set("--am-color-primary-contrast", palette.primaryContrast);
  set("--am-color-error-main", palette.errorMain);
  set("--am-color-success-main", palette.successMain);
  set("--am-color-warning-main", palette.warningMain);

  // MUI ダークモードの elevation overlay（elevation 16 相当 = temporary Drawer 既定）。
  // 0.145 は実行中テーマの MUI Drawer paper を getComputedStyle で実測した値。
  set(
    "--am-overlay-elevation-16",
    isDark ? "linear-gradient(rgba(255,255,255,0.145), rgba(255,255,255,0.145))" : "none",
  );
  // MUI outlined input/select の枠線色（divider の 0.12 ではなく 0.23）。
  set("--am-color-input-border", isDark ? "rgba(255,255,255,0.23)" : "rgba(0,0,0,0.23)");
  // MUI Switch(small) の off 状態（実測）。on 状態は primary-main + track opacity 0.5。
  set("--am-color-switch-thumb-off", isDark ? "#e0e0e0" : "#fff");
  set("--am-color-switch-track-off", isDark ? "#fff" : "#000");
  set("--am-switch-track-opacity-off", isDark ? "0.3" : "0.38");
  // MUI Skeleton 既定の地色 = alpha(text.primary, light 0.11 / dark 0.13)。
  set("--am-color-skeleton-bg", alpha(palette.textPrimary, isDark ? 0.13 : 0.11));
  // MUI Slider の rail 色 = primary.main の opacity 0.38。
  set("--am-color-slider-rail", alpha(palette.primaryMain, 0.38));
  set("--am-color-tooltip-bg", isDark ? "rgba(50,50,50,0.95)" : "rgba(40,40,40,0.92)");
  set("--am-color-tooltip-text", "rgba(255,255,255,0.95)");
}

/**
 * 寸法・モーション系トークン（モード非依存・spec/12.design 準拠）を root へ適用する。
 *
 * Next.js のグローバル CSS import 制約を避けるため CSS ファイルではなく JS で注入する。
 */
export function applyChromeDimensionTokens(root: HTMLElement): void {
  const set = (name: string, value: string): void => root.style.setProperty(name, value);

  set("--am-space-1", "4px");
  set("--am-space-2", "8px");
  set("--am-space-3", "12px");
  set("--am-space-4", "16px");
  set("--am-radius-sm", "12px");
  set("--am-radius-md", "8px");
  set(
    "--am-elevation-3",
    "0 8px 10px -5px rgba(0,0,0,0.2), 0 16px 24px 2px rgba(0,0,0,0.14), 0 6px 30px 5px rgba(0,0,0,0.12)",
  );
  set("--am-duration-fast", "150ms");
  set("--am-ease-standard", "cubic-bezier(0.4, 0, 0.2, 1)");
  set("--am-font-size-dialog-header", "0.875rem");
}

/**
 * 色・寸法トークンをまとめて適用する（消費側の既定経路）。
 */
export function applyChromeTokens(
  root: HTMLElement,
  palette: ChromeColorPalette,
  isDark: boolean,
): void {
  applyChromeColorTokens(root, palette, isDark);
  applyChromeDimensionTokens(root);
}
