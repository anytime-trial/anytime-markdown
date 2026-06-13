/**
 * vendored Material Design アイコン基盤（Apache-2.0）。
 * graph-viewer が使うアイコンの SVG 要素のみ自前化する。
 * 出典: Material Symbols / Material Icons (https://fonts.google.com/icons)。
 *
 * React 版 SvgIcon.tsx の vanilla 移植。document.createElementNS で構築するため
 * React / DOM ライブラリに依存しない。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconFontSize = number | 'small' | 'medium' | 'large' | 'inherit' | (string & {});

export interface IconOptions {
  /** number→px、small=20px/medium=24px/large=35px、"inherit" や "1rem" 等の文字列も可。 */
  fontSize?: IconFontSize;
  /** currentColor（fill/stroke）に適用する色。MUI の sx color 相当。 */
  color?: string;
  className?: string;
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
 * SVG 子要素の記述子。path または circle を表す。
 * - `{ tag: 'path'; d: string }` — `<path d="..."/>`
 * - `{ tag: 'circle'; cx: number; cy: number; r: number }` — `<circle cx cy r/>`
 */
export type SvgChild =
  | { readonly tag: 'path'; readonly d: string }
  | { readonly tag: 'circle'; readonly cx: number; readonly cy: number; readonly r: number };

/**
 * 複数の SVG 子要素を内包する汎用アイコン SVG 要素を生成する。
 * MUI `<SvgIcon>` の vanilla 置換。
 *
 * @param children - path / circle の記述子配列
 * @param opts     - サイズ・色オプション
 * @param viewBox  - SVG viewBox（既定 "0 0 24 24"）
 */
export function createSvgIcon(
  children: readonly SvgChild[],
  opts: Readonly<IconOptions> = {},
  viewBox = '0 0 24 24',
): SVGSVGElement {
  const { fontSize, color, className } = opts;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  if (className) {
    svg.setAttribute('class', className);
  }
  svg.style.fontSize = resolveFontSize(fontSize);
  const resolvedColor = resolveColor(color);
  if (resolvedColor != null) {
    svg.style.color = resolvedColor;
  }
  for (const child of children) {
    if (child.tag === 'path') {
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute('d', child.d);
      svg.appendChild(el);
    } else {
      const el = document.createElementNS(SVG_NS, 'circle');
      el.setAttribute('cx', String(child.cx));
      el.setAttribute('cy', String(child.cy));
      el.setAttribute('r', String(child.r));
      svg.appendChild(el);
    }
  }
  return svg;
}

/**
 * 単一 path から名前付きアイコン factory を生成する。
 *
 * 返す factory 関数のシグネチャ:
 *   `(opts?: Readonly<IconOptions>) => SVGSVGElement`
 *
 * @param children - path / circle の記述子配列（複数可）
 * @param name     - アイコン名（data-testid="${name}Icon" に使用）
 * @param viewBox  - SVG viewBox（既定 "0 0 24 24"）
 */
export function createIcon(
  children: readonly SvgChild[],
  name: string,
  viewBox = '0 0 24 24',
): (opts?: Readonly<IconOptions>) => SVGSVGElement {
  return function iconFactory(opts: Readonly<IconOptions> = {}): SVGSVGElement {
    // createSvgIcon と同一構築のため委譲し、名前付きアイコン固有の data-testid のみ付与する。
    const svg = createSvgIcon(children, opts, viewBox);
    svg.setAttribute('data-testid', `${name}Icon`);
    return svg;
  };
}

/** path 記述子を作るショートハンド。 */
export function p(d: string): SvgChild {
  return { tag: 'path', d };
}

/** circle 記述子を作るショートハンド。 */
export function c(cx: number, cy: number, r: number): SvgChild {
  return { tag: 'circle', cx, cy, r };
}
