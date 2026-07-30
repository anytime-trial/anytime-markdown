import type { CooccurrenceSkin, ThemeMode } from '../types';

export const CLUSTER_COLORS_DARK = [
  '#90CAF9',
  '#66BB6A',
  '#9B7BD8',
  '#E8A012',
  '#F44336',
  '#42A5F5',
  '#E3F2FD',
  '#238636',
];

export const CLUSTER_COLORS_LIGHT = [
  '#3D4A52',
  '#4B5A3E',
  '#4A5A6B',
  '#E8A012',
  '#6B2A20',
  '#8A918F',
  '#222A30',
  '#238636',
];

/**
 * OZ スキンのキャンディパレット（ライト/ダーク共通）。
 *
 * Why not モード別に分けるか: OZ の球はどちらのモードでも同じ高彩度色で浮かぶのが
 * 視覚言語の要（白の OZ / 夜の OZ の差は空間側の色で出す。要件書 §2.2・§2.3）。
 */
export const CLUSTER_COLORS_OZ = [
  '#FF6B6B',
  '#4FC3F7',
  '#FFD54F',
  '#4DD0A5',
  '#B39DDB',
  '#FFA726',
  '#F48FB1',
  '#4DD0E1',
];

const OZ_VARS_LIGHT: Record<string, string> = {
  // v2: シーン背景（ozRenderer の paletteOf）と同じ淡ラベンダー白。純白はピル地に譲る。
  '--cooc-bg': '#F4F5FB',
  '--cooc-surface': '#FFFFFF',
  '--cooc-text': '#1B2A4A',
  '--cooc-text-secondary': '#5A6B8C',
  '--cooc-text-disabled': '#9AA7C4',
  '--cooc-divider': 'rgba(27,42,74,0.12)',
  '--cooc-action-hover': 'rgba(27,42,74,0.05)',
  '--cooc-action-selected': 'rgba(27,42,74,0.10)',
  '--cooc-primary': '#4FC3F7',
  '--cooc-accent': '#FF6B6B',
  '--cooc-link': 'rgba(91,124,153,0.35)',
  '--cooc-muted-alpha': '0.18',
  '--cooc-tooltip-bg': '#FFFFFF',
};

const OZ_VARS_DARK: Record<string, string> = {
  '--cooc-bg': '#0A0F2E',
  '--cooc-surface': '#12183F',
  '--cooc-text': 'rgba(255,255,255,0.92)',
  '--cooc-text-secondary': 'rgba(255,255,255,0.62)',
  '--cooc-text-disabled': 'rgba(255,255,255,0.45)',
  '--cooc-divider': 'rgba(255,255,255,0.14)',
  '--cooc-action-hover': 'rgba(255,255,255,0.08)',
  '--cooc-action-selected': 'rgba(255,255,255,0.16)',
  '--cooc-primary': '#4FC3F7',
  '--cooc-accent': '#FFD54F',
  '--cooc-link': 'rgba(160,190,255,0.38)',
  '--cooc-muted-alpha': '0.2',
  '--cooc-tooltip-bg': '#12183F',
};

export function applyCooccurrenceThemeVars(
  target: HTMLElement,
  mode: ThemeMode,
  skin: CooccurrenceSkin = 'standard',
): void {
  const vars: Record<string, string> = skin === 'oz'
    ? (mode === 'dark' ? OZ_VARS_DARK : OZ_VARS_LIGHT)
    : mode === 'dark'
    ? {
      '--cooc-bg': '#0D1117',
      '--cooc-surface': '#121212',
      '--cooc-text': 'rgba(255,255,255,0.87)',
      '--cooc-text-secondary': 'rgba(255,255,255,0.60)',
      '--cooc-text-disabled': 'rgba(255,255,255,0.45)',
      '--cooc-divider': 'rgba(255,255,255,0.12)',
      '--cooc-action-hover': 'rgba(255,255,255,0.08)',
      '--cooc-action-selected': 'rgba(255,255,255,0.16)',
      '--cooc-primary': '#90CAF9',
      '--cooc-accent': '#E8A012',
      '--cooc-link': 'rgba(255,255,255,0.34)',
      '--cooc-muted-alpha': '0.2',
      '--cooc-tooltip-bg': '#121212',
    }
    : {
      '--cooc-bg': '#F2EFE8',
      '--cooc-surface': '#FBF9F3',
      '--cooc-text': '#1F1E1C',
      '--cooc-text-secondary': '#5C5A55',
      '--cooc-text-disabled': '#A9A6A0',
      '--cooc-divider': 'rgba(31,30,28,0.12)',
      '--cooc-action-hover': 'rgba(31,30,28,0.04)',
      '--cooc-action-selected': 'rgba(31,30,28,0.08)',
      '--cooc-primary': '#3D4A52',
      '--cooc-accent': '#E8A012',
      '--cooc-link': 'rgba(31,30,28,0.32)',
      '--cooc-muted-alpha': '0.18',
      '--cooc-tooltip-bg': '#FBF9F3',
    };

  for (const [name, value] of Object.entries(vars)) target.style.setProperty(name, value);
  const clusters = skin === 'oz' ? CLUSTER_COLORS_OZ : mode === 'dark' ? CLUSTER_COLORS_DARK : CLUSTER_COLORS_LIGHT;
  clusters.forEach((value, index) => target.style.setProperty(`--cooc-cluster-${index}`, value));
}
