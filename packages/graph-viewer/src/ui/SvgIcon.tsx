import type { CSSProperties, ReactNode, SVGProps } from 'react';

/**
 * vendored Material Design アイコン基盤（Apache-2.0）。
 * @mui/material/SvgIcon・@mui/icons-material 依存を切るため、graph-viewer が使うアイコンの
 * SVG 要素のみ自前化する。出典: Material Symbols / Material Icons (https://fonts.google.com/icons)。
 *
 * API は MUI SvgIcon の fontSize モデルを踏襲: svg は width/height=1em で、
 * fontSize（既定 1.5rem=24px）がアイコンの実寸を決める。
 */
export type IconFontSize = number | 'small' | 'medium' | 'large' | 'inherit' | (string & {});

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  /** number→px、small=20px/medium=24px/large=35px、"inherit" や "1rem" 等の文字列も可。 */
  fontSize?: IconFontSize;
  /** currentColor（fill/stroke）に適用する色。MUI の sx color 相当。 */
  color?: string;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

export interface IconComponent {
  (props: Readonly<IconProps>): ReactNode;
  displayName?: string;
}

/** MUI SvgIcon の semantic color 名 → CSS 値（gv トークン）。生の CSS 色はそのまま通す。 */
const SEMANTIC_COLORS: Record<string, string> = {
  primary: 'var(--gv-color-primary-main)',
  secondary: 'var(--gv-color-text-secondary)',
  error: 'var(--gv-color-error-main)',
  inherit: 'inherit',
};

export function resolveColor(color?: string): string | undefined {
  if (color == null) return undefined;
  return SEMANTIC_COLORS[color] ?? color;
}

export function resolveFontSize(fontSize?: IconFontSize): string {
  if (fontSize == null) return '1.5rem';
  if (typeof fontSize === 'number') return `${fontSize}px`;
  switch (fontSize) {
    case 'small':
      return '1.25rem';
    case 'medium':
      return '1.5rem';
    case 'large':
      return '2.1875rem';
    default:
      return fontSize;
  }
}

/**
 * 任意の SVG 子要素を内包する汎用アイコン。ShapeIcons（自前 path/ellipse）が使用する。
 * MUI `<SvgIcon>` の置換。
 */
export function SvgIcon({ fontSize, color, style, className, children, ...props }: Readonly<IconProps>) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
      aria-hidden="true"
      className={className}
      style={{ fontSize: resolveFontSize(fontSize), color: resolveColor(color), ...style }}
      {...props}
    >
      {children}
    </svg>
  );
}

/** 単一 path（または React 要素）から data-testid 付きアイコンコンポーネントを生成する。 */
export function createIcon(body: ReactNode, name: string, viewBox = '0 0 24 24'): IconComponent {
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
