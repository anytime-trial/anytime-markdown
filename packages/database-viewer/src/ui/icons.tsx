import type { CSSProperties, ReactNode, SVGProps } from "react";

/**
 * vendored Material Design アイコン（Apache-2.0）。
 * @mui/icons-material 依存を切るため、database-viewer が使うアイコンの SVG 要素のみ自前化する。
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

/** MUI SvgIcon の semantic color 名 → CSS 値（dbv トークン）。生の CSS 色はそのまま通す。 */
const SEMANTIC_COLORS: Record<string, string> = {
  primary: "var(--dbv-color-primary-main)",
  secondary: "var(--dbv-color-text-secondary)",
  error: "var(--dbv-color-error-main)",
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

export const AddIcon = createIcon(<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" />, "Add");
export const CloseIcon = createIcon(
  <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />,
  "Close",
);
export const ExpandLessIcon = createIcon(<path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />, "ExpandLess");
export const ExpandMoreIcon = createIcon(<path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />, "ExpandMore");
export const StorageIcon = createIcon(
  <path d="M2 20h20v-4H2zm2-3h2v2H4zM2 4v4h20V4zm4 3H4V5h2zm-4 7h20v-4H2zm2-3h2v2H4z" />,
  "Storage",
);
export const ZoomInIcon = createIcon(
  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14m.5-7H9v2H7v1h2v2h1v-2h2V9h-2z" />,
  "ZoomIn",
);
export const ZoomOutIcon = createIcon(
  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14M7 9h5v1H7z" />,
  "ZoomOut",
);
export const CenterFocusStrongIcon = createIcon(
  <>
    <path d="M5 15H3v4c0 1.1.9 2 2 2h4v-2H5zM5 5h4V3H5c-1.1 0-2 .9-2 2v4h2zm14-2h-4v2h4v4h2V5c0-1.1-.9-2-2-2m0 16h-4v2h4c1.1 0 2-.9 2-2v-4h-2z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  "CenterFocusStrong",
);
