/**
 * C4 Viewer Design Tokens — Dark / Light
 *
 * @see /prompt/design/anytime-trial.md
 * @see packages/graph-core/src/theme.ts (getCanvasColors pattern)
 */

import { interpolateDsmColor } from '@anytime-markdown/trail-core/c4';
import type { ArchitectureLayer } from '@anytime-markdown/trail-core/codeGraph';

// ---------------------------------------------------------------------------
// Mode-independent constants
// ---------------------------------------------------------------------------

export const POPUP_SHADOW = '0 8px 24px rgba(0,0,0,0.28)';
export const CONTEXT_MENU_SHADOW = '0 2px 8px rgba(0,0,0,0.2)';
export const LOADING_OVERLAY_BG = 'rgba(0,0,0,0.6)';
export const BADGE_TEXT_ON_COLOR = '#fff';
export const DOC_TYPE_FALLBACK_COLOR = '#757575';
export const DOC_TYPE_TEXT_COLOR = '#000';

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
  // Popup / overlay
  readonly popupBg: string;
  readonly popupBgStrong: string;
  // Context menu
  readonly contextMenuBg: string;
  readonly contextMenuBorder: string;
  readonly contextMenuText: string;
  // Heatmap tooltip
  readonly heatmapTooltipBg: string;
  readonly heatmapTooltipText: string;
  readonly heatmapTooltipBorder: string;
  // Code link
  readonly codeLink: string;
  // Flowchart node types
  readonly flowchartStart: string;
  readonly flowchartEnd: string;
  readonly flowchartProcess: string;
  readonly flowchartDecision: string;
  readonly flowchartLoop: string;
  readonly flowchartCall: string;
  readonly flowchartReturn: string;
  readonly flowchartError: string;
  // Overlay legend
  readonly overlayLegendBg: string;
  readonly overlayLegendText: string;
  readonly scrollbarThumb: string;
  // Architecture layer overlay（9 層・モジュール粒度）
  readonly layerColors: Record<ArchitectureLayer, string>;
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
  popupBg: 'rgba(18,18,18,0.92)',
  popupBgStrong: 'rgba(18,18,18,0.96)',
  contextMenuBg: '#2d2d2d',
  contextMenuBorder: '#555',
  contextMenuText: '#e0e0e0',
  heatmapTooltipBg: 'rgba(20,20,20,0.92)',
  heatmapTooltipText: '#fff',
  heatmapTooltipBorder: 'rgba(255,255,255,0.12)',
  codeLink: '#7ec8e3',
  flowchartStart: '#2e7d32',
  flowchartEnd: '#b71c1c',
  flowchartProcess: '#1565c0',
  flowchartDecision: '#e65100',
  flowchartLoop: '#4a148c',
  flowchartCall: '#00695c',
  flowchartReturn: '#37474f',
  flowchartError: '#c62828',
  overlayLegendBg: 'rgba(0,0,0,0.65)',
  overlayLegendText: '#e0e0e0',
  scrollbarThumb: 'rgba(255,255,255,0.2)',
  layerColors: {
    foundation: '#90a4ae',
    analysis: '#ba68c8',
    data: '#4fc3f7',
    'service-domain': '#aed581',
    'service-server': '#4db6ac',
    integration: '#ffb74d',
    'presentation-ui': '#f06292',
    'presentation-extension': '#9575cd',
    utility: '#a1887f',
  },
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
  popupBg: 'rgba(251,249,243,0.94)',
  popupBgStrong: 'rgba(251,249,243,0.98)',
  contextMenuBg: '#ffffff',
  contextMenuBorder: '#ccc',
  contextMenuText: '#333',
  heatmapTooltipBg: 'rgba(255,255,255,0.96)',
  heatmapTooltipText: '#111',
  heatmapTooltipBorder: 'rgba(0,0,0,0.12)',
  codeLink: '#0070c0',
  flowchartStart: '#66bb6a',
  flowchartEnd: '#ef5350',
  flowchartProcess: '#42a5f5',
  flowchartDecision: '#ffa726',
  flowchartLoop: '#ab47bc',
  flowchartCall: '#26a69a',
  flowchartReturn: '#90a4ae',
  flowchartError: '#ef9a9a',
  overlayLegendBg: 'rgba(255,255,255,0.85)',
  overlayLegendText: '#212121',
  scrollbarThumb: 'rgba(0,0,0,0.2)',
  layerColors: {
    foundation: '#607d8b',
    analysis: '#8e24aa',
    data: '#0288d1',
    'service-domain': '#689f38',
    'service-server': '#00897b',
    integration: '#ef6c00',
    'presentation-ui': '#d81b60',
    'presentation-extension': '#5e35b1',
    utility: '#6d4c41',
  },
};

export function getC4Colors(isDark: boolean): C4ThemeColors {
  return isDark ? DARK : LIGHT;
}

/**
 * DSM セルの背景色を返すコールバックを生成する。
 * @param colors C4 テーマカラー（対角セルの色に使用）
 * @param maxValue 行列内の最大依存数（色の正規化に使用）
 */
export function getDsmCellBackground(
  colors: C4ThemeColors,
  maxValue: number,
): (row: number, col: number, value: string) => string | undefined {
  return (row, col, value) => {
    if (row === col) return colors.diagonal;
    const v = Number(value);
    if (v > 0) {
      const t = maxValue > 0 ? v / maxValue : 1;
      return interpolateDsmColor(t);
    }
    return undefined;
  };
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
