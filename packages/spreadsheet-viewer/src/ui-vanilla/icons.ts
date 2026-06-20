/**
 * vendored Material Design アイコン（Apache-2.0）の vanilla 版。
 * 出典: Material Symbols / Material Icons (https://fonts.google.com/icons), Apache License 2.0
 *
 * React 版 ui/icons.tsx と同一の path データ・同一の DOM 属性
 * （width/height=1em・fill=currentColor・data-testid="<Name>Icon"）を生成する。
 */

/** number→px、small=20px/medium=24px/large=35px、"inherit" や "1rem" 等の文字列も可。 */
export type IconFontSize = number | "small" | "medium" | "large" | "inherit" | (string & {});

export const ICON_PATHS = {
  Add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z",
  ArrowUpward: "m4 12 1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8z",
  ArrowDownward: "M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8z",
  Check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  ContentCopy:
    "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z",
  ContentCut:
    "M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2m0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2m6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5M19 3l-6 6 2 2 7-7V3z",
  ContentPaste:
    "M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1m7 18H5V4h2v3h10V4h2z",
  Delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z",
  Download: "M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z",
  Upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
  FilterList: "M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z",
  FilterListOff:
    "M10.83 8H21V6H8.83zm5 5H18v-2h-4.17zM14 16.83V18h-4v-2h3.17l-3-3H6v-2h2.17l-3-3H3V6h.17L1.39 4.22 2.8 2.81l18.38 18.38-1.41 1.41z",
  FirstPage: "M18.41 16.59 13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z",
  LastPage: "M5.59 7.41 10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z",
  KeyboardArrowLeft: "M15.41 16.59 10.83 12l4.58-4.59L14 6l-6 6 6 6z",
  KeyboardArrowRight: "M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z",
  FormatAlignCenter: "M7 15v2h10v-2zm-4 6h18v-2H3zm0-8h18v-2H3zm4-6v2h10V7zM3 3v2h18V3z",
  FormatAlignLeft: "M15 15H3v2h12zm0-8H3v2h12zM3 13h18v-2H3zm0 8h18v-2H3zM3 3v2h18V3z",
  FormatAlignRight: "M3 21h18v-2H3zm6-4h12v-2H9zm-6-4h18v-2H3zm6-4h12V7H9zM3 3v2h18V3z",
  Settings:
    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6",
  /** Material Icons: bar_chart — Apache-2.0 */
  BarChart: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
} as const;

export type SvIconName = keyof typeof ICON_PATHS;

const SEMANTIC_COLORS: Record<string, string> = {
  primary: "var(--sv-color-primary-main)",
  secondary: "var(--sv-color-text-secondary)",
  error: "var(--sv-color-error-main)",
  inherit: "inherit",
};

function resolveColor(color?: string): string | undefined {
  if (color == null) return undefined;
  return SEMANTIC_COLORS[color] ?? color;
}

function resolveFontSize(fontSize?: IconFontSize): string {
  if (fontSize == null) return "1.5rem";
  if (typeof fontSize === "number") return `${fontSize}px`;
  switch (fontSize) {
    case "small":
      return "1.25rem";
    case "medium":
      return "1.5rem";
    case "large":
      return "2.1875rem";
    default:
      return fontSize;
  }
}

export interface SvIconOptions {
  fontSize?: IconFontSize;
  /** semantic 名（primary/secondary/error/inherit）または生 CSS 色。 */
  color?: string;
  className?: string;
}

/** React 版 createIcon と同一 DOM の SVG 要素を生成する。 */
export function svIcon(name: SvIconName, options: SvIconOptions = {}): SVGSVGElement {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "1em");
  svg.setAttribute("height", "1em");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.testid = `${name}Icon`;
  if (options.className) svg.setAttribute("class", options.className);
  svg.style.fontSize = resolveFontSize(options.fontSize);
  const color = resolveColor(options.color);
  if (color) svg.style.color = color;
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}
