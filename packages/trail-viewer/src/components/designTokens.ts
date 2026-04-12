/**
 * Design tokens from Anytime Trial design system.
 * Supports dark / light mode via `getTokens(isDark)`.
 * @see /Shared/prompt/design/anytime-trial.md
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
} as const;

const darkChartColors = {
  input: '#90CAF9',
  output: '#EF5350',
  cacheRead: '#66BB6A',
  cacheWrite: '#E8A012',
  primary: '#90CAF9',
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
  midnightNavy: '#FAFAFA',
  charcoal: '#FFFFFF',

  textPrimary: 'rgba(0,0,0,0.87)',
  textSecondary: 'rgba(0,0,0,0.60)',
  textDisabled: 'rgba(0,0,0,0.38)',
  textOnLight: 'rgba(0,0,0,0.87)',

  border: 'rgba(0,0,0,0.12)',
  hoverBg: 'rgba(0,0,0,0.04)',
  activeBg: 'rgba(0,0,0,0.08)',
  iceBlueBg: 'rgba(25,118,210,0.08)',
  iceBlueSubtle: 'rgba(25,118,210,0.12)',

  success: '#66BB6A',
  successBg: 'rgba(102,187,106,0.12)',
  error: '#EF5350',
  errorBg: 'rgba(239,83,80,0.12)',
  warning: '#FFA726',
  warningBg: 'rgba(255,167,38,0.12)',
  info: '#42A5F5',
  infoBg: 'rgba(66,165,245,0.12)',
} as const;

const lightChartColors: ThemeChartColors = {
  input: '#1976D2',
  output: '#D32F2F',
  cacheRead: '#388E3C',
  cacheWrite: '#E8A012',
  primary: '#1976D2',
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
}

export interface ThemeChartColors {
  readonly input: string;
  readonly output: string;
  readonly cacheRead: string;
  readonly cacheWrite: string;
  readonly primary: string;
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
}

// ---------------------------------------------------------------------------
//  Factory
// ---------------------------------------------------------------------------

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
    scrollbarSx: {
      scrollbarWidth: 'thin',
      scrollbarColor: isDark ? 'rgba(255,255,255,0.45) transparent' : 'rgba(0,0,0,0.4) transparent',
      '&::-webkit-scrollbar': { width: 6 },
      '&::-webkit-scrollbar-track': { background: 'transparent' },
      '&::-webkit-scrollbar-thumb': {
        background: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
        borderRadius: 3,
      },
      '&::-webkit-scrollbar-thumb:hover': {
        background: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)',
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
