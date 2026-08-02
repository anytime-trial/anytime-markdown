import { applyChromeTokens as applyUiCoreChromeTokens } from "@anytime-markdown/ui-core/chromeTokens";

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
  getDiffAddedBlockBg,
  getDiffAddedCellBg,
  getDiffCollapseBg,
  getDiffCollapseBorder,
  getDiffCollapseFg,
  getDiffRemovedBlockBg,
  getDiffRemovedCellBg,
  getDivider,
  getErrorMain,
  getPrimaryContrast,
  getPrimaryMain,
  getSuccessMain,
  getTextPrimary,
  getTextSecondary,
  getWarningMain,
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

const GOOGLE_FONTS_LINK_ID = "google-fonts-preset";

/**
 * 既に注入済みの Google Fonts `<link>` を取り除く。
 *
 * Why not: 削除を `loadPresetGoogleFonts` の内側だけに置かない。`loadGoogleFonts: false`
 * で呼ばれたときに削除処理ごとスキップされ、一度注入された link が残ってしまう。
 * フラグは「このホストでは外部フォントを読まない」という指示なので、
 * 過去に注入されたものも取り消せなければ意味を成さない（webview の CSP 下では
 * 残った link が毎回ブロックされ続ける）。
 */
function removePresetGoogleFonts(): void {
  document.getElementById(GOOGLE_FONTS_LINK_ID)?.remove();
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
  const id = GOOGLE_FONTS_LINK_ID;
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

  // chrome（ツールバー / ドロワー / メニュー / ダイアログ）が参照する `--am-*` トークン群。
  // 単独利用（WC 自給）でも再利用できるよう applyChromeTokens に切り出している。
  applyChromeTokens(root, isDark);

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

  // 再適用のたびに一旦消してから、有効なときだけ入れ直す。
  // これで loadGoogleFonts の値が常に現在の状態と一致する。
  removePresetGoogleFonts();
  if (loadGoogleFonts) {
    loadPresetGoogleFonts(preset.fontFamily, preset.displayFont);
  }
}

/**
 * chrome（ツールバー / 設定ドロワー / メニュー / ダイアログ）が参照する `--am-*` トークンのみを
 * `root` に設定する。フォント preset（`--editor-*`）や Google Fonts 読込は含まない。
 * {@link applyEditorThemeCssVars} の内部実装であり、WC 単体利用時の自給（{@link ensureChromeTokens}）
 * からも再利用する。
 */
export function applyChromeTokens(root: HTMLElement, isDark: boolean): void {
  // 色の値は本パッケージの colors.ts が単一の出典。トークン名への写像と派生値
  // （slider rail / skeleton 地色 / switch の off 色等）の算出は ui-core が持つ
  // （graph-viewer 等 ui-core を使う他パッケージが同じ供給手段を使えるようにするため）。
  applyUiCoreChromeTokens(
    root,
    {
      divider: getDivider(isDark),
      textPrimary: getTextPrimary(isDark),
      textSecondary: getTextSecondary(isDark),
      bgPaper: getBgPaper(isDark),
      bgDefault: isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG,
      actionHover: getActionHover(isDark),
      actionSelected: getActionSelected(isDark),
      actionActive: getActionActive(isDark),
      primaryMain: getPrimaryMain(isDark),
      primaryContrast: getPrimaryContrast(isDark),
      errorMain: getErrorMain(isDark),
      successMain: getSuccessMain(isDark),
      warningMain: getWarningMain(isDark),
    },
    isDark,
  );

  // ここから下は markdown-editor 固有のトークン（エディタ本文・差分表示）。
  // chrome 共通ではないため ui-core へは移さない。
  // コードブロックの <pre> 背景。markdown-rich-editor の native codeblock NodeView（反転）が
  // React context（useIsDark）を読めないため CSS 変数化する。
  root.style.setProperty("--am-color-code-bg", isDark ? DEFAULT_DARK_CODE_BG : DEFAULT_LIGHT_CODE_BG);
  root.style.setProperty("--am-color-diff-removed-bg", alpha(getErrorMain(isDark), 0.35));
  root.style.setProperty("--am-color-diff-added-bg", alpha(getSuccessMain(isDark), 0.35));
  // changeGutter / diffHighlight のブロック・セルハイライト・collapse ウィジェット用トークン。
  root.style.setProperty("--am-color-diff-removed-block-bg", getDiffRemovedBlockBg(isDark));
  root.style.setProperty("--am-color-diff-added-block-bg", getDiffAddedBlockBg(isDark));
  root.style.setProperty("--am-color-diff-removed-cell-bg", getDiffRemovedCellBg(isDark));
  root.style.setProperty("--am-color-diff-added-cell-bg", getDiffAddedCellBg(isDark));
  root.style.setProperty("--am-color-diff-collapse-fg", getDiffCollapseFg(isDark));
  root.style.setProperty("--am-color-diff-collapse-bg", getDiffCollapseBg(isDark));
  root.style.setProperty("--am-color-diff-collapse-border", getDiffCollapseBorder(isDark));
}

/**
 * WC（`<anytime-markdown-editor>` 等）が、`applyEditorThemeCssVars` を呼ばない素の consumer
 * （ブラウザ拡張 / CDN）でも chrome 背景を不透明に保つための自給ヘルパ。
 *
 * host が既に `applyEditorThemeCssVars` で `document.documentElement` にトークンを注入済みなら
 * 何もしない（fill-if-missing）。これにより web-app（独自 preset / themeMode を注入）の
 * 値を上書きしない。`force` は自給した要素の theme 切替で再適用するために使う。
 *
 * @returns 実際にトークンを適用したら true（＝この要素がトークンを所有する）
 */
export function ensureChromeTokens(
  themeMode: "light" | "dark",
  options?: { readonly force?: boolean },
): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  const alreadyInjected =
    root.style.getPropertyValue("--am-color-bg-paper").trim() !== "";
  if (!options?.force && alreadyInjected) return false;
  applyChromeTokens(root, themeMode === "dark");
  return true;
}
