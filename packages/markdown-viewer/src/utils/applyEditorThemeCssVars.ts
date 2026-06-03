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
