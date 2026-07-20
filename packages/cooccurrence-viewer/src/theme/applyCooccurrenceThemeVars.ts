import type { ThemeMode } from '../types';

const CLUSTER_COLORS_DARK = [
  '#90CAF9',
  '#66BB6A',
  '#9B7BD8',
  '#E8A012',
  '#F44336',
  '#42A5F5',
  '#E3F2FD',
  '#238636',
];

const CLUSTER_COLORS_LIGHT = [
  '#3D4A52',
  '#4B5A3E',
  '#4A5A6B',
  '#E8A012',
  '#6B2A20',
  '#8A918F',
  '#222A30',
  '#238636',
];

export function applyCooccurrenceThemeVars(target: HTMLElement, mode: ThemeMode): void {
  const vars: Record<string, string> = mode === 'dark'
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
  const clusters = mode === 'dark' ? CLUSTER_COLORS_DARK : CLUSTER_COLORS_LIGHT;
  clusters.forEach((value, index) => target.style.setProperty(`--cooc-cluster-${index}`, value));
}
