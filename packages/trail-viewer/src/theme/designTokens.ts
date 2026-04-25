/**
 * Design tokens from Anytime Trial design system.
 * Supports dark / light mode via `getTokens(isDark)`.
 * @see /Shared/anytime-markdown-docs/spec/12.design/design.md
 */

// ---------------------------------------------------------------------------
//  Radius (mode-independent)
// ---------------------------------------------------------------------------

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
} as const;

// ---------------------------------------------------------------------------
//  Dark-mode tokens (original)
// ---------------------------------------------------------------------------

const darkColors = {
  // Primary
  iceBlue: '#90CAF9',
  amberGold: '#E8A012',
  midnightNavy: '#0D1117',
  charcoal: '#121212',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.70)',
  textDisabled: 'rgba(255,255,255,0.45)',
  textOnLight: 'rgba(0,0,0,0.87)',

  // Surface & Border
  border: 'rgba(255,255,255,0.12)',
  hoverBg: 'rgba(255,255,255,0.16)',
  activeBg: 'rgba(255,255,255,0.24)',
  iceBlueBg: 'rgba(144,202,249,0.08)',
  iceBlueSubtle: 'rgba(144,202,249,0.15)',

  // Semantic
  success: '#66BB6A',
  successBg: 'rgba(102,187,106,0.12)',
  error: '#EF5350',
  errorBg: 'rgba(239,83,80,0.12)',
  warning: '#FFA726',
  warningBg: 'rgba(255,167,38,0.12)',
  info: '#42A5F5',
  infoBg: 'rgba(66,165,245,0.12)',
  amberGoldHover: '#d4920e',
  iceBlueBorder: 'rgba(144,202,249,0.3)',
} as const;

const darkChartColors = {
  input: '#90CAF9',
  output: '#EF5350',
  cacheRead: '#66BB6A',
  cacheWrite: '#E8A012',
  cumulativeTime: '#CE93D8',
  primary: '#90CAF9',
  skill: '#8b5cf6',
  overlayPerLoc: '#FFB74D',
} as const;

const darkAvatarColors = {
  user: '#66BB6A',
  system: 'rgba(255,255,255,0.30)',
  tool: '#E8A012',
  assistant: '#90CAF9',
} as const;

// ---------------------------------------------------------------------------
//  Light-mode tokens
// ---------------------------------------------------------------------------

const lightColors: ThemeColors = {
  iceBlue: '#1976D2',
  amberGold: '#E8A012',
  midnightNavy: '#E8E6E1',
  charcoal: '#FFFFFF',

  textPrimary: 'rgba(0,0,0,0.87)',
  textSecondary: 'rgba(0,0,0,0.60)',
  textDisabled: 'rgba(0,0,0,0.45)',
  textOnLight: 'rgba(0,0,0,0.87)',

  border: 'rgba(0,0,0,0.12)',
  hoverBg: 'rgba(0,0,0,0.04)',
  activeBg: 'rgba(0,0,0,0.08)',
  iceBlueBg: 'rgba(25,118,210,0.08)',
  iceBlueSubtle: 'rgba(25,118,210,0.12)',

  success: '#388E3C',
  successBg: 'rgba(56,142,60,0.12)',
  error: '#D32F2F',
  errorBg: 'rgba(211,47,47,0.12)',
  warning: '#F57C00',
  warningBg: 'rgba(245,124,0,0.12)',
  info: '#01579B',
  infoBg: 'rgba(1,87,155,0.12)',
  amberGoldHover: '#c47e00',
  iceBlueBorder: 'rgba(25,118,210,0.3)',
} as const;

const lightChartColors: ThemeChartColors = {
  input: '#1976D2',
  output: '#D32F2F',
  cacheRead: '#388E3C',
  cacheWrite: '#E8A012',
  cumulativeTime: '#7B1FA2',
  primary: '#1976D2',
  skill: '#7c3aed',
  overlayPerLoc: '#E65100',
} as const;

const lightAvatarColors: ThemeAvatarColors = {
  user: '#388E3C',
  system: 'rgba(0,0,0,0.26)',
  tool: '#E8A012',
  assistant: '#1976D2',
} as const;

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface ThemeColors {
  readonly iceBlue: string;
  readonly amberGold: string;
  readonly midnightNavy: string;
  readonly charcoal: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textDisabled: string;
  readonly textOnLight: string;
  readonly border: string;
  readonly hoverBg: string;
  readonly activeBg: string;
  readonly iceBlueBg: string;
  readonly iceBlueSubtle: string;
  readonly success: string;
  readonly successBg: string;
  readonly error: string;
  readonly errorBg: string;
  readonly warning: string;
  readonly warningBg: string;
  readonly info: string;
  readonly infoBg: string;
  readonly amberGoldHover: string;
  readonly iceBlueBorder: string;
}

export interface ThemeChartColors {
  readonly input: string;
  readonly output: string;
  readonly cacheRead: string;
  readonly cacheWrite: string;
  readonly cumulativeTime: string;
  readonly primary: string;
  readonly skill: string;
  readonly overlayPerLoc: string;
}

export interface ThemeAvatarColors {
  readonly user: string;
  readonly system: string;
  readonly tool: string;
  readonly assistant: string;
}

export interface TrailThemeTokens {
  readonly isDark: boolean;
  readonly colors: ThemeColors;
  readonly chartColors: ThemeChartColors;
  readonly avatarColors: ThemeAvatarColors;
  readonly radius: typeof radius;
  readonly cardSx: {
    readonly bgcolor: string;
    readonly border: string;
    readonly borderRadius: string;
  };
  readonly codeSx: {
    readonly bgcolor: string;
    readonly borderRadius: string;
    readonly fontFamily: string;
    readonly fontSize: string;
  };
  readonly scrollbarSx: Record<string, unknown>;
  readonly toolPalette: readonly string[];
  readonly commitColors: Readonly<{
    feat: string; fix: string; refactor: string; test: string; other: string;
  }>;
}

// ---------------------------------------------------------------------------
//  Factory
// ---------------------------------------------------------------------------

const darkToolPalette = [
  '#90CAF9', '#8b5cf6', '#00897b', '#e65100', '#c62828',
  '#7b1fa2', '#0288d1', '#f57f17', '#2e7d32', '#ad1457',
  '#4527a0', '#00838f', '#558b2f', '#6d4c41', '#546e7a',
] as const;

const lightToolPalette = [
  '#1565C0', '#6d28d9', '#00695c', '#bf360c', '#b71c1c',
  '#6a1b9a', '#01579b', '#e65100', '#1b5e20', '#880e4f',
  '#311b92', '#006064', '#33691e', '#4e342e', '#37474f',
] as const;

const darkCommitColors = {
  feat: '#66BB6A', fix: '#EF5350', refactor: '#42A5F5',
  test: '#FFA726', other: 'rgba(255,255,255,0.30)',
} as const;

const lightCommitColors = {
  feat: '#388E3C', fix: '#D32F2F', refactor: '#1565C0',
  test: '#F57C00', other: 'rgba(0,0,0,0.30)',
} as const;

export function getTokens(isDark: boolean): TrailThemeTokens {
  const c = isDark ? darkColors : lightColors;
  return {
    isDark,
    colors: c,
    chartColors: isDark ? darkChartColors : lightChartColors,
    avatarColors: isDark ? darkAvatarColors : lightAvatarColors,
    radius,
    cardSx: {
      bgcolor: c.charcoal,
      border: `1px solid ${c.border}`,
      borderRadius: radius.lg,
    },
    codeSx: {
      bgcolor: c.midnightNavy,
      borderRadius: radius.md,
      fontFamily: 'Roboto Mono, monospace',
      fontSize: '0.75rem',
    },
    toolPalette: isDark ? darkToolPalette : lightToolPalette,
    commitColors: isDark ? darkCommitColors : lightCommitColors,
    scrollbarSx: {
      scrollbarWidth: 'thin',
      scrollbarColor: `${c.textDisabled} transparent`,
      '&::-webkit-scrollbar': { width: 6 },
      '&::-webkit-scrollbar-track': { background: 'transparent' },
      '&::-webkit-scrollbar-thumb': {
        background: c.textDisabled,
        borderRadius: 3,
      },
      '&::-webkit-scrollbar-thumb:hover': {
        background: c.textSecondary,
      },
    },
  };
}

// ---------------------------------------------------------------------------
//  Legacy static exports (dark-mode defaults, for backward compatibility)
// ---------------------------------------------------------------------------

export const colors = darkColors;
export const chartColors = darkChartColors;
export const avatarColors = darkAvatarColors;
export const cardSx = {
  bgcolor: darkColors.charcoal,
  border: `1px solid ${darkColors.border}`,
  borderRadius: radius.lg,
} as const;
export const codeSx = {
  bgcolor: darkColors.midnightNavy,
  borderRadius: radius.md,
  fontFamily: 'Roboto Mono, monospace',
  fontSize: '0.75rem',
} as const;
