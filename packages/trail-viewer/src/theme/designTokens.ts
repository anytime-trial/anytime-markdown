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
  sectionBg: 'rgba(255,255,255,0.05)',
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
  apiInference: '#26C6DA',
  toolExec: '#FF7043',
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
  sectionBg: 'rgba(0,0,0,0.03)',
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
  apiInference: '#00838F',
  toolExec: '#E64A19',
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
  readonly sectionBg: string;
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
  readonly apiInference: string;
  readonly toolExec: string;
}

export interface ThemeAvatarColors {
  readonly user: string;
  readonly system: string;
  readonly tool: string;
  readonly assistant: string;
}

export interface ThemeToolActionColors {
  readonly bash: string;
  readonly edit: string;
  readonly write: string;
  readonly read: string;
  readonly task: string;
  readonly other: string;
  readonly plain: string;
}

export interface ThemeModelColors {
  readonly opus: string;
  readonly sonnet: string;
  readonly haiku: string;
  readonly unknown: string;
}

export interface ThemeModelCostColors {
  readonly opus: string;
  readonly sonnet: string;
  readonly haiku: string;
}

export interface ThemeCostChartColors {
  readonly actual: string;
  readonly skill: string;
}

export interface ThemeDoraColors {
  readonly elite: string;
  readonly high: string;
  readonly medium: string;
  readonly low: string;
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
  /** カテゴリ色パレット（先頭3色が定義済み。それ以外は Context で動的生成）*/
  readonly commitCategoryColors: readonly string[];
  /** ツールカテゴリ色パレット（先頭5色が定義済み。それ以外は Context で動的生成）*/
  readonly toolCategoryColors: readonly string[];
  /** スキルカテゴリ色パレット（先頭5色が定義済み。それ以外は Context で動的生成）*/
  readonly skillCategoryColors: readonly string[];
  readonly toolActionColors: ThemeToolActionColors;
  readonly modelColors: ThemeModelColors;
  readonly modelCostColors: ThemeModelCostColors;
  readonly costChartColors: ThemeCostChartColors;
  readonly doraColors: ThemeDoraColors;
  /** Analytics palette for session/workspace series */
  readonly analyticsPalette: readonly string[];
  /** Release chart series colors */
  readonly releaseColors: Readonly<{ succeeded: string; failed: string }>;
}

// ---------------------------------------------------------------------------
//  Factory
// ---------------------------------------------------------------------------

// Mode-independent color maps

const toolActionColors: ThemeToolActionColors = {
  bash:  '#4CAF50',
  edit:  '#2196F3',
  write: '#9C27B0',
  read:  '#757575',
  task:  '#FFB300',
  other: '#FF9800',
  plain: '#90A4AE',
} as const;

const modelColors: ThemeModelColors = {
  opus:    '#7C4DFF',
  sonnet:  '#42A5F5',
  haiku:   '#66BB6A',
  unknown: '#90A4AE',
} as const;

const modelCostColors: ThemeModelCostColors = {
  opus:   '#7b1fa2',
  sonnet: '#1976d2',
  haiku:  '#00897b',
} as const;

const costChartColors: ThemeCostChartColors = {
  actual: '#1976d2',
  skill:  '#8b5cf6',
} as const;

const darkDoraColors: ThemeDoraColors = {
  elite:  '#42A5F5',
  high:   '#66BB6A',
  medium: '#FFA726',
  low:    '#F44336',
} as const;

const lightDoraColors: ThemeDoraColors = {
  elite:  '#1976D2',
  high:   '#2E7D32',
  medium: '#ED6C02',
  low:    '#D32F2F',
} as const;

const analyticsPalette = [
  '#EC4899', '#14B8A6', '#F59E0B', '#8b5cf6', '#EF4444', '#10B981', '#3B82F6', '#F97316',
] as const;

const releaseColors = {
  succeeded: '#4CAF50',
  failed:    '#f44336',
} as const;

const darkToolPalette = [
  '#66BB6A', '#90CAF9', '#FFD54F', '#CE93D8', '#FF8A65',
  '#4DD0E1', '#F48FB1', '#80DEEA', '#EF9A9A', '#A5D6A7',
  '#B39DDB', '#FFE082', '#80CBC4', '#FFAB40', '#81D4FA',
] as const;

const lightToolPalette = [
  '#388E3C', '#1565C0', '#F9A825', '#7B1FA2', '#E64A19',
  '#00838F', '#AD1457', '#00695C', '#C62828', '#2E7D32',
  '#4527A0', '#F57F17', '#006064', '#880E4F', '#0277BD',
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
    commitCategoryColors: isDark
      ? ['#66BB6A', '#EF5350', '#FFA726']  // 緑・赤・黄 (dark)
      : ['#388E3C', '#D32F2F', '#F57C00'], // 緑・赤・黄 (light)
    toolCategoryColors: isDark
      ? ['#66BB6A', '#90CAF9', '#FFD54F', '#FF8A65', 'rgba(255,255,255,0.35)']
      : ['#388E3C', '#1565C0', '#F9A825',  '#E64A19', 'rgba(0,0,0,0.30)'],
    skillCategoryColors: isDark
      ? ['#66BB6A', '#4DD0E1', '#CE93D8', '#FFB74D', 'rgba(255,255,255,0.35)']
      : ['#2E7D32', '#00838F', '#7B1FA2',  '#E65100', 'rgba(0,0,0,0.30)'],
    toolActionColors,
    modelColors,
    modelCostColors,
    costChartColors,
    doraColors: isDark ? darkDoraColors : lightDoraColors,
    analyticsPalette,
    releaseColors,
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

// ---------------------------------------------------------------------------
//  Direct exports for mode-independent constants (for module-level use)
// ---------------------------------------------------------------------------

export { toolActionColors, modelColors, modelCostColors, costChartColors, analyticsPalette, releaseColors };

/** Subagent track palette (MessageTimeline). 10 distinct hues for subagent lanes. */
export const agentPalette = [
  '#FF6B6B', '#4ECDC4', '#FFD93D', '#6A4C93', '#1982C4',
  '#8AC926', '#F48C06', '#E56B6F', '#52B788', '#B5838D',
] as const;

/** Specific chart series color for Lead Time / LOC overlay line (AnalyticsPanel). */
export const LEAD_TIME_LOC_COLOR = '#F06292';

/** Brand colors keyed by agent source value (sessions.source in trail.db). */
export const agentBrandColors: Readonly<Record<string, string>> = {
  claude_code: '#CC785C',  // Anthropic / Claude – copper terracotta
  codex:       '#10A37F',  // OpenAI – signature green
  gemini:      '#4285F4',  // Google / Gemini – Google Blue
  cursor:      '#2563EB',  // Cursor – blue
} as const;

/**
 * sessions.source → チャートの表示ラベル。
 *
 * 集計側（TrailDatabase の SQL / CombinedDataReader）が source を表示ラベルへ畳んでから
 * 返すため、チャートが受け取る agent 名は source 値ではなくこのラベルになる。
 * 色引きに source 値をそのまま使うと常に undefined になり、ブランド色が失われる。
 */
export const agentDisplayLabels: Readonly<Record<string, string>> = {
  claude_code: 'Claude Code',
  codex:       'Codex',
  gemini:      'Gemini',
  cursor:      'Cursor',
} as const;

/** 表示ラベル → ブランド色。agentBrandColors から派生させ、二重管理を避ける。 */
const agentBrandColorByLabel = new Map<string, string>(
  Object.entries(agentDisplayLabels)
    .map(([source, label]) => [label, agentBrandColors[source]] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
);

/**
 * チャートの表示ラベルからブランド色を返す。未知のラベル（capTopN が畳む 'Others' など）は
 * undefined を返し、呼び出し側が汎用パレットへフォールバックする。
 */
export function getAgentBrandColor(displayLabel: string): string | undefined {
  return agentBrandColorByLabel.get(displayLabel);
}

/** Per-tier copper shades for Claude models (dark → light = opus → haiku). */
const claudeModelColors = {
  opus:   '#8D4E32',  // dark copper
  sonnet: '#CC785C',  // base copper (= agentBrandColors.claude_code)
  haiku:  '#E8A87C',  // light copper
} as const;

/**
 * Returns a brand-based color for a model name, or undefined when the brand
 * is unknown (caller should fall back to a generic palette).
 */
export function getModelBrandColor(model: string): string | undefined {
  const m = model.toLowerCase();
  if (m.startsWith('claude')) {
    if (m.includes('opus'))   return claudeModelColors.opus;
    if (m.includes('sonnet')) return claudeModelColors.sonnet;
    if (m.includes('haiku'))  return claudeModelColors.haiku;
    return agentBrandColors.claude_code;
  }
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) {
    return agentBrandColors.codex;
  }
  if (m.startsWith('gemini')) {
    return agentBrandColors.gemini;
  }
  if (m.startsWith('cursor')) {
    return agentBrandColors.cursor;
  }
  return undefined;
}
