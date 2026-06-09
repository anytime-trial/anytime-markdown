import {
  alpha,
  DEFAULT_DARK_BG,
  DEFAULT_DARK_CODE_BG,
  DEFAULT_LIGHT_BG,
  DEFAULT_LIGHT_CODE_BG,
  getActionActive,
  getActionHover,
  getActionSelected,
  getBgPaper,
  getDivider,
  getErrorMain,
  getPrimaryContrast,
  getPrimaryMain,
  getSuccessMain,
  getTextPrimary,
  getTextSecondary,
} from "../constants/colors";
import { getPreset, type ThemePresetName } from "../constants/themePresets";

/**
 * エディタのテーマ依存 CSS カスタムプロパティ（`--editor-*`）を
 * `document.documentElement` に適用するための共通ロジック。
 *
 * web-app（`providers.tsx`）と vscode 拡張（`webview/App.tsx`）で
 * 一字一句重複していた約 34 箇所の setProperty / removeProperty を集約する。
 * 唯一ホスト間で相違する「ライトモードの見出しボーダー色」は
 * {@link ApplyEditorThemeCssVarsOptions.headingBorderLight} で注入する。
 *
 * SSR / 非 DOM 環境では何もしない（`document` 未定義ガード）。
 */
export interface ApplyEditorThemeCssVarsOptions {
  presetName: ThemePresetName;
  themeMode: "light" | "dark";
  /**
   * ライトモード時の見出しボーダー色 `[h1, h2, h3]`。
   * 既定は web-app のニュートラル墨色。vscode 拡張は暖色を注入する。
   */
  headingBorderLight?: readonly [string, string, string];
  /** Google Fonts の動的読み込みを行うか（既定 true）。 */
  loadGoogleFonts?: boolean;
}

const DEFAULT_HEADING_BORDER_LIGHT = [
  "rgba(31,30,28,0.50)",
  "rgba(31,30,28,0.40)",
  "rgba(31,30,28,0.35)",
] as const;

const HEADING_BORDER_DARK = [
  "rgba(100,160,210,0.7)",
  "rgba(100,160,210,0.5)",
  "rgba(100,160,210,0.35)",
] as const;

const SYSTEM_FONTS = [
  "Helvetica",
  "Helvetica Neue",
  "Arial",
  "sans-serif",
  "serif",
  "Georgia",
  "Times New Roman",
  "Arial Rounded MT Bold",
  "Roboto",
];

const HANDWRITTEN_VARS = [
  "--editor-heading-hatch",
  "--editor-heading-radius-h1",
  "--editor-heading-radius-h2",
  "--editor-heading-radius-h3",
  "--editor-heading-filter",
  "--editor-heading-border-h1",
  "--editor-heading-border-h2",
  "--editor-heading-border-h3",
  "--editor-heading-font-family",
  "--editor-admonition-radius",
  "--editor-admonition-bg-note",
  "--editor-admonition-bg-tip",
  "--editor-admonition-bg-important",
  "--editor-admonition-bg-warning",
  "--editor-admonition-bg-caution",
];

function ensureRoughenFilter(): void {
  const filterId = "handwritten-roughen";
  if (document.getElementById(filterId)) return;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("id", filterId);
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.innerHTML = `<filter id="roughen"><feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" seed="1" /><feDisplacementMap in="SourceGraphic" scale="1.5" /></filter>`;
  document.body.appendChild(svg);
}

function loadPresetGoogleFonts(fontFamily: string, displayFont: string): void {
  const families = [
    ...new Set(
      [fontFamily, displayFont]
        .flatMap((s) => s.split(","))
        .map((s) => s.trim().replaceAll(/^["']|["']$/g, ""))
        .filter((f) => !SYSTEM_FONTS.includes(f)),
    ),
  ];
  if (families.length === 0) return;
  const id = "google-fonts-preset";
  document.getElementById(id)?.remove();
  const params = families
    .map((f) => `family=${f.replaceAll(" ", "+")}:wght@400;600;700`)
    .join("&");
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
  document.head.appendChild(link);
}

export function applyEditorThemeCssVars(
  options: ApplyEditorThemeCssVarsOptions,
): void {
  if (typeof document === "undefined") return;

  const { presetName, themeMode } = options;
  const headingBorderLight =
    options.headingBorderLight ?? DEFAULT_HEADING_BORDER_LIGHT;
  const loadGoogleFonts = options.loadGoogleFonts ?? true;

  const root = document.documentElement;
  const preset = getPreset(presetName);
  const isDark = themeMode === "dark";

  root.style.setProperty("--editor-content-font-family", preset.fontFamily);

  // chrome UI トークン（--am-color-*）。モード別の値を直接設定する（[data-theme] 非依存）。
  // 既存の color getter を単一箇所で CSS 変数化し、chrome コンポーネントから JS の
  // isDark 判定（useTheme 依存）を排除するための seam。
  root.style.setProperty("--am-color-divider", getDivider(isDark));
  root.style.setProperty("--am-color-text-primary", getTextPrimary(isDark));
  root.style.setProperty("--am-color-text-secondary", getTextSecondary(isDark));
  root.style.setProperty("--am-color-bg-paper", getBgPaper(isDark));
  // MUI ダークモードの elevation overlay。Paper を elevation に応じて白で持ち上げる挙動の
  // elevation 16 相当（temporary Drawer 既定）。light では overlay なし。
  // 値 0.145 は実行中テーマの MUI Drawer paper を getComputedStyle で実測した値
  // （MUI の getOverlayAlpha(16) 公式は 0.15。MUI を上げたら再実測すること）。
  // TODO: Dialog（elevation 24 ≒ 0.16）/ Menu（elevation 8 ≒ 0.12）は現状 overlay 非適用
  //   （VR 非対象のため flat 据え置き）。これらの dark VR を追加する際は同様の overlay が要る。
  root.style.setProperty(
    "--am-overlay-elevation-16",
    isDark ? "linear-gradient(rgba(255,255,255,0.145), rgba(255,255,255,0.145))" : "none",
  );
  root.style.setProperty("--am-color-action-hover", getActionHover(isDark));
  root.style.setProperty("--am-color-action-selected", getActionSelected(isDark));
  root.style.setProperty("--am-color-action-active", getActionActive(isDark));
  // MUI outlined input/select の枠線色（divider 0.12 ではなく 0.23）。ui/Select の VR 忠実性に必要。
  root.style.setProperty("--am-color-input-border", isDark ? "rgba(255,255,255,0.23)" : "rgba(0,0,0,0.23)");
  // MUI Switch(small) の off 状態（実測）。thumb=light #fff/dark #e0e0e0、track 地色=light #000/dark #fff、
  // track 不透明度=light 0.38/dark 0.3。on 状態は primary-main + track opacity 0.5。
  root.style.setProperty("--am-color-switch-thumb-off", isDark ? "#e0e0e0" : "#fff");
  root.style.setProperty("--am-color-switch-track-off", isDark ? "#fff" : "#000");
  root.style.setProperty("--am-switch-track-opacity-off", isDark ? "0.3" : "0.38");
  // MUI Skeleton 既定の地色 = alpha(text.primary, light 0.11 / dark 0.13)。
  root.style.setProperty("--am-color-skeleton-bg", alpha(getTextPrimary(isDark), isDark ? 0.13 : 0.11));
  root.style.setProperty("--am-color-primary-main", getPrimaryMain(isDark));
  root.style.setProperty("--am-color-primary-contrast", getPrimaryContrast(isDark));
  root.style.setProperty("--am-color-error-main", getErrorMain(isDark));
  root.style.setProperty("--am-color-success-main", getSuccessMain(isDark));
  // MUI Slider の rail 色 = primary.main の opacity 0.38。
  root.style.setProperty("--am-color-slider-rail", alpha(getPrimaryMain(isDark), 0.38));
  root.style.setProperty("--am-color-tooltip-bg", isDark ? "rgba(50,50,50,0.95)" : "rgba(40,40,40,0.92)");
  root.style.setProperty("--am-color-tooltip-text", "rgba(255,255,255,0.95)");
  // エディタ背景（既定）と差分インラインハイライト（removed=error / added=success、alpha 0.35）。
  // 旧 LinePreviewPanel の useTheme + @mui/material/styles alpha を排除するための seam。
  root.style.setProperty("--am-color-bg-default", isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG);
  // コードブロックの <pre> 背景。markdown-rich の native codeblock NodeView（反転）が
  // React context（useIsDark）を読めないため CSS 変数化する。
  root.style.setProperty("--am-color-code-bg", isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG);
  root.style.setProperty("--am-color-diff-removed-bg", alpha(getErrorMain(isDark), 0.35));
  root.style.setProperty("--am-color-diff-added-bg", alpha(getSuccessMain(isDark), 0.35));

  // chrome 寸法トークン（モード非依存・spec/12.design 準拠）。
  // Next.js のグローバル CSS import 制約を避けるため CSS ファイルではなく JS で注入する。
  root.style.setProperty("--am-space-1", "4px");
  root.style.setProperty("--am-space-2", "8px");
  root.style.setProperty("--am-space-3", "12px");
  root.style.setProperty("--am-space-4", "16px");
  root.style.setProperty("--am-radius-sm", "12px");
  root.style.setProperty("--am-radius-md", "8px");
  root.style.setProperty(
    "--am-elevation-3",
    "0 8px 10px -5px rgba(0,0,0,0.2), 0 16px 24px 2px rgba(0,0,0,0.14), 0 6px 30px 5px rgba(0,0,0,0.12)",
  );
  root.style.setProperty("--am-duration-fast", "150ms");
  root.style.setProperty("--am-ease-standard", "cubic-bezier(0.4, 0, 0.2, 1)");
  root.style.setProperty("--am-font-size-dialog-header", "0.875rem");

  if (presetName === "handwritten") {
    const lineColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    const baseColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
    root.style.setProperty(
      "--editor-heading-hatch",
      `repeating-linear-gradient(-45deg, transparent, transparent 4px, ${lineColor} 4px, ${lineColor} 5px), ${baseColor}`,
    );
    root.style.setProperty(
      "--editor-heading-font-family",
      '"Nunito", "Klee One", sans-serif',
    );

    const borders = isDark ? HEADING_BORDER_DARK : headingBorderLight;
    root.style.setProperty("--editor-heading-border-h1", borders[0]);
    root.style.setProperty("--editor-heading-border-h2", borders[1]);
    root.style.setProperty("--editor-heading-border-h3", borders[2]);

    root.style.setProperty("--editor-heading-radius-h1", "12px 8px 10px 6px");
    root.style.setProperty("--editor-heading-radius-h2", "8px 10px 6px 12px");
    root.style.setProperty("--editor-heading-radius-h3", "6px 8px 10px 4px");

    ensureRoughenFilter();
    root.style.setProperty("--editor-heading-filter", "url(#roughen)");

    const hatch = (color: string) =>
      `repeating-linear-gradient(-45deg, transparent, transparent 4px, ${color} 4px, ${color} 5px), ${isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"}`;
    root.style.setProperty("--editor-admonition-radius", "10px 6px 8px 12px");
    root.style.setProperty(
      "--editor-admonition-bg-note",
      hatch("rgba(31,111,235,0.08)"),
    );
    root.style.setProperty(
      "--editor-admonition-bg-tip",
      hatch("rgba(35,134,54,0.08)"),
    );
    root.style.setProperty(
      "--editor-admonition-bg-important",
      hatch("rgba(137,87,229,0.08)"),
    );
    root.style.setProperty(
      "--editor-admonition-bg-warning",
      hatch("rgba(210,153,34,0.08)"),
    );
    root.style.setProperty(
      "--editor-admonition-bg-caution",
      hatch("rgba(218,54,51,0.08)"),
    );
  } else {
    for (const cssVar of HANDWRITTEN_VARS) {
      root.style.removeProperty(cssVar);
    }
  }

  if (loadGoogleFonts) {
    loadPresetGoogleFonts(preset.fontFamily, preset.displayFont);
  }
}
