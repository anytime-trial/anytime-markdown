/**
 * C4 Viewer Design Tokens — Dark / Light
 *
 * @see /prompt/design/anytime-trial.md
 * @see packages/graph-core/src/theme.ts (getCanvasColors pattern)
 */

export interface C4ThemeColors {
  readonly bg: string;
  readonly bgSecondary: string;
  readonly accent: string;
  readonly border: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly grid: string;
  readonly hover: string;
  readonly focus: string;
  readonly diagonal: string;
  readonly groupLine: string;
  readonly tooltipBg: string;
  readonly tooltipBorder: string;
  readonly focusRing: string;
  readonly scopeBorder: string;
  readonly cycleBorder: string;
  readonly dependency: string;
  readonly deletedAlpha: number;
}

const DARK: C4ThemeColors = {
  bg: '#0D1117',
  bgSecondary: '#121212',
  accent: '#90CAF9',
  border: 'rgba(255,255,255,0.12)',
  text: '#cccccc',
  textSecondary: 'rgba(255,255,255,0.70)',
  textMuted: 'rgba(255,255,255,0.45)',
  grid: '#3c3c3c',
  hover: 'rgba(255,255,255,0.16)',
  focus: 'rgba(144,202,249,0.15)',
  diagonal: '#333333',
  groupLine: '#888888',
  tooltipBg: '#252526',
  tooltipBorder: '#555',
  focusRing: '#4FC3F7',
  scopeBorder: '#FFB74D',
  cycleBorder: '#F44336',
  dependency: '#90CAF9',
  deletedAlpha: 0.3,
};

const LIGHT: C4ThemeColors = {
  bg: '#F5F5F0',
  bgSecondary: '#FFFFFF',
  accent: '#1976D2',
  border: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A',
  textSecondary: 'rgba(0,0,0,0.60)',
  textMuted: 'rgba(0,0,0,0.38)',
  grid: 'rgba(0,0,0,0.10)',
  hover: 'rgba(0,0,0,0.06)',
  focus: 'rgba(25,118,210,0.12)',
  diagonal: '#E0E0E0',
  groupLine: '#BDBDBD',
  tooltipBg: '#FFFFFF',
  tooltipBorder: 'rgba(0,0,0,0.15)',
  focusRing: '#1976D2',
  scopeBorder: '#E65100',
  cycleBorder: '#D32F2F',
  dependency: '#1976D2',
  deletedAlpha: 0.35,
};

export function getC4Colors(isDark: boolean): C4ThemeColors {
  return isDark ? DARK : LIGHT;
}

/** Document type badge colors (theme-independent). */
export const DOC_TYPE_COLORS: Readonly<Record<string, string>> = {
  spec: '#4FC3F7',
  tech: '#81C784',
  plan: '#FFB74D',
  review: '#CE93D8',
  report: '#F48FB1',
  test: '#A5D6A7',
  manual: '#90A4AE',
};
