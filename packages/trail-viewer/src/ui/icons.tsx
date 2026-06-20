import type { CSSProperties, ReactNode, SVGProps } from "react";

/**
 * vendored Material Design アイコン（Apache-2.0）。
 * trail-viewer が使うアイコンの SVG 要素を自前定義する。
 * 出典: Material Symbols / Material Icons (https://fonts.google.com/icons), Apache License 2.0
 *
 * API は MUI SvgIcon の fontSize モデルを踏襲: svg は width/height=1em で、
 * fontSize（既定 1.5rem=24px）がアイコンの実寸を決める。data-testid は MUI 互換で
 * "<Name>Icon" を付与する。
 */
export type IconFontSize = number | "small" | "medium" | "large" | "inherit" | (string & {});

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "color"> {
  /** number→px、small=20px/medium=24px/large=35px、"inherit" や "1rem" 等の文字列も可。 */
  fontSize?: IconFontSize;
  /** currentColor（fill）に適用する色。MUI の sx color 相当。 */
  color?: string;
  style?: CSSProperties;
  className?: string;
}

export interface IconComponent {
  (props: Readonly<IconProps>): ReactNode;
  displayName?: string;
}

/** MUI SvgIcon の semantic color 名 → CSS 値（trv トークン）。生の CSS 色はそのまま通す。 */
const SEMANTIC_COLORS: Record<string, string> = {
  primary: "var(--trv-color-primary-main)",
  secondary: "var(--trv-color-text-secondary)",
  error: "var(--trv-color-error-main)",
  warning: "var(--trv-color-warning-main)",
  info: "var(--trv-color-info-main)",
  success: "var(--trv-color-success-main)",
  inherit: "inherit",
  disabled: "var(--trv-color-text-disabled)",
  action: "var(--trv-color-text-secondary)",
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

export function createIcon(body: ReactNode, name: string, viewBox = "0 0 24 24"): IconComponent {
  function Icon({ fontSize, color, style, className, ...props }: Readonly<IconProps>) {
    return (
      <svg
        width="1em"
        height="1em"
        viewBox={viewBox}
        fill="currentColor"
        focusable="false"
        aria-hidden="true"
        data-testid={`${name}Icon`}
        className={className}
        style={{ fontSize: resolveFontSize(fontSize), color: resolveColor(color), ...style }}
        {...props}
      >
        {body}
      </svg>
    );
  }
  Icon.displayName = `${name}Icon`;
  return Icon;
}

/* ---- Navigation / Arrows ---- */
export const ArrowDownward = createIcon(
  <path d="m20 12-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8z" />,
  "ArrowDownward",
);
export const ArrowUpward = createIcon(
  <path d="m4 12 1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8z" />,
  "ArrowUpward",
);
export const ChevronRight = createIcon(
  <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />,
  "ChevronRight",
);
export const KeyboardArrowDown = createIcon(
  <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />,
  "KeyboardArrowDown",
);
export const KeyboardArrowUp = createIcon(
  <path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" />,
  "KeyboardArrowUp",
);
export const ExpandLess = createIcon(
  <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />,
  "ExpandLess",
);
export const ExpandMore = createIcon(
  <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />,
  "ExpandMore",
);
export const SkipNext = createIcon(
  <path d="M6 18l8.5-6L6 6zm8.5 0H17V6h-2.5z" />,
  "SkipNext",
);
export const SkipPrevious = createIcon(
  <path d="M6 6h2.5v12H6zm3.5 6 8.5 6V6z" />,
  "SkipPrevious",
);
export const OpenInNew = createIcon(
  <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z" />,
  "OpenInNew",
);
export const TrendingUp = createIcon(
  <path d="m16 6 2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />,
  "TrendingUp",
);

/* ---- Actions ---- */
export const Add = createIcon(
  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />,
  "Add",
);
export const Check = createIcon(
  <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />,
  "Check",
);
export const Close = createIcon(
  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />,
  "Close",
);
export const Clear = createIcon(
  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />,
  "Clear",
);
export const Search = createIcon(
  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />,
  "Search",
);
export const ContentCopy = createIcon(
  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z" />,
  "ContentCopy",
);
export const Delete = createIcon(
  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z" />,
  "Delete",
);
export const DeleteSweep = createIcon(
  <>
    <path d="M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3z" />
    <path d="M14 5h-3l-1-1H6L5 5H2v2h12z" />
  </>,
  "DeleteSweep",
);
export const Send = createIcon(
  <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />,
  "Send",
);
export const Stop = createIcon(
  <path d="M6 6h12v12H6z" />,
  "Stop",
);
export const PlayArrow = createIcon(
  <path d="M8 5v14l11-7z" />,
  "PlayArrow",
);
export const Pause = createIcon(
  <path d="M6 19h4V5H6zm8-14v14h4V5z" />,
  "Pause",
);
export const Cached = createIcon(
  <path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6a5.87 5.87 0 0 1-2.8-.7l-1.46 1.46A7.93 7.93 0 0 0 12 20c4.42 0 8-3.58 8-8h3zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46A7.93 7.93 0 0 0 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4z" />,
  "Cached",
);
export const FilterAltOff = createIcon(
  <>
    <path d="M8.73 8.73 4 4H2v2l5.27 5.27zM14 14v5l-4-4v-1.17l-2-2V17l4 5v-8l2.73 2.73L16 19v-2.17zM2.41 1.6 1 3l3 3H2v2l5.27 5.27L7 13h2v-2.27L22 24l1.41-1.41z" />
  </>,
  "FilterAltOff",
);
export const Link = createIcon(
  <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1M8 13h8v-2H8zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5" />,
  "Link",
);

/* ---- Fullscreen ---- */
export const Fullscreen = createIcon(
  <path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z" />,
  "Fullscreen",
);
export const FullscreenExit = createIcon(
  <path d="M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z" />,
  "FullscreenExit",
);

/* ---- Status / People ---- */
export const Person = createIcon(
  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4m0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />,
  "Person",
);
export const SmartToy = createIcon(
  <>
    <path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3z" />
    <circle cx="8.5" cy="13.5" r="1.5" fill="white" />
    <circle cx="15.5" cy="13.5" r="1.5" fill="white" />
    <path d="M8 17h8v-1.5H8z" fill="white" />
  </>,
  "SmartToy",
);
export const HelpOutline = createIcon(
  <path d="M11 18h2v-2h-2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" />,
  "HelpOutline",
);
export const Public = createIcon(
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />,
  "Public",
);

/* ---- Dev / System ---- */
export const Build = createIcon(
  <path d="M13.783 11.642c.44-.44.44-1.152 0-1.592L11.95 8.217c-.44-.44-1.152-.44-1.592 0L9 9.575l1.633 1.633.725-.725.633.633-.725.725 1.2 1.2zm4.217.358L16 10V6l-2 .001-2 2v4l2 2 4-2.001zm-10-4H4v2h4V8zM20 5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5zm-2 14H4V5h14v14z" />,
  "Build",
);
export const Commit = createIcon(
  <path d="M17 12c0 2.76-2.24 5-5 5s-5-2.24-5-5 2.24-5 5-5 5 2.24 5 5M1 13h8.27c.46 2.83 2.9 5 5.73 5s5.27-2.17 5.73-5H23v-2h-2.27C20.27 8.17 17.83 6 15 6s-5.27 2.17-5.73 5H1z" />,
  "Commit",
);
export const Settings = createIcon(
  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.47.47 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />,
  "Settings",
);
export const Code = createIcon(
  <path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z" />,
  "Code",
);
export const Extension = createIcon(
  <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z" />,
  "Extension",
);
export const SyncProblem = createIcon(
  <>
    <path d="M3 12c0 2.21.91 4.2 2.36 5.64L3 20h6v-6l-2.24 2.24C5.68 15.15 5 13.66 5 12c0-2.61 1.67-4.83 4-5.65V4.26C5.55 5.15 3 8.27 3 12zm7 .5h2V7h-2zm0 4h2v-2h-2zM21 4h-6v6l2.24-2.24C18.32 8.85 19 10.34 19 12c0 2.61-1.67 4.83-4 5.65v2.09c3.45-.89 6-4.01 6-7.74 0-2.21-.91-4.2-2.36-5.64z" />
  </>,
  "SyncProblem",
);

/* ---- Graph / Data Viz ---- */
export const AccountTree = createIcon(
  <path d="M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z" />,
  "AccountTree",
);
export const Hub = createIcon(
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m-1-9H7v2h4v4h2v-4h4v-2h-4V7h-2z" />,
  "Hub",
);
export const GroupWork = createIcon(
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2M8 17.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5M9.5 8c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5S9.5 9.38 9.5 8M16 17.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />,
  "GroupWork",
);
export const Layers = createIcon(
  <path d="m11.99 18.54-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27z" />,
  "Layers",
);
export const ScatterPlot = createIcon(
  <>
    <circle cx="7" cy="14" r="3" />
    <circle cx="11" cy="6" r="3" />
    <circle cx="17" cy="17" r="3" />
  </>,
  "ScatterPlot",
);
export const Timeline = createIcon(
  <path d="M23 8c0 1.1-.9 2-2 2a1.7 1.7 0 0 1-.51-.07l-3.56 3.55c.05.16.07.34.07.52 0 1.1-.9 2-2 2s-2-.9-2-2c0-.18.02-.36.07-.52l-2.55-2.55c-.16.05-.34.07-.52.07s-.36-.02-.52-.07l-4.55 4.56c.05.16.07.33.07.51 0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2c.18 0 .35.02.51.07l4.56-4.55C8.02 9.36 8 9.18 8 9c0-1.1.9-2 2-2s2 .9 2 2c0 .18-.02.36-.07.52l2.55 2.55c.16-.05.34-.07.52-.07s.36.02.52.07l3.55-3.56A1.7 1.7 0 0 1 19 8c0-1.1.9-2 2-2s2 .9 2 2z" />,
  "Timeline",
);
export const TrendingUpIcon = TrendingUp;

/* ---- Inventory / Storage ---- */
export const Apartment = createIcon(
  <path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11zM7 19H5v-2h2zm0-4H5v-2h2zm0-4H5v-2h2zm4 4H9v-2h2zm0-4H9v-2h2zm0-4H9V7h2zm4 8h-2v-2h2zm0-4h-2v-2h2zm0-4h-2V7h2zm4 8h-2v-2h2zm0-4h-2v-2h2z" />,
  "Apartment",
);
export const Inventory2 = createIcon(
  <>
    <path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.72V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.72c.57-.38 1-.99 1-1.71V4c0-1.1-1-2-2-2m-5 12H9v-2h6zm5-8H4V4h16z" />
  </>,
  "Inventory2",
);
export const TableChart = createIcon(
  <path d="M10 10.02h5V21h-5zM17 21h3c1.1 0 2-.9 2-2v-9h-5zM3 21h5V10H3v9c0 1.1.9 2 2 2zm-2-11h9V3H1zM11 3v7h12V3z" />,
  "TableChart",
);
export const Tour = createIcon(
  <path d="M21 4h-7V2H10v2H3v17h2v-7h5v2h8l2 2v-4h1zm-3 6h-6V8h6z" />,
  "Tour",
);
