/**
 * Anytime Trial Design System — Graph Editor Color Tokens
 *
 * @see /prompt/design/anytime-trial.md
 */

// ── Primary ──
const COLOR_ICE_BLUE = '#90CAF9';
const COLOR_AMBER_GOLD = '#E8A012';
const COLOR_MIDNIGHT_NAVY = '#0D1117';
export const COLOR_CHARCOAL = '#121212';

// ── Text ──
export const COLOR_TEXT_PRIMARY = '#FFFFFF';

// ── Surface & Border ──
export const COLOR_BORDER_ACTIVE = 'rgba(255,255,255,0.24)';

// ── Shadow ──
export const COLOR_SHADOW = 'rgba(0, 0, 0, 0.35)';
export const COLOR_SHADOW_LIGHT = 'rgba(0, 0, 0, 0.2)';

// ── Effect ──
export const COLOR_DRAG_GLOW = 'rgba(144, 202, 249, 0.3)';

// ── Canvas-specific ──
export const CANVAS_BG = COLOR_MIDNIGHT_NAVY;

// ── Sticky default ──
export const STICKY_FILL = COLOR_AMBER_GOLD;
export const STICKY_STROKE = 'rgba(232,160,18,0.6)';

// ── Doc node ──
export const DOC_FILL = '#1A1A2E';
export const DOC_STROKE = 'rgba(206,147,216,0.3)';

// ── Frame node ──
export const FRAME_FILL = 'rgba(255,255,255,0.03)';
export const FRAME_STROKE = 'rgba(255,255,255,0.15)';

// ── Typography ──
export const FONT_FAMILY = 'Roboto, Helvetica, Arial, sans-serif';

// ── Theme-aware color set ──
export interface CanvasColors {
  canvasBg: string;
  canvasGrid: string;
  canvasSelection: string;
  canvasSelectionFill: string;
  canvasSnap: string;
  canvasSnapInner: string;
  canvasSmartGuide: string;
  textPrimary: string;
  textSecondary: string;
  textOnLight: string;
  lockIcon: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  invalidTarget: string;
  handleFill: string;
  edgeLabelBg: string;
  docFill: string;
  docStroke: string;
  docIconColor: string;
  frameFill: string;
  frameStroke: string;
  frameTitleBg: string;
  // UI panel colors
  panelBg: string;
  panelBorder: string;
  modalBg: string;
  accentColor: string;
  hoverBg: string;
}

const DARK_COLORS: CanvasColors = {
  canvasBg: COLOR_MIDNIGHT_NAVY,
  canvasGrid: 'rgba(255,255,255,0.06)',
  canvasSelection: COLOR_ICE_BLUE,
  canvasSelectionFill: 'rgba(144,202,249,0.08)',
  canvasSnap: COLOR_AMBER_GOLD,
  canvasSnapInner: COLOR_MIDNIGHT_NAVY,
  canvasSmartGuide: COLOR_ICE_BLUE,
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.78)',
  textOnLight: 'rgba(0,0,0,0.87)',
  lockIcon: 'rgba(255,255,255,0.7)',
  tooltipBg: 'rgba(13, 17, 23, 0.9)',
  tooltipBorder: 'rgba(144, 202, 249, 0.3)',
  tooltipText: COLOR_ICE_BLUE,
  invalidTarget: 'rgba(244, 67, 54, 0.6)',
  handleFill: COLOR_CHARCOAL,
  edgeLabelBg: COLOR_MIDNIGHT_NAVY,
  docFill: '#1A1A2E',
  docStroke: 'rgba(206,147,216,0.3)',
  docIconColor: '#CE93D8',
  frameFill: 'rgba(255,255,255,0.03)',
  frameStroke: 'rgba(255,255,255,0.15)',
  frameTitleBg: 'rgba(255,255,255,0.08)',
  panelBg: COLOR_CHARCOAL,
  panelBorder: 'rgba(255,255,255,0.12)',
  modalBg: COLOR_MIDNIGHT_NAVY,
  accentColor: COLOR_ICE_BLUE,
  hoverBg: 'rgba(255,255,255,0.16)',
};

const LIGHT_COLORS: CanvasColors = {
  canvasBg: '#F2EFE8',
  canvasGrid: 'rgba(0,0,0,0.08)',
  canvasSelection: '#3D4A52',
  canvasSelectionFill: 'rgba(61,74,82,0.08)',
  canvasSnap: '#C77C00',
  canvasSnapInner: '#F2EFE8',
  canvasSmartGuide: '#3D4A52',
  textPrimary: '#1F1E1C',
  textSecondary: '#5C5A55',
  textOnLight: 'rgba(0,0,0,0.87)',
  lockIcon: 'rgba(0,0,0,0.5)',
  tooltipBg: 'rgba(251,249,243,0.95)',
  tooltipBorder: 'rgba(31,30,28,0.15)',
  tooltipText: '#3D4A52',
  invalidTarget: 'rgba(211, 47, 47, 0.5)',
  handleFill: '#FBF9F3',
  edgeLabelBg: '#F2EFE8',
  docFill: '#F5F0FF',
  docStroke: 'rgba(142,68,173,0.3)',
  docIconColor: '#8E44AD',
  frameFill: 'rgba(0,0,0,0.02)',
  frameStroke: 'rgba(0,0,0,0.12)',
  frameTitleBg: 'rgba(0,0,0,0.05)',
  panelBg: '#FBF9F3',
  panelBorder: 'rgba(31,30,28,0.12)',
  modalBg: '#FBF9F3',
  accentColor: '#3D4A52',
  hoverBg: 'rgba(31,30,28,0.04)',
};

/** Get theme-aware color set */
export function getCanvasColors(isDark: boolean): CanvasColors {
  return isDark ? DARK_COLORS : LIGHT_COLORS;
}
